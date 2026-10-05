# Architecture

This document explains how the Cloud DevOps Platform is put together, from a single HTTP request up to the AWS account. Each design choice links to an [Architecture Decision Record](adr/).

## 1. System context

```mermaid
flowchart TB
  user([Engineer / viewer]) -->|HTTPS| platform
  ci([GitHub Actions]) -->|deployment events<br/>Bearer token| platform
  ci -->|images| ghcr[(GHCR)]
  ci -->|image tag commits| git[(GitHub repo)]
  platform[Cloud DevOps Platform<br/>on Amazon EKS] -->|pulls desired state| git
  platform -->|pulls signed images| ghcr
  platform -->|secrets| sm[(AWS Secrets Manager)]
  platform -->|TLS certificates| le[Let's Encrypt]
```

The platform has two kinds of users: **people** who look at delivery performance in the dashboard, and **pipelines** that report deployments to the API.

## 2. Application

### 2.1 Components

| Component | Tech | Responsibility |
|---|---|---|
| `web` | React 19 + Vite, served by `nginx-unprivileged` | Dashboard: four DORA tiles, daily deployments chart, service × environment matrix, recent deployments, platform info (which pod served the request) |
| `api` | Node.js 22, Fastify 5, zod, node-postgres, prom-client | Deployment ingest, DORA computation, health and metrics endpoints |
| `postgresql` | PostgreSQL 17 | Durable store for deployment events |

The web tier is static: the browser calls `/api/v1/*` on the same origin, and the Gateway routes `/api` to the API service. Same-origin serving removes CORS entirely and lets the Content-Security-Policy stay at `connect-src 'self'`.

### 2.2 Request path

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as AWS NLB
  participant E as Envoy proxy (Gateway)
  participant W as web pod (NGINX)
  participant A as api pod (Fastify)
  participant P as PostgreSQL
  B->>N: GET https://cloud-devops.example.com/
  N->>E: TCP (IP targets)
  E->>W: HTTPRoute "/" → Service web
  W-->>B: index.html + hashed assets (cached 1y)
  B->>N: GET /api/v1/dora?environment=prod&days=30
  N->>E: forward
  E->>A: HTTPRoute "/api" → Service api (stable / canary weights)
  A->>P: SELECT … WHERE environment=$1 AND started_at >= $2
  P-->>A: rows
  A->>A: computeDora() (pure function)
  A-->>B: JSON report
```

### 2.3 API design

* **Layering:** `server.ts` (HTTP, validation, auth) → `DeploymentRepository` interface → `PostgresRepository` or `MemoryRepository`. The DORA maths lives in `domain/dora.ts` as pure functions, so it is tested without any I/O.
* **Validation:** every request body and query string is parsed by a zod schema; invalid input returns `400` with field-level issues.
* **Auth:** write endpoints require `Authorization: Bearer <INGEST_TOKEN>`. Tokens are compared as SHA-256 digests with `crypto.timingSafeEqual` (constant time, equal length).
* **Resilience:** `/healthz` checks only the process (used by liveness), `/readyz` also pings the database (used by readiness) — a database outage removes pods from load balancing without restart storms. On `SIGTERM` the API fails readiness first, keeps serving for `SHUTDOWN_DELAY_MS`, then closes the server and pool.
* **Migrations:** versioned SQL in code, applied inside a transaction under a PostgreSQL advisory lock, run as an init container — replicas starting together never race.
* **Telemetry:** RED metrics (`http_requests_total`, `http_request_duration_seconds`) labelled by route template (bounded cardinality), a business counter `deployments_recorded_total`, Node.js runtime metrics, and JSON logs with request IDs.

### 2.4 Data model

```mermaid
erDiagram
  DEPLOYMENTS {
    uuid id PK
    text service "DNS-1123 label"
    text environment "dev | staging | prod"
    text version
    text commit_sha "7-40 hex chars"
    text status "in_progress | succeeded | failed | rolled_back"
    text triggered_by
    timestamptz commit_timestamp "for lead time"
    timestamptz started_at
    timestamptz finished_at
  }
  SCHEMA_MIGRATIONS {
    int version PK
    text name
    timestamptz applied_at
  }
```

Indexes on `(environment, started_at DESC)` and `(service, environment, started_at DESC)` serve the two hot queries (window scans and "latest per service").

### 2.5 DORA calculations

| Metric | Definition used | Elite | High | Medium | Low |
|---|---|---|---|---|---|
| Deployment frequency | successful deployments ÷ days in window | ≥ 1/day | ≥ 1/week | ≥ 1/month | less |
| Lead time for changes | median(`finished_at` − `commit_timestamp`) of successful deployments | < 1 day | < 1 week | < 1 month | more |
| Change failure rate | (failed + rolled back) ÷ finished deployments | ≤ 5% | ≤ 10% | ≤ 15% | more |
| Time to restore | median time from a failure to the next success of the same service | < 1 h | < 1 day | < 1 week | more |

## 3. Kubernetes design

### 3.1 Workloads per environment namespace

```mermaid
flowchart LR
  subgraph ns[namespace cloud-devops-prod · PSA restricted]
    rt1[HTTPRoute /] --> svcw[Service web]
    rt2[HTTPRoute /api<br/>stable 100 / canary 0] --> svca[Service api]
    rt2 --> svcc[Service api-canary]
    svcw --> dw[Deployment web<br/>HPA 2-6 · PDB]
    svca --> ra[Rollout api<br/>HPA 2-10 · PDB]
    svcc --> ra
    ra -->|init: migrate| db[(RDS or StatefulSet)]
    pm[PodMonitor] -.-> ra
    es[ExternalSecrets] --> sec[Secrets]
    sec --> ra
  end
