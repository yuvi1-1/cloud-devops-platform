# ADR-0004: Terraform with community modules replaces eksctl

**Status:** Accepted · **Supersedes:** v1 `infrastructure/eks-cluster.yaml` (eksctl)

## Context

v1 created the cluster with `eksctl` and several resources by hand (OIDC provider, IAM role, access entry, VPC CNI fixes). This was not reproducible, not reviewable, and partially failed when the network dropped mid-creation.

## Decision

Manage all AWS resources with **Terraform**, using the widely used `terraform-aws-modules` (VPC v6, EKS v21, EKS Pod Identity v2):

* remote state in S3 with native locking (`use_lockfile`), created by a tiny bootstrap stack;
* add-ons installed `before_compute` (fixes the v1 NotReady incident);
* offline **`terraform test`** with mocked providers asserting security intent (OIDC trust scope, private encrypted RDS, forced TLS, AZ validation) — runs in CI without an AWS account.

## Alternatives

* **eksctl** — great for quick clusters, weak for everything around the cluster (IAM, RDS, secrets).
* **AWS CDK / Pulumi** — real programming languages; Terraform chosen for its dominance in industry job requirements and module ecosystem.
* **OpenTofu** — drop-in compatible; the code works with either.

## Consequences

* ✅ Reproducible, reviewable, testable infrastructure; drift is visible in `plan`.
* ⚠️ Terraform and Argo CD share responsibility at the bootstrap boundary; the rule is: *Terraform owns AWS + Argo CD, Argo CD owns everything inside the cluster.*
