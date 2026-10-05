# ADR-0001: Deliver to Kubernetes with GitOps (Argo CD)

**Status:** Accepted · **Supersedes:** v1 `deploy.yml` (CI runs `helm upgrade`)

## Context

In v1, GitHub Actions assumed an IAM role and ran `helm upgrade` against EKS. This needs cluster credentials in CI, leaves no declarative record of what *should* be running, and cannot detect or correct manual drift. Rollback meant re-running a pipeline.

## Decision

Adopt GitOps with **Argo CD**. The desired state of every environment (chart + values + image tag) lives in `gitops/`. CI only builds artifacts and commits an image tag; Argo CD inside the cluster pulls and reconciles. An app-of-apps chart (`gitops/bootstrap`) declares all platform add-ons and application environments; Terraform installs only Argo CD and the root Application.

## Alternatives

* **Flux CD** — equally capable; Argo CD chosen for its UI (useful for demos and debugging), AppProjects and wide adoption.
* **CI push (v1)** — simpler, but credentials in CI, no drift correction, weak audit trail.

## Consequences

* ✅ Git history is the deployment audit log; rollback is `git revert`; drift is self-healed.
* ✅ CI needs no cluster credentials for normal releases (the scoped access entry remains for break-glass only).
* ⚠️ Two sources of change (Git and controllers such as Argo Rollouts) need `ignoreDifferences` for runtime-mutated fields (HTTPRoute weights).
* ⚠️ Secrets cannot live in Git → External Secrets ([ADR-0005](0005-no-static-credentials.md)).
