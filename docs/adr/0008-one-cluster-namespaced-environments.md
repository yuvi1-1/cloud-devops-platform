# ADR-0008: One cluster, namespace-per-environment

**Status:** Accepted (cost-driven; revisit for production use)

## Context

Separate clusters (or AWS accounts) per environment give the strongest isolation, but each EKS cluster costs ~US$73/month before nodes — prohibitive for a student budget.

## Decision

Run `cloud-devops-dev` and `cloud-devops-prod` as namespaces in one EKS cluster, isolated by:

* Argo CD AppProject destinations and per-environment Applications;
* default-deny NetworkPolicies and Pod Security `restricted`;
* separate databases (prod optionally on RDS) and separate secrets;
* a protected GitHub environment and PR review for prod changes.

## Consequences

* ✅ Half the fixed cost; one place to operate.
* ⚠️ Shared control plane and nodes: a noisy dev workload can affect prod (mitigated by requests/limits and HPA caps), and a cluster upgrade affects both.
* ➡️ For real production, use one cluster per environment (the Terraform stack is already parameterised by `environment`) and point each Argo CD at its own environment folder.
