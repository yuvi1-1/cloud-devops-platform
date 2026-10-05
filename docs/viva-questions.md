# Viva preparation — likely questions and model answers

Answers are short on purpose: say the answer, then offer to show it in the repo or the demo.

## Project & motivation

**Q: What problem does the project solve?**
Teams need to change production quickly *and* safely, and need evidence of how well they do it. The project builds a delivery platform with safety mechanisms (tests, signed images, canaries with automatic rollback) and a product that measures delivery performance with the four DORA metrics — including the platform's own deployments.

**Q: What are the DORA metrics and why medians?**
Deployment frequency, lead time for changes, change failure rate, time to restore. Lead and restore times are right-skewed (a few very slow cases), so the median represents the typical experience better than the mean.

**Q: What changed from v1 to v2?**
Manual eksctl → Terraform; CI push → GitOps; rolling update → metric-gated canary; retired ingress-nginx → Gateway API; root containers → hardened non-root; no network policy → default deny; no observability → Prometheus/Grafana/Loki; no supply-chain security → SBOM, provenance, signatures, Kyverno; starter page → real application. See the comparison table in the [report](project-report.md#72-comparison-with-v1).

## Kubernetes

**Q: Difference between liveness, readiness and startup probes? Why are yours different endpoints?**
Startup gives slow boots time before other probes start; readiness decides if a pod receives traffic; liveness decides if it is restarted. `/readyz` checks the database, `/healthz` only the process — if the DB goes down, pods leave load balancing but aren't restarted in a loop (which wouldn't fix the DB).

**Q: How do you achieve zero-downtime deployments?**
`maxUnavailable: 0` / `maxSurge: 1`, readiness gates, on SIGTERM the API fails readiness first and drains for 5 s (plus `preStop` on NGINX), PDBs for voluntary disruptions. The e2e test verifies ready endpoints exist throughout a rollout.

**Q: How does the HPA decide to scale?**
It compares average CPU (70%) and memory (80%) utilisation *relative to requests* from metrics-server and computes `desired = ceil(current × actual/target)`. Scale-up is immediate (100% per 30 s), scale-down waits 120 s and halves at most per minute to avoid flapping.

**Q: What does a PodDisruptionBudget protect against? What doesn't it protect against?**
Voluntary disruptions — node drains, upgrades, cluster autoscaler. Not involuntary ones like node crashes; for those, replicas plus topology spread across zones.

**Q: Why NetworkPolicies, and who enforces them?**
Kubernetes allows all pod-to-pod traffic by default; a compromised pod could reach the DB. Default deny + explicit allows limits blast radius. They are enforced by the CNI — on EKS the VPC CNI network-policy agent (enabled in Terraform), on kind kindnet. The e2e test proves an arbitrary pod can't reach the API or DB.

**Q: What is Pod Security Admission `restricted`?**
A built-in admission controller profile requiring non-root, no privilege escalation, dropped capabilities, seccomp RuntimeDefault, and no host namespaces/paths. Set per namespace by label.

## Networking

**Q: Why the Gateway API instead of Ingress?**
ingress-nginx was retired (maintenance ended March 2026). Gateway API is the standard successor: role separation (platform owns the Gateway, apps own HTTPRoutes), native weighted backends for canaries, portable across implementations. Envoy Gateway implements it.

