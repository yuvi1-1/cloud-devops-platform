# Architecture Decision Records

Short documents capturing *why* a significant choice was made, the alternatives considered and the consequences. Format: [Michael Nygard's ADR template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

| # | Decision | Status |
|---|---|---|
| [0001](0001-gitops-with-argo-cd.md) | Deliver to Kubernetes with GitOps (Argo CD) instead of CI push | Accepted |
| [0002](0002-gateway-api-envoy-gateway.md) | Gateway API with Envoy Gateway replaces ingress-nginx | Accepted |
| [0003](0003-progressive-delivery-argo-rollouts.md) | Canary releases with Argo Rollouts and Prometheus analysis | Accepted |
| [0004](0004-terraform-over-eksctl.md) | Terraform with community modules replaces eksctl | Accepted |
| [0005](0005-no-static-credentials.md) | No static credentials: GitHub OIDC, EKS Pod Identity, External Secrets | Accepted |
| [0006](0006-signed-images-policy-as-code.md) | Signed images and Kyverno policy-as-code | Accepted |
| [0007](0007-dora-metrics-as-the-product.md) | A DORA metrics service as the application | Accepted |
| [0008](0008-one-cluster-namespaced-environments.md) | One cluster, namespace-per-environment | Accepted |
