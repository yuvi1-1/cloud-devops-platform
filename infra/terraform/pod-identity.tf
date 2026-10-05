# EKS Pod Identity: Kubernetes service accounts get scoped IAM roles without
# node-wide permissions or long-lived keys.

module "ebs_csi_pod_identity" {
  source  = "terraform-aws-modules/eks-pod-identity/aws"
  version = "~> 2.0"

  name                      = "${var.project}-ebs-csi"
  attach_aws_ebs_csi_policy = true
}

# Provisions the NLB in front of the Envoy Gateway data plane.
module "aws_lb_controller_pod_identity" {
  source  = "terraform-aws-modules/eks-pod-identity/aws"
  version = "~> 2.0"

  name                            = "${var.project}-aws-lbc"
  attach_aws_lb_controller_policy = true

  associations = {
    this = {
      cluster_name    = module.eks.cluster_name
      namespace       = "kube-system"
      service_account = "aws-load-balancer-controller"
    }
  }
}

# Lets the External Secrets Operator read only this project's secrets.
module "external_secrets_pod_identity" {
  source  = "terraform-aws-modules/eks-pod-identity/aws"
  version = "~> 2.0"

  name                                = "${var.project}-external-secrets"
  attach_external_secrets_policy      = true
  external_secrets_create_permission  = false
  external_secrets_ssm_parameter_arns = []
  external_secrets_secrets_manager_arns = concat(
    [aws_secretsmanager_secret.ingest_token.arn],
    var.create_rds ? [aws_db_instance.this[0].master_user_secret[0].secret_arn] : [],
  )

  associations = {
    this = {
      cluster_name    = module.eks.cluster_name
      namespace       = "external-secrets"
      service_account = "external-secrets"
    }
  }
}
