#!/usr/bin/env bash
# Tear down the AWS environment in the right order. Load balancers and volumes
# created by controllers inside the cluster are not in Terraform state, so they
# are removed first (otherwise the VPC cannot be deleted).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION=${AWS_REGION:-ap-south-1}
CLUSTER=${EKS_CLUSTER:-cloud-devops-cluster}

read -r -p "This destroys the EKS cluster '$CLUSTER' and all data in $REGION. Type 'destroy' to continue: " answer
[[ $answer == destroy ]] || { echo "aborted"; exit 1; }

if aws eks describe-cluster --name "$CLUSTER" --region "$REGION" >/dev/null 2>&1; then
  aws eks update-kubeconfig --name "$CLUSTER" --region "$REGION" >/dev/null
  echo "▶ Disabling Argo CD auto-sync so it stops recreating resources"
  kubectl -n argocd patch application root --type merge -p '{"spec":{"syncPolicy":null}}' 2>/dev/null || true
  echo "▶ Deleting Gateways (releases the NLB) and app namespaces (releases EBS volumes)"
  kubectl delete gateway --all -A --wait=true --timeout=5m 2>/dev/null || true
  kubectl delete namespace cloud-devops-dev cloud-devops-prod monitoring --wait=true --timeout=10m 2>/dev/null || true
  kubectl delete svc -A --field-selector spec.type=LoadBalancer --wait=true --timeout=5m 2>/dev/null || true
fi

echo "▶ terraform destroy"
cd "$ROOT/infra/terraform"
terraform destroy -var-file=environments/shared.tfvars
echo "✔ Done. (The Terraform state bucket from infra/terraform/bootstrap is kept on purpose.)"
