module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = local.name
  kubernetes_version = var.kubernetes_version

  # Public endpoint (restricted by CIDR) so CI and laptops can reach the API.
  endpoint_public_access       = true
  endpoint_public_access_cidrs = var.cluster_endpoint_public_access_cidrs

  # EKS access entries (API auth mode) instead of the legacy aws-auth ConfigMap.
  authentication_mode                      = "API"
  enable_cluster_creator_admin_permissions = true

  # Control-plane audit trail in CloudWatch.
  enabled_log_types = ["api", "audit", "authenticator"]

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  addons = {
    # Installed before nodes so pods get networking + identity immediately
    # (avoids the "cni plugin not initialized" NotReady issue hit in v1).
    vpc-cni = {
      before_compute = true
      # Enforce Kubernetes NetworkPolicies natively with the VPC CNI.
      configuration_values = jsonencode({
        enableNetworkPolicy = "true"
      })
    }
    eks-pod-identity-agent = {
      before_compute = true
    }
    coredns    = {}
    kube-proxy = {}
    aws-ebs-csi-driver = {
      pod_identity_association = [{
        role_arn        = module.ebs_csi_pod_identity.iam_role_arn
        service_account = "ebs-csi-controller-sa"
      }]
    }
    # Feeds the Horizontal Pod Autoscaler with CPU / memory metrics.
    metrics-server = {}
  }

  eks_managed_node_groups = {
    default = {
      ami_type       = "AL2023_x86_64_STANDARD"
      instance_types = var.node_instance_types
      capacity_type  = var.node_capacity_type

      min_size     = var.node_min_size
      max_size     = var.node_max_size
      desired_size = var.node_desired_size

      # IMDSv2 only, single hop: pods cannot steal the node's instance role.
      metadata_options = {
        http_endpoint               = "enabled"
        http_tokens                 = "required"
        http_put_response_hop_limit = 1
      }

      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size = 30
            volume_type = "gp3"
            encrypted   = true
          }
        }
      }

      labels = {
        workload = "general"
      }
    }
  }

  access_entries = merge(
    {
      # GitHub Actions may only edit resources inside the application namespaces.
      github_actions = {
        principal_arn = aws_iam_role.github_actions.arn
        policy_associations = {
          edit = {
            policy_arn = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"
            access_scope = {
              type       = "namespace"
              namespaces = var.app_namespaces
            }
          }
          view = {
            policy_arn = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSViewPolicy"
            access_scope = {
              type = "cluster"
            }
          }
        }
      }
    },
    {
      for i, arn in var.cluster_admin_principal_arns : "admin_${i}" => {
        principal_arn = arn
        policy_associations = {
          admin = {
            policy_arn = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
            access_scope = {
              type = "cluster"
            }
          }
        }
      }
    }
  )
}
