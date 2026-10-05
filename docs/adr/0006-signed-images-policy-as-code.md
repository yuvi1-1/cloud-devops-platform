# ADR-0006: Signed images and Kyverno policy-as-code

**Status:** Accepted

## Context

Scanning finds known vulnerabilities but does not prove *where an image came from*. Hardening rules written in documentation drift from reality unless enforced.

## Decision

* CI signs every pushed image with **cosign keyless** signing and attaches an SBOM and SLSA provenance; GitHub artifact attestations are pushed alongside.
* **Kyverno** ClusterPolicies guard application namespaces: signature verification (issuer + workflow identity, digest pinning), approved registries, no `:latest`, hardened security contexts, resource requests/limits, probes.
* Policies start in **Audit** (PolicyReports) and can be switched to **Enforce** with one value.
* The promotion workflow re-verifies signatures before opening a prod PR.

## Alternatives

* **OPA Gatekeeper** — Rego is powerful but harder to read; Kyverno policies are YAML and support image verification natively.
* **Sigstore policy-controller** — signatures only; Kyverno covers both supply chain and pod hardening.

## Consequences

* ✅ Only images built by this repository's CI on `main` can run (in Enforce mode).
* ⚠️ Admission webhooks add latency and a dependency: Kyverno runs with resource requests and is excluded from system namespaces by default.
