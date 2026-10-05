# Optional managed PostgreSQL for the prod namespace. The master password is
# generated and rotated by RDS in AWS Secrets Manager — it never appears in
# Terraform state or Git. The app reads it through the External Secrets Operator.

resource "aws_security_group" "rds" {
  count = var.create_rds ? 1 : 0

  name        = "${var.project}-rds"
  description = "PostgreSQL access from EKS nodes/pods only"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_nodes" {
  count = var.create_rds ? 1 : 0

  security_group_id            = aws_security_group.rds[0].id
  referenced_security_group_id = module.eks.node_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL from EKS worker nodes"
}

resource "aws_db_parameter_group" "this" {
  count = var.create_rds ? 1 : 0

  name   = "${var.project}-pg17"
  family = "postgres17"

  # Enforce TLS for every client connection.
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }
}

resource "aws_db_instance" "this" {
  count = var.create_rds ? 1 : 0

  identifier     = "${var.project}-prod"
  engine         = "postgres"
  engine_version = "17"
  instance_class = var.rds_instance_class

  db_name  = "devops"
  username = "devops"
  # RDS generates + stores the password in Secrets Manager.
  manage_master_user_password = true

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds[0].id]
  parameter_group_name   = aws_db_parameter_group.this[0].name
  publicly_accessible    = false
  multi_az               = var.rds_multi_az

  backup_retention_period      = 7
  backup_window                = "18:00-19:00"
  maintenance_window           = "sun:19:30-sun:20:30"
  auto_minor_version_upgrade   = true
  copy_tags_to_snapshot        = true
  deletion_protection          = var.rds_deletion_protection
  skip_final_snapshot          = !var.rds_deletion_protection
  final_snapshot_identifier    = var.rds_deletion_protection ? "${var.project}-prod-final" : null
  performance_insights_enabled = true

  enabled_cloudwatch_logs_exports = ["postgresql"]
}
