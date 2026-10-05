# ADR-0005: No static credentials anywhere

**Status:** Accepted

## Context

Leaked long-lived keys are the most common cloud breach vector. A delivery platform touches many systems (GitHub, AWS APIs, the cluster, the database, the container registry).

## Decision

| Caller → target | Mechanism |
|---|---|
| GitHub Actions → AWS | OIDC federation; trust limited to this repo's `main` branch and `dev`/`prod` environments |
| GitHub Actions → GHCR | ephemeral `GITHUB_TOKEN` |
| GitHub Actions → Sigstore | OIDC → short-lived Fulcio certificate (keyless signing) |
| Pods → AWS (ESO, LB controller, EBS CSI) | **EKS Pod Identity** (per service account roles) |
| App → database password, ingest token | AWS Secrets Manager → External Secrets Operator → Kubernetes Secret |
| RDS master password | generated and rotated by RDS (`manage_master_user_password`), never in Terraform state |
| Nodes | IMDSv2 required, hop limit 1 — pods cannot borrow the node role |

## Alternatives

* **IRSA** — still valid; Pod Identity is simpler (no per-cluster OIDC trust policies) and is AWS's current recommendation.
* **Sealed Secrets / SOPS** — encrypted secrets in Git; rejected in favour of a central secret store with audit logging and rotation.

## Consequences

* ✅ Nothing to rotate manually or leak from a laptop, CI log or Git history.
* ⚠️ Local (kind/compose) uses explicit throwaway values, clearly marked as local-only.
