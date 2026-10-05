# Security

Security is applied in layers so that no single control is load-bearing. This page maps each threat to the controls that address it, then lists accepted risks honestly.

## Threat model (STRIDE summary)

| Threat | Example | Primary controls |
|---|---|---|
| **Spoofing** | Forged deployment events skew DORA metrics | Bearer token (≥ 16 chars, stored in Secrets Manager), constant-time comparison, rate limiting |
| **Spoofing** | Attacker pushes their own image under our name | cosign keyless signatures tied to this repo's CI identity; Kyverno `verify-image-signatures`; promotion re-verifies signatures |
| **Tampering** | Malicious change to a running deployment | GitOps: Argo CD `selfHeal` reverts drift; CI role limited to two namespaces; branch protection + CODEOWNERS |
| **Tampering** | Compromised third-party GitHub Action | Actions pinned to commit SHAs, Dependabot updates, least-privilege `permissions` per job |
| **Repudiation** | "Who deployed what?" | Every environment change is a Git commit; EKS audit logs; Rekor transparency log for signatures; provenance attestations |
| **Information disclosure** | Leaked cloud credentials | No static keys: GitHub OIDC, EKS Pod Identity; secrets only in Secrets Manager / Kubernetes Secrets; Trivy secret scanning |
| **Information disclosure** | Lateral movement to the database | Default-deny NetworkPolicies; DB only reachable from API pods; RDS in isolated subnets, SG-to-SG rule, forced TLS |
| **Denial of service** | Request floods | Per-client rate limiting, body size limit (64 KiB), HPA, PDB, resource limits |
| **Elevation of privilege** | Container breakout | Non-root, read-only root FS, no capabilities, seccomp, no SA token, Pod Security `restricted`, IMDSv2 hop limit 1 (pods cannot use the node role) |

## Controls by layer

### Source & CI

* CodeQL (`security-extended`) for TypeScript and workflow files.
* Trivy filesystem scan for vulnerable dependencies, committed secrets and IaC misconfigurations — results in the GitHub *Security* tab; critical findings fail the build.
* Dependency review blocks PRs that add dependencies with high-severity advisories.
* actionlint validates workflow syntax and embedded shell.
* Every job declares minimal `permissions`; only the image job gets `id-token: write` (for signing) and `packages: write`.

### Supply chain (SLSA-style)

| Artifact | Evidence |
|---|---|
| Image | built by BuildKit on GitHub-hosted runners from a pinned base |
| SBOM | SPDX SBOM attached to the image (`sbom: true`) |
| Provenance | BuildKit SLSA provenance (`mode=max`) + GitHub artifact attestation |
| Signature | cosign keyless — certificate issued by Sigstore Fulcio to the workflow identity `https://github.com/yuvi1-1/cloud-devops-platform/.github/workflows/ci.yml@refs/heads/main`, recorded in Rekor |
| Admission | Kyverno verifies issuer + subject and pins the image to the verified digest (`mutateDigest`) |

Verify an image yourself:

```bash
cosign verify ghcr.io/yuvi1-1/cloud-devops-platform/api:<sha> \
  --certificate-identity-regexp '^https://github.com/yuvi1-1/cloud-devops-platform/.github/workflows/ci.yml@refs/heads/main$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify oci://ghcr.io/yuvi1-1/cloud-devops-platform/api:<sha> --owner yuvi1-1
```

### Containers

* API: **distroless** Node.js runtime (no shell, no package manager), UID 65532, production dependencies only.
* Web: `nginx-unprivileged` (UID 101, port 8080), CSP, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, permissions policy, HSTS at the Gateway.
* Both run with a read-only root filesystem.

### Kubernetes

* Pod Security Admission **restricted** on application namespaces (set by Argo CD `managedNamespaceMetadata`).
* Kyverno policies (Audit by default; switch `policies.validationFailureAction` to `Enforce`): hardened containers, requests/limits, probes, approved registries, no `:latest`, signature verification.
* Default-deny NetworkPolicies, enforced by the VPC CNI network-policy agent on EKS and by kindnet locally — verified by the e2e suite.
* AppProject `cloud-devops` can only deploy to its namespaces from this repository and cannot create cluster-scoped resources (except its namespace).

### AWS

* EKS access entries with scoped policies (CI: `AmazonEKSEditPolicy` on two namespaces + cluster-wide view).
* Control-plane `api`, `audit`, `authenticator` logs; VPC flow logs.
* Secrets envelope-encrypted with KMS (EKS module default), encrypted EBS, encrypted RDS storage, Secrets Manager.
* State bucket: versioned, KMS-encrypted, public access blocked, TLS-only bucket policy.

## Accepted risks

Recorded in `.checkov.yaml` / `.kube-linter.yaml` with reasons:

| Finding | Why accepted |
|---|---|
| Public EKS endpoint | restricted by `cluster_endpoint_public_access_cidrs`; private-only would need a VPN/bastion for a student project |
| Single NAT gateway | cost; set `single_nat_gateway = false` for per-AZ HA |
| Secrets Manager with AWS-managed KMS key, no rotation Lambda | ingest token rotates by re-applying Terraform; RDS manages its own rotation |
| `PGPASSWORD` passed as an environment variable | libpq convention; scoped to the pod, never logged (`authorization` header redacted too) |
| In-cluster PostgreSQL for dev | single replica, no backups — dev data is synthetic; prod can use RDS |
| Kyverno in Audit mode by default | allows a safe rollout of policies; switch to Enforce after reviewing `PolicyReport`s |

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md).
