# Changelog

All notable changes to this project. Format based on [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [2.0.0] — 2026-10

A ground-up evolution from "an app deployed to EKS" into a self-measuring delivery platform.

### Added
- **DORA metrics application:** Fastify/TypeScript API with PostgreSQL (migrations, ingest auth, rate limiting, Prometheus metrics, graceful shutdown) and a React dashboard (metrics tiles, accessible chart, release matrix, platform panel, dark mode).
- **Terraform** for VPC, EKS 1.33, managed nodes, EKS Pod Identity, GitHub OIDC role and access entries, optional RDS, Secrets Manager, Argo CD bootstrap; S3 remote state; offline `terraform test` suite.
- **GitOps** with Argo CD app-of-apps: Envoy Gateway, AWS Load Balancer Controller, cert-manager, External Secrets, Argo Rollouts, Kyverno, kube-prometheus-stack, Loki, Alloy; dev/prod environments.
- **Progressive delivery:** Argo Rollouts canary with Gateway API traffic splitting and Prometheus analysis, automatic rollback; `CHAOS_ERROR_RATE` fault injection for demos.
- **DevSecOps:** Trivy (code, IaC, images), CodeQL, dependency review, SBOM + SLSA provenance, cosign keyless signing, GitHub attestations, Kyverno signature verification and hardening policies, SHA-pinned actions, Dependabot.
- **Observability:** PodMonitor, Grafana dashboard, PrometheusRules, centralised logs.
- **Testing:** 35 app tests (96% API coverage), Helm schema and negative tests, kubeconform/kube-linter, kind e2e, k6 load tests.
- **Developer experience:** Docker Compose stack with Prometheus/Grafana, one-command kind cluster, Makefile, extensive docs, ADRs, project report and viva guide.
- Deployment tracking: the pipeline records its own deployments in the DORA API.

### Changed
- Ingress moved from **ingress-nginx (retired March 2026)** to the **Gateway API** with Envoy Gateway.
- CD moved from CI-push `helm upgrade` to GitOps pull; the v1 workflow survives as a break-glass deploy.
- Helm chart rewritten: separate web/api/db components, hardened security contexts (the v1 README described these but the chart lacked them), startup probes, topology spread, HPA behaviour, `values.schema.json`.
- Images: web runs on `nginx-unprivileged` (port 8080), API on distroless non-root.
- Repository restructured as an npm workspaces monorepo (`apps/api`, `apps/web`).

### Removed
- `deploy.sh` (kind-specific manual script) — replaced by `scripts/kind-up.sh`.
- eksctl as the provisioning tool (config kept in `infra/eksctl/` for reference).

## [1.0.0] — 2026

Initial version: React (Vite) app, multi-stage Docker build, Helm chart, EKS created with eksctl, GitHub Actions CI to GHCR and CD to EKS through IAM OIDC, NGINX Ingress, HPA and PDB.