```

### 3.2 Pod hardening (every container)

* `runAsNonRoot`, explicit UID/GID, `seccompProfile: RuntimeDefault`
* `readOnlyRootFilesystem: true` with small `emptyDir` volumes for `/tmp`
* `allowPrivilegeEscalation: false`, `capabilities: drop: [ALL]`
* `automountServiceAccountToken: false` — workloads never call the Kubernetes API
* Requests and limits on every container; topology spread across zones and nodes
* Namespaces enforce **Pod Security Admission `restricted`**; Kyverno additionally audits/enforces read-only root FS, probes, registries, tags and signatures

### 3.3 Availability

| Mechanism | Setting | Effect |
|---|---|---|
| Rolling update / canary | `maxUnavailable: 0`, `maxSurge: 1` | capacity never drops during a release |
| Startup / readiness / liveness probes | separate endpoints | slow starts tolerated; DB outages don't restart pods |
| `preStop` sleep + shutdown drain | 5 s | endpoints are removed before the process stops |
| PodDisruptionBudget | `minAvailable: 1`, `unhealthyPodEvictionPolicy: AlwaysAllow` | node drains keep a replica; stuck pods don't block drains |
| HPA | CPU 70%, memory 80%, fast scale-up / slow scale-down | absorbs load spikes, avoids flapping |
| Topology spread | zone then hostname | an AZ or node failure doesn't take all replicas |

### 3.4 Network policy (zero trust inside the cluster)

```mermaid
flowchart LR
  egw[envoy-gateway-system] -->|8080| web
  egw -->|3000| api
  mon[monitoring] -->|3000 /metrics| api
  api -->|5432| pg[(postgresql)]
  web -. denied .-x pg
  other[any other pod] -. denied .-x api
  all[all pods] -->|53| dns[kube-dns]
```

A namespace-wide **default deny** (ingress and egress) is followed by explicit allows. The e2e suite proves an unlabelled pod cannot reach the API or the database.

## 4. Platform (cluster add-ons)

All add-ons are Argo CD Applications declared in `gitops/bootstrap/values.yaml` and installed in **sync waves**:

| Wave | Add-on | Why it is needed |
|---|---|---|
| −10 | AppProjects | permission boundaries for platform vs. application |
| −4 | AWS Load Balancer Controller | provisions the NLB for the Gateway |
| −3 | Envoy Gateway (+ Gateway API CRDs) | north-south traffic, HTTPRoutes |
| −2 | cert-manager, External Secrets, Argo Rollouts, Kyverno, kube-prometheus-stack | CRDs and controllers the apps rely on |
| −1 | Loki, Grafana Alloy | log storage and collection |
| 0 | platform-config | Gateway, GatewayClass/EnvoyProxy, ClusterIssuer, ClusterSecretStore, Kyverno policies, plugin RBAC |
| 10 | cloud-devops-dev / -prod | the application |

## 5. AWS infrastructure

```mermaid
flowchart TB
  subgraph vpc[VPC 10.20.0.0/16 · 2-3 AZs]
    subgraph pub[Public subnets /24]
      nlb[NLB]
      nat[NAT gateway]
    end
    subgraph priv[Private subnets /20]
      nodes[EKS managed nodes<br/>AL2023 · IMDSv2 · gp3 encrypted]
    end
    subgraph db[Database subnets /24 · no internet route]
      rds[(RDS PostgreSQL 17<br/>optional)]
    end
  end
  cp[EKS control plane<br/>API + audit logs → CloudWatch] --- nodes
  nodes --> nat --> igw[Internet gateway]
  nlb --> nodes
  nodes -->|5432 SG-to-SG| rds
```

| Concern | Implementation |
|---|---|
| Cluster access | EKS **access entries** (API auth mode) — Terraform's identity is admin; the GitHub Actions role can only *edit* the two app namespaces |
| Workload IAM | **EKS Pod Identity** roles for EBS CSI, Load Balancer Controller and External Secrets (each limited to its own service account) |
| CI → AWS | GitHub **OIDC** federation; trust restricted to `main` and the `dev`/`prod` environments of this repository |
| Secrets | AWS Secrets Manager (ingest token, per-env DB passwords, RDS-managed master password) synced by External Secrets |
| State | S3 bucket with versioning, KMS encryption, TLS-only policy, native lock files |
| Logging | VPC flow logs, EKS control-plane logs, RDS logs to CloudWatch |

## 6. Identity flows

```mermaid
flowchart LR
  gha[GitHub Actions job] -->|OIDC JWT| sts[AWS STS]
  sts -->|temp creds| role[GitHubActions-CloudDevOps role]
  role -->|access entry: edit in app namespaces| eksapi[EKS API]
  role -->|GetSecretValue ingest token| sm[Secrets Manager]
  eso[external-secrets SA] -->|Pod Identity| esorole[ESO role] --> sm
  lbc[aws-load-balancer-controller SA] -->|Pod Identity| lbcrole[LBC role] --> elb[ELB APIs]
  ci2[GitHub Actions] -->|OIDC| fulcio[Sigstore Fulcio] -->|short-lived cert| sig[image signature in GHCR + Rekor]
  kyv[Kyverno] -->|verify issuer + subject| sig
```

No long-lived credentials exist anywhere: not in GitHub, not in the cluster, not in Terraform state (the RDS password is generated by RDS itself).
