output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "region" {
  value = var.region
}

output "configure_kubectl" {
  description = "Command to point kubectl at the new cluster."
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name}"
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "github_actions_role_arn" {
  description = "Set as the AWS_ROLE_ARN repository variable in GitHub."
  value       = aws_iam_role.github_actions.arn
}

output "ingest_token_secret_name" {
  description = "Secrets Manager secret holding the CI ingest token."
  value       = aws_secretsmanager_secret.ingest_token.name
}

output "rds_endpoint" {
  value = var.create_rds ? aws_db_instance.this[0].address : null
}

output "rds_master_secret_arn" {
  value = var.create_rds ? aws_db_instance.this[0].master_user_secret[0].secret_arn : null
}

output "argocd_admin_password_command" {
  value = "kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
}
