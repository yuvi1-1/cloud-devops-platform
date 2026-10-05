# AWS deployment runbook

Step-by-step guide to run the platform on Amazon EKS in `ap-south-1` (Mumbai). Budget about 45 minutes the first time.

> **Cost:** with the defaults in `environments/shared.tfvars` (2 AZs, one NAT gateway, two Spot `t3.medium` nodes, no RDS) expect roughly **US$5–7 per day**:
>
> | Item | Approx. per day |
> |---|---|
> | EKS control plane ($0.10/h) | $2.40 |
> | NAT gateway (+ data) | $1.40+ |
> | 2 × t3.medium Spot nodes | $0.60–1.00 |
> | Network Load Balancer | $0.55 |
> | EBS volumes, CloudWatch logs, Secrets Manager | $0.30 |
> | *Optional* RDS db.t4g.micro | +$0.50 |
>
> Destroy everything with `make aws-destroy` when you are not using it.

## 0. Prerequisites

| Tool | Version | Check |
|---|---|---|
| AWS CLI v2 | ≥ 2.15 | `aws sts get-caller-identity` returns your admin identity |
| Terraform | ≥ 1.10 | `terraform version` |
| kubectl | ≥ 1.31 | `kubectl version --client` |
| Helm | ≥ 3.15 | `helm version` |

You also need admin rights on the GitHub repository.

### Coming from v1 of this project?

v1 created resources by hand with `eksctl` that collide with v2 names:

```bash
# 1. Delete the v1 cluster (same name: cloud-devops-cluster)
eksctl delete cluster -f infra/eksctl/cluster.yaml --wait

# 2. Either delete the hand-made IAM role…
aws iam delete-role-policy --role-name GitHubActions-CloudDevOps --policy-name <name>  # repeat per policy
aws iam delete-role --role-name GitHubActions-CloudDevOps
# …or let Terraform adopt it after `terraform init` (step 3):
#   terraform import -var-file=environments/shared.tfvars aws_iam_role.github_actions GitHubActions-CloudDevOps

# 3. The GitHub OIDC provider already exists in your account → reuse it
#    set  create_github_oidc_provider = false  in environments/shared.tfvars
```

## 1. Publish the container images

Push the v2 code to `main` (or merge the v2 pull request). The **CI** workflow builds and pushes:

```
ghcr.io/yuvi1-1/cloud-devops-platform/api:<sha>
ghcr.io/yuvi1-1/cloud-devops-platform/web:<sha>
```

GHCR packages are private by default. Make both public (GitHub → your profile → *Packages* → package → *Package settings* → *Change visibility* → Public), **or** keep them private and add an image pull secret (`global.imagePullSecrets`).

## 2. Create the Terraform state bucket (once)

```bash
cd infra/terraform/bootstrap
terraform init
terraform apply            # creates s3://cloud-devops-tfstate-<account-id>
```

## 3. Configure and apply the platform

```bash
cd ..   # infra/terraform
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
sed -i.bak "s/<ACCOUNT_ID>/$ACCOUNT_ID/" environments/shared.s3.tfbackend
```

Edit `environments/shared.tfvars`:

* `cluster_endpoint_public_access_cidrs` → your public IP (`curl -s https://checkip.amazonaws.com`) + `/32`
* `dev_hostname` / `prod_hostname` → names you control (or leave the defaults and test with a `Host` header)
* `create_rds = true` if you want prod on Amazon RDS
* `create_github_oidc_provider = false` if the provider already exists

```bash
terraform init -backend-config=environments/shared.s3.tfbackend
terraform plan  -var-file=environments/shared.tfvars -out=tfplan
terraform apply tfplan          # ~15-20 minutes
```

Terraform outputs what you need next:

```bash
terraform output configure_kubectl        # aws eks update-kubeconfig …
terraform output github_actions_role_arn
```

## 4. Watch Argo CD build the platform

```bash
$(terraform output -raw configure_kubectl)
kubectl -n argocd get applications -w
```

Within ~10 minutes every Application should be `Synced` / `Healthy`. Open the Argo CD UI:

```bash
kubectl -n argocd port-forward svc/argocd-server 8081:80
# http://localhost:8081  user: admin
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
```

## 5. Reach the application

```bash
NLB=$(kubectl -n envoy-gateway-system get svc \
  -l gateway.envoyproxy.io/owning-gateway-name=platform-gateway \
  -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}')
echo "$NLB"

# Without DNS: send the Host header the HTTPRoute expects
curl -H "Host: cloud-devops.example.com" "http://$NLB/api/v1/info"
```

With your own domain create two **CNAME** records pointing at `$NLB` (`dev.<domain>` and `<domain>`). For HTTPS set `letsencrypt_email` in the tfvars and re-apply: cert-manager obtains certificates through the Gateway (HTTP-01) and plain HTTP redirects to HTTPS.

## 6. Configure GitHub

**Settings → Secrets and variables → Actions → Variables**

| Variable | Value |
|---|---|
| `AWS_ROLE_ARN` | `terraform output -raw github_actions_role_arn` |
| `AWS_REGION` | `ap-south-1` |
| `EKS_CLUSTER` | `cloud-devops-cluster` |
| `DORA_API_URL` | prod base URL, e.g. `https://cloud-devops.example.com` |
| `DEV_URL` | `https://dev.cloud-devops.example.com` |
| `PROD_URL` | `https://cloud-devops.example.com` |

**Settings → Environments:** create `dev` and `prod`; on `prod` add *Required reviewers* (yourself) — this is the manual approval gate for releases.

**Settings → Actions → General:** *Workflow permissions* → enable **Allow GitHub Actions to create and approve pull requests** (promotion PRs).

**Settings → Branches:** protect `main` as described in [delivery-pipeline.md §7](delivery-pipeline.md#7-branch-protection-recommended-settings).

## 7. Ship a change

```bash
git switch -c feat/my-change
# … edit code …
git push -u origin feat/my-change     # open a PR → CI runs
```

Merge the PR → CI builds, signs, runs e2e, bumps dev → Argo CD deploys → the canary runs → the deployment is recorded on the dashboard. Then **Actions → Promote to prod → Run workflow**, review and merge the PR it opens.

## 8. Day-2 operations

| Task | Command |
|---|---|
| Grafana | `kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3001:80` → admin / `kubectl -n monitoring get secret kube-prometheus-stack-grafana -o jsonpath='{.data.admin-password}' \| base64 -d` |
| Prometheus | `kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090` |
| Rollouts dashboard | `kubectl -n argo-rollouts port-forward svc/argo-rollouts-dashboard 3100:3100` |
| Watch a canary | `kubectl argo rollouts get rollout cloud-devops-api -n cloud-devops-prod --watch` |
| Policy reports | `kubectl get policyreport -A` |
| Synced secrets | `kubectl get externalsecret -A` |
| Scale nodes | edit `node_*_size` in tfvars → `terraform apply` |
| Upgrade Kubernetes | bump `kubernetes_version` one minor at a time → `terraform apply` |

## 9. Tear down

```bash
make aws-destroy
```

The script disables Argo CD auto-sync, deletes the Gateway (releasing the NLB) and app namespaces (releasing EBS volumes), then runs `terraform destroy`. The state bucket is intentionally kept; delete it manually if you no longer need it.
