# Troubleshooting

Real problems hit while building this project (v1 on hand-built EKS, v2 on the automated platform), each with symptoms, diagnosis and the permanent fix. A troubleshooting log like this is one of the most valuable parts of the project: it shows *why* the v2 design looks the way it does.

## Incident 1 — EKS node group stuck in `CREATING` (v1)

**Symptoms.** `eksctl` waited on the managed node group; CloudFormation finally reported `NodeCreationFailure: Unhealthy nodes in the kubernetes cluster`.

**Diagnosis.**

```bash
aws cloudformation describe-stack-events --stack-name eksctl-cloud-devops-cluster-nodegroup-cloud-devops-nodes
aws eks describe-nodegroup --cluster-name cloud-devops-cluster --nodegroup-name cloud-devops-nodes
kubectl get nodes                      # NotReady
kubectl describe node <node>           # NetworkPluginNotReady: cni plugin not initialized
kubectl -n kube-system get ds aws-node # VPC CNI DaemonSet not healthy
```

**Root cause.** The node joined before the VPC CNI add-on was healthy, so the kubelet had no pod network and never became `Ready`; the node group then timed out.

**Fix in v2.** Terraform installs `vpc-cni` and `eks-pod-identity-agent` with `before_compute = true`, so networking exists before any node boots. Lesson: *a running EC2 instance is not a healthy Kubernetes node* — check node conditions, add-ons, DaemonSets and events.

## Incident 2 — CD failed with "the server has asked for the client to provide credentials" (v1)

**Symptoms.** GitHub Actions assumed the IAM role successfully (`aws sts get-caller-identity` worked), but `helm upgrade` failed with `Kubernetes cluster unreachable`.

**Root cause.** *IAM authentication ≠ Kubernetes authorization.* The role could call AWS APIs but had no identity inside the cluster (`API_AND_CONFIG_MAP` mode, no access entry).

**Fix in v2.** Terraform creates an **EKS access entry** for the CI role with `AmazonEKSEditPolicy` scoped to the app namespaces, and the cluster uses `API` authentication mode only. Day-to-day deployments no longer need cluster credentials at all — Argo CD pulls from Git.

## Incident 3 — network loss during `eksctl create cluster` (v1)

**Symptoms.** `dial tcp: lookup cloudformation.ap-south-1.amazonaws.com: no such host` mid-creation, leaving partially created stacks.

**Approach.** Inspected CloudFormation stacks and EKS resources to see what existed instead of blindly recreating (which causes name collisions and orphaned resources).

**Fix in v2.** Terraform keeps state in S3 with locking: an interrupted `apply` is simply re-run and converges; nothing depends on the laptop's connection lasting 20 minutes.

## Incident 4 — `npm install` crashed with `Cannot read properties of null (reading 'edgesOut')` (v2)

**Symptoms.** Adding Vitest 4 to the workspaces made `npm install` (npm 10.9) crash while building the dependency tree.

**Root cause.** An npm 10 Arborist bug resolving optional peer dependency sets across workspaces.

**Fix.** Generated the lockfile with npm 11 (`npx npm@11 install`); `npm ci` with npm 10 (what Node 22 and CI ship) installs that lockfile fine. Pinned Vitest to the major that supports Vite 8.

## Incident 5 — ingress-nginx retirement (v2 design change)

**Finding.** Kubernetes SIG Network retired the community ingress-nginx controller (best-effort maintenance ended March 2026; no further security fixes).

**Decision.** Migrated north-south traffic to the **Gateway API** with Envoy Gateway ([ADR-0002](adr/0002-gateway-api-envoy-gateway.md)). Canary traffic splitting moved from NGINX canary annotations to the Argo Rollouts Gateway API plugin. A classic `Ingress` template remains as an opt-in fallback.

## Incident 6 — "Pods healthy, but canary analysis always inconclusive" (v2, found in design review)

**Root cause.** With a `ServiceMonitor`, Prometheus discovers pods through Services — but Argo Rollouts rewrites the selectors of the stable/canary Services during a rollout, so canary pods were scraped via the canary Service (or twice, after promotion).

**Fix.** Use a **PodMonitor** and copy the `rollouts-pod-template-hash` pod label into every series; analysis queries filter on that hash. Every pod is scraped exactly once regardless of Service selectors.

## Incident 7 — random database passwords broke GitOps renders (v2, design review)

**Root cause.** A Helm template generating `randAlphaNum` passwords (with `lookup` to keep them stable) works with `helm install`, but Argo CD renders with `helm template`, where `lookup` returns nothing — the password changed on every sync while PostgreSQL kept the original.

**Fix.** The chart never generates secrets. Passwords come from AWS Secrets Manager through External Secrets (EKS) or are explicit local-only values (kind/compose).

## Incident 8 — first CI run on the pull request (v2)

The first real pipeline run surfaced three problems that local checks could not:

| Job | Symptom | Root cause | Fix |
|---|---|---|---|
| Images | Trivy gate failed: `CVE-2026-42945` (nginx, arbitrary code execution) and `CVE-2026-31789` (OpenSSL) | Base images (`nginx-unprivileged:1.28-alpine`, `distroless nodejs22-debian12`) predated the fixes | Moved to `nginx-unprivileged:1.30-alpine` + `apk upgrade` at build time, and `distroless nodejs22-debian13`; the OpenSSL CVE only affects 32-bit builds, so it is documented in `.trivyignore` with a review date |
| Terraform | `terraform test`: *Condition expression could not be evaluated at this time* | HashiCorp Terraform treats the IAM policy JSON as unknown during `plan` (it embeds a computed ARN); OpenTofu, used locally, resolved it | Assert on the input (`local.github_oidc_subjects`) instead of the rendered JSON |
| E2E | `helm test --logs`: *pod not found* although the test passed | `hook-delete-policy: hook-succeeded` deleted the pod before Helm fetched its logs | Keep test pods until the next run (`before-hook-creation` only) |

Lesson: the security gate did its job — a release with a known remote-code-execution bug in NGINX was blocked automatically.

---

## Quick diagnostic commands

| Question | Command |
|---|---|
| Are nodes healthy? | `kubectl get nodes -o wide`, `kubectl describe node <n>` |
| Are add-ons healthy? | `aws eks list-addons --cluster-name cloud-devops-cluster`, `kubectl -n kube-system get pods` |
| What is Argo CD doing? | `kubectl -n argocd get applications`, `argocd app get <app>` |
| Why is an app OutOfSync? | `argocd app diff cloud-devops-prod` |
| Is the canary progressing? | `kubectl argo rollouts get rollout cloud-devops-api -n cloud-devops-prod` |
| Why did analysis fail? | `kubectl -n cloud-devops-prod get analysisrun`, `kubectl describe analysisrun <name>` |
| Did the Gateway get an address? | `kubectl -n envoy-gateway-system get gateway platform-gateway` |
| Are routes attached? | `kubectl -n cloud-devops-prod describe httproute` (look at `Parents` → `Accepted`) |
| Are secrets syncing? | `kubectl -n cloud-devops-prod get externalsecret`, `kubectl describe externalsecret <n>` |
| Is a policy blocking pods? | `kubectl get policyreport -A`, `kubectl get events -A --field-selector reason=PolicyViolation` |
| Is the HPA getting metrics? | `kubectl get hpa -A`, `kubectl top pods -n cloud-devops-prod` |
| API errors? | Grafana → Explore → Loki: `{component="api"} \| json \| level >= 50` |
| Pod can't reach the DB? | `kubectl -n <ns> get netpol`; check the client pod's labels |
