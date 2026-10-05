# Three-tier VPC: public subnets (load balancers, NAT), private subnets (nodes,
# pods), database subnets (RDS, no internet route) — spread across AZs.
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.7"

  name = "${var.project}-vpc"
  cidr = var.vpc_cidr
  azs  = local.azs

  # /20 private subnets leave room for VPC-CNI pod IPs; /24 elsewhere.
  private_subnets  = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 4, i)]
  public_subnets   = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 8, 48 + i)]
  database_subnets = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 8, 52 + i)]

  enable_nat_gateway     = true
  single_nat_gateway     = var.single_nat_gateway
  one_nat_gateway_per_az = !var.single_nat_gateway
  enable_dns_hostnames   = true

  create_database_subnet_group       = true
  create_database_subnet_route_table = true

  # Flow logs for network forensics (rejected + accepted traffic).
  enable_flow_log                                 = true
  create_flow_log_cloudwatch_iam_role             = true
  create_flow_log_cloudwatch_log_group            = true
  flow_log_max_aggregation_interval               = 600
  flow_log_cloudwatch_log_group_retention_in_days = 14

  # Subnet discovery tags for the AWS Load Balancer Controller.
  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }
}
