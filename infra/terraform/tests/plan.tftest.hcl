# Offline unit tests: `terraform test` plans the whole stack against mocked
# providers (no AWS credentials, no cost) and asserts on security-relevant intent.

mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = {
      names = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
    }
  }
  mock_data "aws_partition" {
    defaults = {
      partition  = "aws"
      dns_suffix = "amazonaws.com"
    }
  }
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:user/test"
    }
  }
  mock_data "aws_region" {
    defaults = {
      name   = "ap-south-1"
      region = "ap-south-1"
    }
  }
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
  mock_data "aws_iam_session_context" {
    defaults = {
      issuer_arn = "arn:aws:iam::123456789012:role/test"
    }
  }
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/mock"
    }
  }
  mock_resource "aws_iam_policy" {
    defaults = {
      arn = "arn:aws:iam::123456789012:policy/mock"
    }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }
  mock_resource "aws_eks_cluster" {
    defaults = {
      arn                   = "arn:aws:eks:ap-south-1:123456789012:cluster/cloud-devops-cluster"
      endpoint              = "https://example.eks.amazonaws.com"
      certificate_authority = [{ data = "Y2E=" }]
      identity              = [{ oidc = [{ issuer = "https://oidc.eks.ap-south-1.amazonaws.com/id/EXAMPLE" }] }]
    }
  }
  mock_resource "aws_kms_key" {
    defaults = {
      arn = "arn:aws:kms:ap-south-1:123456789012:key/mock"
    }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = {
      arn = "arn:aws:secretsmanager:ap-south-1:123456789012:secret:cloud-devops/ingest-token-AbCdEf"
    }
  }
  mock_resource "aws_db_instance" {
    defaults = {
      address            = "cloud-devops-prod.abc.ap-south-1.rds.amazonaws.com"
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:ap-south-1:123456789012:secret:rds!db-mock", kms_key_id = "", secret_status = "active" }]
    }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:ap-south-1:123456789012:log-group:mock"
    }
  }
  mock_resource "aws_launch_template" {
    defaults = {
      id = "lt-0123456789abcdef0"
    }
  }
}

mock_provider "helm" {}
mock_provider "random" {}
mock_provider "tls" {}
mock_provider "time" {}
mock_provider "cloudinit" {}
mock_provider "null" {}

variables {
  az_count = 3
}

run "default_plan" {
  command = plan

  assert {
    condition     = output.configure_kubectl == "aws eks update-kubeconfig --region ap-south-1 --name cloud-devops-cluster"
    error_message = "Unexpected cluster name / region"
  }

  assert {
    condition     = aws_iam_role.github_actions.name == "GitHubActions-CloudDevOps"
    error_message = "GitHub Actions role name must stay stable for existing workflows"
  }

  assert {
    # (the rendered policy JSON is unknown at plan time because it embeds the provider ARN)
    condition     = contains(local.github_oidc_subjects, "repo:yuvi1-1/cloud-devops-platform:ref:refs/heads/main") && alltrue([for s in local.github_oidc_subjects : !endswith(s, ":*")])
    error_message = "OIDC trust must be restricted to this repository"
  }

  assert {
    condition     = length(aws_db_instance.this) == 0
    error_message = "RDS must be opt-in"
  }

  assert {
    condition     = length(helm_release.argocd) == 1
    error_message = "Argo CD should be installed by default"
  }
}

run "with_rds" {
  command = plan

  variables {
    create_rds              = true
    rds_multi_az            = true
    rds_deletion_protection = true
  }

  assert {
    condition     = aws_db_instance.this[0].storage_encrypted && !aws_db_instance.this[0].publicly_accessible
    error_message = "RDS must be encrypted and private"
  }

  assert {
    condition     = aws_db_instance.this[0].manage_master_user_password
    error_message = "RDS password must be managed by Secrets Manager"
  }

  assert {
    condition     = one([for p in aws_db_parameter_group.this[0].parameter : p.value if p.name == "rds.force_ssl"]) == "1"
    error_message = "RDS must enforce TLS"
  }
}

run "rejects_single_az" {
  command = plan

  variables {
    az_count = 1
  }

  expect_failures = [var.az_count]
}
