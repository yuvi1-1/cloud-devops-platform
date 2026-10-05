# terraform apply -var-file=environments/shared.tfvars
project     = "cloud-devops"
environment = "shared"
region      = "ap-south-1"

# Student-budget defaults: one NAT gateway, two small nodes, no RDS.
single_nat_gateway  = true
az_count            = 2
node_instance_types = ["t3.medium", "t3a.medium"]
node_capacity_type  = "SPOT"
node_min_size       = 2
node_desired_size   = 2
node_max_size       = 4

# Set to true to run prod on Amazon RDS instead of the in-cluster PostgreSQL.
create_rds = false

# Restrict the public API endpoint to your own IP, e.g. ["203.0.113.10/32"]
cluster_endpoint_public_access_cidrs = ["0.0.0.0/0"]

# The account already has the GitHub OIDC provider from v1 of the project? Set false.
create_github_oidc_provider = true

github_repository = "yuvi1-1/cloud-devops-platform"
gitops_repo_url   = "https://github.com/yuvi1-1/cloud-devops-platform.git"
gitops_revision   = "main"

# Public hostnames (create CNAME records pointing at the NLB after apply).
dev_hostname      = "dev.cloud-devops.example.com"
prod_hostname     = "cloud-devops.example.com"
letsencrypt_email = ""
