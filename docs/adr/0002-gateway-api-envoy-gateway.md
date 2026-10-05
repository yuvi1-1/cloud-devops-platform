# ADR-0002: Gateway API with Envoy Gateway replaces ingress-nginx

**Status:** Accepted · **Supersedes:** v1 NGINX Ingress Controller

## Context

v1 exposed the app through the community **ingress-nginx** controller. In November 2025 Kubernetes SIG Network announced its retirement; best-effort maintenance ended in March 2026 and the project recommends migrating to a Gateway API implementation. Running an unmaintained, internet-facing proxy is an unacceptable security risk.

## Decision

Use the **Kubernetes Gateway API** (`GatewayClass` → `Gateway` → `HTTPRoute`) implemented by **Envoy Gateway**:

* The platform owns one shared `Gateway` (one NLB) in `envoy-gateway-system`; application namespaces attach `HTTPRoute`s only if labelled `cloud-devops.io/gateway-access=true` — a role split Ingress never had.
* An `EnvoyProxy` resource configures an AWS NLB (IP targets) on EKS and fixed NodePorts on kind.
* cert-manager issues certificates for Gateway listeners.
* Argo Rollouts shifts canary weights on the `HTTPRoute` via the official Gateway API plugin.

## Alternatives

* **Keep ingress-nginx** — rejected: no security fixes.
* **AWS Load Balancer Controller with ALB Ingress** — AWS-specific and no local parity with kind.
* **Istio / Cilium Gateway** — capable, but a service mesh / CNI change is heavier than needed.
* **Traefik / NGINX Gateway Fabric** — viable; Envoy Gateway chosen as a CNCF Envoy project with strong Gateway API conformance and Rollouts plugin support.

## Consequences

* ✅ Standard, role-oriented API; portable across implementations; identical locally and on EKS.
* ✅ Weighted backends make canary percentages exact.
* ⚠️ Gateway API CRDs must be installed before routes (sync waves handle ordering).
* ℹ️ A classic `Ingress` template remains in the chart (`ingress.enabled`) for clusters without Gateway API.
