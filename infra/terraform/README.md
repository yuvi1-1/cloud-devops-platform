# Terraform — AWS platform

Creates the VPC, EKS cluster, IAM (GitHub OIDC, Pod Identity), optional RDS, Secrets Manager entries, and installs Argo CD with the root GitOps application. Everything inside the cluster is then managed by Argo CD from `gitops/`.

| File | Contents |
|---|---|
| `vpc.tf` | 3-tier VPC, NAT, flow logs, LB subnet tags |
| `eks.tf` | EKS 1.33, add-ons, managed node group, access entries |
| `pod-identity.tf` | roles for EBS CSI, AWS Load Balancer Controller, External Secrets |
| `github-oidc.tf` | OIDC provider + CI role (scoped trust and permissions) |
| `rds.tf` | optional PostgreSQL 17 (encrypted, private, forced TLS, managed password) |
| `secrets.tf` | ingest token and per-environment DB passwords in Secrets Manager |
| `argocd.tf` | Argo CD + root app-of-apps with cluster facts |
| `tests/plan.tftest.hcl` | offline tests with mocked providers |
| `bootstrap/` | one-time S3 state bucket |
| `environments/` | backend config and variables |

```bash
terraform init -backend=false && terraform test        # offline, no AWS account needed
terraform init -backend-config=environments/shared.s3.tfbackend
terraform apply -var-file=environments/shared.tfvars
```

Full runbook: [docs/aws-deployment.md](../../docs/aws-deployment.md).
