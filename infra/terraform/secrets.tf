# Token the CI/CD pipeline uses to report deployments to the API. Stored in
# Secrets Manager and synced into the cluster by the External Secrets Operator.
resource "random_password" "ingest_token" {
  length  = 40
  special = false
}

resource "aws_secretsmanager_secret" "ingest_token" {
  name                    = "${var.project}/ingest-token"
  description             = "Bearer token for POST /api/v1/deployments"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "ingest_token" {
  secret_id     = aws_secretsmanager_secret.ingest_token.id
  secret_string = random_password.ingest_token.result
}