**Q: Trace a request from the browser to the database.**
DNS → NLB (provisioned by the AWS Load Balancer Controller, IP targets) → Envoy proxy pods → HTTPRoute `/api` → API Service (stable/canary weights) → API pod → PostgreSQL Service → DB pod or RDS. [architecture.md §2.2](architecture.md#22-request-path).

## GitOps & delivery

**Q: What is GitOps and why use it over `helm upgrade` from CI?**
Desired state is declared in Git and an in-cluster agent pulls and continuously reconciles it. Benefits: no cluster credentials in CI, Git history as audit log, drift self-healing, rollback via `git revert`.

**Q: How does a change reach production?**
PR → CI gates → merge → images built, scanned, signed → CI commits the SHA to `gitops/environments/dev` → Argo CD syncs → canary → tracked as a deployment. Then *Promote to prod* verifies signatures and opens a PR; merging it releases to prod with a canary.

**Q: How does automatic rollback work?**
Argo Rollouts creates a canary ReplicaSet and shifts HTTPRoute weights step by step. An AnalysisRun queries Prometheus every minute for the canary pods' success rate (≥ 95%) and p95 latency (≤ 500 ms). More than one failed measurement aborts the rollout: weights return to 100% stable and the canary scales down. Demonstrated with `CHAOS_ERROR_RATE`.

**Q: How do you query only canary traffic?**
The PodMonitor copies the `rollouts-pod-template-hash` pod label onto every series; the AnalysisTemplate filters on the hash of the latest ReplicaSet.

**Q: What if Argo CD is down?**
The running workloads are unaffected (it's a control-plane component). For urgent changes, the break-glass workflow deploys with Helm via OIDC; Argo CD re-converges afterwards.

## Infrastructure as Code

**Q: Why Terraform? How is state handled?**
Declarative, reviewable plans, large module ecosystem. State is in S3 (versioned, encrypted, TLS-only) with native lock files, so concurrent applies are prevented and interrupted runs are recoverable.

**Q: How do you test Terraform without AWS?**
`terraform test` with `mock_provider` blocks plans the whole stack with fake provider responses and asserts intent: OIDC trust limited to this repo/main, RDS encrypted/private/TLS-only, input validation.

**Q: Why private subnets for nodes and a separate DB subnet tier?**
Nodes have no public IPs (egress via NAT); only the NLB is public. Database subnets have no internet route, and RDS accepts 5432 only from the node security group.

## Security

**Q: How do you avoid storing AWS keys in GitHub?**
GitHub's OIDC provider issues a signed JWT per job; AWS STS exchanges it for temporary credentials of a role whose trust policy accepts only this repository's `main` branch and protected environments.

**Q: Pod Identity vs IRSA?**
Both give pods IAM roles. Pod Identity uses an EKS agent and associations (no per-cluster OIDC trust policy editing), and is AWS's current recommended approach.

**Q: What does signing the image prove? What does Kyverno check?**
That the image digest was produced by this repo's CI workflow on `main` (certificate from Fulcio bound to the workflow identity, logged in Rekor). Kyverno verifies the issuer and subject and pins the image to the verified digest.

**Q: What is an SBOM and provenance?**
SBOM lists every package in the image (for vulnerability response). Provenance (SLSA) records how, where and from what source the image was built.

**Q: Why is the API image distroless?**
No shell or package manager → far smaller attack surface and fewer CVEs; runs as UID 65532.

## Observability

**Q: What are RED and USE?**
RED for services: Rate, Errors, Duration. USE for resources: Utilisation, Saturation, Errors. The dashboard and alerts follow both.

**Q: Why label metrics by route template?**
Raw URLs (with IDs) would create unbounded label cardinality and overload Prometheus.

**Q: How are logs collected?**
The API logs JSON; Grafana Alloy tails pod logs through the Kubernetes API (no hostPath), labels them and ships to Loki; Grafana queries both metrics and logs.

## Testing

**Q: What is your testing strategy?**
A pyramid: static analysis → unit/component → DB integration → schema/contract (Helm, kubeconform, negative tests, Terraform tests) → e2e on kind → load tests and fault injection. 35 app tests, 96% API coverage.

**Q: What does the e2e test cover that unit tests can't?**
The real chart on a real cluster with PostgreSQL: helm test, auth, ingest → DORA, Prometheus metrics, NetworkPolicy isolation, zero-downtime rollout.

## Trade-offs & critique

**Q: What would you do differently for real production?**
Separate clusters/accounts per environment; Kyverno in Enforce; Karpenter; private EKS endpoint behind a VPN; RDS Multi-AZ for every stateful env; OpenTelemetry tracing; multi-window SLO burn-rate alerts.

**Q: Biggest challenge?**
Debugging the v1 EKS node stuck `NotReady` (CNI not initialised) and the IAM-vs-Kubernetes authorisation failure — both drove v2 design decisions (add-ons before compute; access entries in code). In v2: making canary analysis reliable (PodMonitor vs ServiceMonitor) and keeping GitOps renders deterministic (no random secrets).

**Q: How much does it cost and how do you control it?**
≈ US$5–7/day (EKS control plane and NAT dominate). Spot nodes, one NAT, no RDS by default, and `make aws-destroy` tears everything down; all demos also run free on kind.
