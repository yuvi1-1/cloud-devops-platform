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

# Password for the in-cluster PostgreSQL of each environment (used when that
# environment is not on RDS). JSON shape matches the RDS-managed secret.
resource "random_password" "db" {
  for_each = toset(["dev", "prod"])

  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db" {
  for_each = random_password.db

  name                    = "${var.project}/${each.key}/db-password"
  description             = "In-cluster PostgreSQL password for the ${each.key} namespace"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "db" {
  for_each = random_password.db

  secret_id     = aws_secretsmanager_secret.db[each.key].id
  secret_string = jsonencode({ username = "devops", password = each.value.result })
}

locals {
  database_secret_keys = {
    dev  = aws_secretsmanager_secret.db["dev"].name
    prod = var.create_rds ? aws_db_instance.this[0].master_user_secret[0].secret_arn : aws_secretsmanager_secret.db["prod"].name
  }
}
