variable "project" {
  description = "Project name used for resource names and tags."
  type        = string
  default     = "cloud-devops"
}

variable "environment" {
  description = "Infrastructure environment (one EKS cluster hosts the dev and prod namespaces)."
  type        = string
  default     = "shared"
}

variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-south-1"
}

# ── Networking ────────────────────────────────────────────────────────────────
variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones to spread subnets and nodes across."
  type        = number
  default     = 3

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3 (EKS needs at least two AZs)."
  }
}

variable "single_nat_gateway" {
  description = "Use one shared NAT gateway (cheaper) instead of one per AZ (highly available)."
  type        = bool
  default     = true
}

# ── EKS ───────────────────────────────────────────────────────────────────────
variable "kubernetes_version" {
  description = "EKS Kubernetes version."
  type        = string
  default     = "1.33"
}

variable "cluster_endpoint_public_access_cidrs" {
  description = "CIDRs allowed to reach the public EKS API endpoint. Restrict to your IP in real use."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "node_instance_types" {
  description = "Instance types for the managed node group (several types improve Spot availability)."
  type        = list(string)
  default     = ["t3.medium", "t3a.medium"]
}

variable "node_capacity_type" {
  description = "ON_DEMAND or SPOT."
  type        = string
  default     = "ON_DEMAND"

  validation {
    condition     = contains(["ON_DEMAND", "SPOT"], var.node_capacity_type)
    error_message = "node_capacity_type must be ON_DEMAND or SPOT."
  }
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_desired_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 4
}

variable "cluster_admin_principal_arns" {
  description = "Extra IAM principals (users/roles) granted cluster-admin through EKS access entries."
  type        = list(string)
  default     = []
}

# ── CI/CD ─────────────────────────────────────────────────────────────────────
variable "github_repository" {
  description = "GitHub repository (owner/name) allowed to assume the CI/CD role via OIDC."
  type        = string
  default     = "yuvi1-1/cloud-devops-platform"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC identity provider (set false if the account already has one)."
  type        = bool
  default     = true
}

variable "github_actions_role_name" {
  description = "Name of the IAM role GitHub Actions assumes."
  type        = string
  default     = "GitHubActions-CloudDevOps"
}

variable "app_namespaces" {
  description = "Namespaces the CI/CD role may deploy into (EKS access policy scope)."
  type        = list(string)
  default     = ["cloud-devops-dev", "cloud-devops-prod"]
}

# ── Data ──────────────────────────────────────────────────────────────────────
variable "create_rds" {
  description = "Create an Amazon RDS PostgreSQL instance for the prod namespace."
  type        = bool
  default     = false
}

variable "rds_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "rds_multi_az" {
  description = "Multi-AZ standby (recommended for production, doubles the cost)."
  type        = bool
  default     = false
}

variable "rds_deletion_protection" {
  type    = bool
  default = false
}

# ── GitOps ────────────────────────────────────────────────────────────────────
variable "enable_gitops" {
  description = "Install Argo CD and the root app-of-apps that deploys everything else from Git."
  type        = bool
  default     = true
}

variable "argocd_chart_version" {
  description = "argo-cd Helm chart version."
  type        = string
  default     = "10.9.6"
}

variable "argocd_apps_chart_version" {
  description = "argocd-apps Helm chart version."
  type        = string
  default     = "2.0.6"
}

variable "gitops_repo_url" {
  description = "Git repository Argo CD tracks."
  type        = string
  default     = "https://github.com/yuvi1-1/cloud-devops-platform.git"
}

variable "gitops_revision" {
  description = "Branch / tag Argo CD tracks."
  type        = string
  default     = "main"
}

variable "dev_hostname" {
  description = "Public hostname for the dev environment (CNAME it to the NLB)."
  type        = string
  default     = "dev.cloud-devops.example.com"
}

variable "prod_hostname" {
  description = "Public hostname for the prod environment (CNAME it to the NLB)."
  type        = string
  default     = "cloud-devops.example.com"
}

variable "letsencrypt_email" {
  description = "Enables HTTPS via cert-manager + Let's Encrypt when set (needs real DNS)."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Extra tags applied to every resource."
  type        = map(string)
  default     = {}
}
