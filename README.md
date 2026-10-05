# Cloud DevOps Platform

[![CI](https://github.com/yuvi1-1/cloud-devops-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/yuvi1-1/cloud-devops-platform/actions/workflows/ci.yml)
[![CodeQL](https://github.com/yuvi1-1/cloud-devops-platform/actions/workflows/codeql.yml/badge.svg)](https://github.com/yuvi1-1/cloud-devops-platform/actions/workflows/codeql.yml)
![Kubernetes](https://img.shields.io/badge/Kubernetes-1.33-326ce5?logo=kubernetes&logoColor=white)
![Terraform](https://img.shields.io/badge/Terraform-%E2%89%A51.10-7b42bc?logo=terraform&logoColor=white)
![Argo CD](https://img.shields.io/badge/GitOps-Argo%20CD-ef7b4d?logo=argo&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

**A production-grade internal developer platform on AWS EKS that measures its own delivery performance.**

The platform ships a full-stack application — a **DORA metrics dashboard** (React + Fastify + PostgreSQL) — through a complete cloud-native delivery system: Terraform-provisioned EKS, GitOps with Argo CD, progressive canary releases with automatic rollback, Gateway API networking, full observability (metrics, logs, alerts) and a DevSecOps supply chain (signed images, SBOMs, policy-as-code). Every deployment the pipeline makes is recorded by the application itself, so the dashboard shows the project's *own* deployment frequency, lead time, change failure rate and time to restore.

> Final-year project — Cloud & DevOps Engineering. v1 of the project (a React app deployed to EKS with Helm and GitHub Actions) is preserved in the git history; [CHANGELOG.md](CHANGELOG.md) describes what v2 adds.

![Dashboard](docs/images/dashboard-light.png)

---

## Contents

- [Why this project](#why-this-project)
- [Architecture](#architecture)
- [Feature highlights](#feature-highlights)
- [Quick start](#quick-start)
- [Delivery pipeline](#delivery-pipeline)
- [Repository layout](#repository-layout)
- [Technology stack](#technology-stack)
- [Documentation](#documentation)

## Why this project

Most student DevOps projects stop at "the container runs on Kubernetes". Real platform teams are judged on **how safely and how often they can change production**. The four [DORA metrics](https://dora.dev/guides/dora-metrics-four-keys/) are the industry's standard way to measure that, so this project:

1. **Builds a real product** — an API and dashboard that ingest deployment events and compute the four DORA metrics with performance bands (elite / high / medium / low).
2. **Builds the platform that ships it** — infrastructure as code, GitOps, canaries, observability and supply-chain security, all automated.
3. **Closes the loop** — the CI/CD pipeline reports its own deployments to the API, turning the platform into evidence of its own performance.

## Architecture

```mermaid
flowchart LR
  dev([Developer]) -->|git push / PR| gh[GitHub]

  subgraph ci[GitHub Actions]
    direction TB
    t[Test · Lint · Scan] --> b[Build multi-arch images<br/>SBOM · provenance]
    b --> s[cosign keyless sign]
    s --> e[E2E on kind]
    e --> bump[Bump dev image tag<br/>in Git]
  end

  gh --> ci
  b --> ghcr[(GHCR)]
  bump --> repo[(Git: gitops/)]

  subgraph aws[AWS · ap-south-1 · Terraform]
    subgraph eks[Amazon EKS]
      argo[Argo CD] -->|sync| apps
      subgraph apps[cloud-devops-dev / -prod]
        gw[Envoy Gateway<br/>HTTPRoutes] --> web[web · NGINX]
        gw --> api[api · Fastify<br/>Argo Rollout canary]
        api --> pg[(PostgreSQL)]
      end
      prom[Prometheus · Grafana<br/>Loki · Alloy] -.scrape/logs.-> api
      kyv[Kyverno policies<br/>verify signatures] -.admission.-> apps
      eso[External Secrets] -.sync.-> apps
    end
    nlb[NLB] --> gw
    sm[(Secrets Manager)] --> eso
    rds[(RDS PostgreSQL<br/>optional)] -.-> api
  end

  repo --> argo
  ghcr --> apps
  user([Users]) --> nlb
```

| Layer | What runs there |
|---|---|
| **Application** | `apps/web` React 19 dashboard served by unprivileged NGINX; `apps/api` Fastify + TypeScript API with PostgreSQL, Prometheus metrics, structured logs, graceful shutdown |
| **Packaging** | One Helm chart (`helm/cloud-devops`) with JSON-schema-validated values, hardened pods, HPA, PDB, NetworkPolicies, HTTPRoutes, optional Argo Rollouts canary |
| **Infrastructure** | Terraform (`infra/terraform`): VPC, EKS 1.33, managed nodes, Pod Identity roles, GitHub OIDC role, optional RDS, Argo CD bootstrap |
| **Platform add-ons** | Declared in Git (`gitops/`) and installed by Argo CD: Envoy Gateway, AWS Load Balancer Controller, cert-manager, External Secrets, Argo Rollouts, Kyverno, kube-prometheus-stack, Loki, Alloy |
| **Delivery** | GitHub Actions CI → signed images in GHCR → Git commit → Argo CD sync → canary analysed by Prometheus → automatic promotion or rollback |

A deeper walk-through with sequence diagrams is in [docs/architecture.md](docs/architecture.md).

## Feature highlights

| Area | Highlights |
|---|---|
| **Application** | DORA metrics engine with unit-tested classification; deployment ingest API with bearer-token auth (constant-time compare), rate limiting, input validation (zod); PostgreSQL with versioned, advisory-locked migrations; `/healthz`, DB-aware `/readyz`, RED metrics on `/metrics`; fault injection (`CHAOS_ERROR_RATE`) for rollback demos |
| **Containers** | Multi-stage builds; **distroless** non-root API image; **nginx-unprivileged** web image; read-only root FS; multi-arch (amd64/arm64) |
| **Kubernetes** | Startup/readiness/liveness probes, zero-downtime rolling updates, HPA (CPU + memory, tuned behaviour), PDBs, zone/node topology spread, Pod Security `restricted`, default-deny NetworkPolicies |
| **Networking** | **Gateway API** (Envoy Gateway) — the successor to Ingress after ingress-nginx's retirement in 2026; AWS NLB via the Load Balancer Controller; optional Let's Encrypt TLS |
| **Progressive delivery** | Argo Rollouts canary (20→50→80→100%) shifting weights on the HTTPRoute; Prometheus analysis of success rate and p95 latency; automatic rollback |
| **GitOps** | Argo CD app-of-apps; multi-source Applications; sync waves; AppProjects fencing the app to its namespaces; dev auto-deploys, prod via reviewed promotion PR |
| **Infrastructure as Code** | Terraform with registry modules; S3 state with native locking; `terraform test` with **mocked providers** (runs in CI with no AWS account); tflint; checkov |
| **Security / supply chain** | GitHub OIDC (no static AWS keys); EKS Pod Identity; secrets in AWS Secrets Manager via External Secrets; Trivy (code, IaC, images), CodeQL, dependency review; SBOM + SLSA provenance; **cosign keyless signatures enforced by Kyverno**; SHA-pinned Actions; Dependabot |
| **Observability** | kube-prometheus-stack, Grafana dashboard (RED + runtime + delivery), PrometheusRules (availability, 5xx ratio, latency, crash loops, HPA saturation), Loki + Grafana Alloy for logs |
| **Testing** | 35+ unit/component/integration tests (96% API coverage), Helm negative tests, Terraform tests, kind e2e (auth, DB, NetworkPolicy isolation, zero-downtime rollout), k6 load tests with SLO thresholds |

## Quick start

### 1. Run everything locally with Docker Compose (2 minutes)

```bash
git clone https://github.com/yuvi1-1/cloud-devops-platform.git && cd cloud-devops-platform
docker compose up --build
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:8080 |
| API | http://localhost:3000/api/v1/dora?environment=prod&days=30 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (anonymous viewer, admin/admin) |

The API seeds 60 days of realistic deployment history on first start. Record a deployment yourself:

```bash
curl -X POST http://localhost:3000/api/v1/deployments \
  -H 'authorization: Bearer local-dev-ingest-token' -H 'content-type: application/json' \
  -d '{"service":"api","environment":"prod","version":"2.0.1","commitSha":"1a2b3c4","status":"succeeded"}'
```

### 2. Run it on Kubernetes locally (kind, ~5 minutes)

Needs Docker, [kind](https://kind.sigs.k8s.io/), kubectl and Helm.

```bash
make kind-up        # app + Envoy Gateway + metrics-server  → http://cloud-devops.localtest.me
make kind-full      # + Argo Rollouts canaries + Prometheus/Grafana
make hpa-demo       # watch the autoscaler react to load
make kind-down
```

### 3. Deploy to AWS (EKS)

```bash
cd infra/terraform/bootstrap && terraform init && terraform apply   # one-time: state bucket
cd .. && terraform init -backend-config=environments/shared.s3.tfbackend
terraform apply -var-file=environments/shared.tfvars                # ~20 min
```

Terraform creates the cluster and installs Argo CD; Argo CD then installs every add-on and both environments from this repository. Follow the full runbook — including GitHub configuration, DNS, costs and teardown — in [docs/aws-deployment.md](docs/aws-deployment.md).

> **Cost warning:** EKS, NAT gateway, nodes and the NLB cost roughly **US$5–7 per day** (Spot nodes, no RDS). Run `make aws-destroy` when you are done.

## Delivery pipeline

```mermaid
sequenceDiagram
  autonumber
  participant Dev as Developer
  participant GH as GitHub Actions
  participant Reg as GHCR
  participant Git as Git (gitops/)
  participant Argo as Argo CD
  participant RO as Argo Rollouts
  participant Prom as Prometheus
  participant API as DORA API

  Dev->>GH: merge PR to main
  GH->>GH: tests · scans · e2e on kind
  GH->>Reg: push signed multi-arch images (+SBOM, provenance)
  GH->>Git: set dev imageTag = <sha>
  GH->>API: deployment in_progress
  Argo->>Git: detect change
  Argo->>RO: apply new Rollout spec (dev)
  RO->>Prom: analyse canary success rate & p95
  Prom-->>RO: healthy
  RO->>RO: promote to 100%
  GH->>API: version live → succeeded (lead time recorded)
  Dev->>GH: run "Promote to prod"
  GH->>Git: PR updates prod imageTag (signature verified)
  Dev->>Git: review & merge → prod canary
```

Details: [docs/delivery-pipeline.md](docs/delivery-pipeline.md).

## Repository layout

```text
.
├── apps/
│   ├── api/                  Fastify + TypeScript API (DORA engine, PostgreSQL, metrics)
│   └── web/                  React 19 + Vite dashboard, NGINX runtime image
├── helm/cloud-devops/        Application Helm chart (+ values.schema.json, dashboards, alert rules)
├── gitops/
│   ├── bootstrap/            App-of-apps chart: every Argo CD Application
│   ├── platform/values/      Values for each platform add-on
│   ├── platform/config/      Gateway, ClusterIssuer, ClusterSecretStore, Kyverno policies
│   └── environments/         dev / prod values (image tags bumped by CI / promotion PRs)
├── infra/
│   ├── terraform/            VPC, EKS, IAM, RDS, Argo CD bootstrap (+ offline tests)
│   └── eksctl/               v1 cluster definition (kept for reference)
├── local/kind-config.yaml    Local 3-node cluster
├── scripts/                  kind-up, e2e, hpa-demo, validate-manifests, aws-destroy
├── tests/load/               k6 load test with SLOs
├── docs/                     Architecture, runbooks, ADRs, project report, viva guide
├── docker-compose.yml        Full local stack incl. Prometheus & Grafana
└── .github/workflows/        CI, CodeQL, promotion, deployment tracking, break-glass deploy
```

## Technology stack

| Category | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, hand-rolled accessible SVG charts |
| Backend | Node.js 22, Fastify 5, zod, prom-client, node-postgres |
| Database | PostgreSQL 17 (in-cluster StatefulSet or Amazon RDS) |
| Containers | Docker BuildKit, distroless, nginx-unprivileged, GHCR |
| Orchestration | Amazon EKS 1.33, Helm 3, kind for local/CI |
| Networking | Kubernetes Gateway API, Envoy Gateway, AWS Load Balancer Controller (NLB) |
| GitOps & delivery | Argo CD, Argo Rollouts (+ Gateway API plugin), GitHub Actions |
| Infrastructure as Code | Terraform (terraform-aws-modules), S3 remote state |
| Security | GitHub OIDC, EKS Pod Identity, External Secrets + AWS Secrets Manager, Kyverno, cosign/Sigstore, Trivy, CodeQL, Dependabot |
| Observability | Prometheus Operator, Grafana, Alertmanager, Loki, Grafana Alloy |
| Testing | Vitest, Testing Library, terraform test, kubeconform, kube-linter, k6 |

## Documentation

| Document | Contents |
|---|---|
| [Architecture](docs/architecture.md) | Components, request path, data model, network and identity design |
| [Delivery pipeline](docs/delivery-pipeline.md) | CI stages, GitOps flow, canary analysis, promotion, rollback |
| [AWS deployment runbook](docs/aws-deployment.md) | Step-by-step EKS deployment, GitHub setup, DNS/TLS, costs, teardown |
| [Local development](docs/local-development.md) | Tooling, compose, kind, running tests |
| [Security](docs/security.md) | Threat model, controls by layer, accepted risks |
| [Observability](docs/observability.md) | Metrics, dashboards, alerts, logs, SLOs |
| [API reference](docs/api.md) | Endpoints, payloads, DORA calculation rules |
| [Troubleshooting](docs/troubleshooting.md) | Real incidents from v1 and v2 with root causes |
| [Demo guide](docs/demo-guide.md) | Scripted 15-minute live demo for the viva |
| [Architecture decisions](docs/adr/) | Why Gateway API, GitOps, Rollouts, Pod Identity, … |
| [Project report](docs/project-report.md) ([Word version](docs/Project-Report.docx)) | Final-year report: problem, objectives, design, implementation, testing, results |
| [Viva preparation](docs/viva-questions.md) | Likely examiner questions with answers |

## License

[MIT](LICENSE) © yuvi1-1
