data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

data "aws_partition" "current" {}

locals {
  name = "${var.project}-cluster"
  azs  = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  tags = merge({
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Repository  = var.github_repository
  }, var.tags)
}
