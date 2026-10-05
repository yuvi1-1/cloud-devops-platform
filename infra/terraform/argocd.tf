# GitOps bootstrap: Terraform installs only Argo CD and one root Application.
# Everything else (platform add-ons, policies, the app itself) is reconciled by
# Argo CD from ./gitops in this repository.

resource "helm_release" "argocd" {
  count = var.enable_gitops ? 1 : 0

  name             = "argocd"
  namespace        = "argocd"
  create_namespace = true
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  version          = var.argocd_chart_version
  wait             = true
  timeout          = 900

  values = [yamlencode({
    global = {
      domain = "argocd.local"
    }
    configs = {
      params = {
        # TLS is terminated at the Gateway; reach the UI with kubectl port-forward.
        "server.insecure" = true
      }
      cm = {
        # Rollouts and HTTPRoute weights are mutated by controllers at runtime.
        "resource.customizations.ignoreDifferences.gateway.networking.k8s.io_HTTPRoute" = yamlencode({
          jqPathExpressions = [".spec.rules[].backendRefs[].weight"]
        })
      }
    }
    controller = {
      metrics = { enabled = true }
    }
    server = {
      metrics = { enabled = true }
    }
    repoServer = {
      metrics = { enabled = true }
    }
  })]

  depends_on = [module.eks]
}

resource "helm_release" "gitops_bootstrap" {
  count = var.enable_gitops ? 1 : 0

  name       = "gitops-bootstrap"
  namespace  = "argocd"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argocd-apps"
  version    = var.argocd_apps_chart_version

  values = [yamlencode({
    applications = {
      root = {
        namespace  = "argocd"
        project    = "default"
        finalizers = ["resources-finalizer.argocd.argoproj.io"]
        source = {
          repoURL        = var.gitops_repo_url
          targetRevision = var.gitops_revision
          path           = "gitops/bootstrap"
          helm = {
            # Cluster facts only Terraform knows, handed to the GitOps layer
            # (the "GitOps bridge" pattern).
            valuesObject = {
              cluster = {
                provider = "eks"
                name     = module.eks.cluster_name
                region   = var.region
                vpcId    = module.vpc.vpc_id
              }
              repo = {
                url            = var.gitops_repo_url
                targetRevision = var.gitops_revision
              }
              secrets = {
                ingestTokenKey = aws_secretsmanager_secret.ingest_token.name
                databaseKey    = var.create_rds ? aws_db_instance.this[0].master_user_secret[0].secret_arn : ""
              }
              database = {
                prodHost = var.create_rds ? aws_db_instance.this[0].address : ""
              }
            }
          }
        }
        destination = {
          server    = "https://kubernetes.default.svc"
          namespace = "argocd"
        }
        syncPolicy = {
          automated = { prune = true, selfHeal = true }
        }
      }
    }
  })]

  depends_on = [helm_release.argocd]
}
