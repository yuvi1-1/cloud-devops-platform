#!/usr/bin/env bash
# Spin up the whole platform on a local kind cluster.
#
#   ./scripts/kind-up.sh                 # app + Envoy Gateway + metrics-server (≈3 min)
#   ./scripts/kind-up.sh --with-rollouts # + Argo Rollouts (canary demo)
#   ./scripts/kind-up.sh --with-monitoring # + Prometheus/Grafana (needs ~6 GB RAM for Docker)
#   ./scripts/kind-up.sh --gitops        # Argo CD manages everything from GitHub (images from GHCR)
#
# Then open http://cloud-devops.localtest.me (localtest.me always resolves to 127.0.0.1).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER=cloud-devops
NS=cloud-devops
HOST=cloud-devops.localtest.me
ENVOY_GATEWAY_VERSION=v1.9.2
ARGOCD_CHART_VERSION=10.9.6
ROLLOUTS_CHART_VERSION=2.43.5
KPS_CHART_VERSION=91.9.0
METRICS_SERVER_CHART_VERSION=3.14.0

WITH_ROLLOUTS=0
WITH_MONITORING=0
GITOPS=0
for arg in "$@"; do
  case $arg in
    --with-rollouts) WITH_ROLLOUTS=1 ;;
    --with-monitoring) WITH_MONITORING=1 ;;
    --gitops) GITOPS=1 ;;
    -h | --help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg"; exit 1 ;;
  esac
done

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "✖ '$1' is required — see docs/local-development.md"; exit 1; }; }
for t in docker kind kubectl helm; do need "$t"; done

step "Creating kind cluster '$CLUSTER'"
if kind get clusters | grep -qx "$CLUSTER"; then
  echo "cluster already exists — reusing it"
else
  kind create cluster --config "$ROOT/local/kind-config.yaml" --wait 120s
fi
kubectl config use-context "kind-$CLUSTER" >/dev/null

if [[ $GITOPS == 1 ]]; then
  step "Installing Argo CD"
  helm upgrade --install argocd argo-cd --repo https://argoproj.github.io/argo-helm \
    --version "$ARGOCD_CHART_VERSION" -n argocd --create-namespace --wait \
    --set 'configs.params.server\.insecure=true'
  step "Creating the root app-of-apps (kind profile)"
  kubectl apply -f - <<YAML
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/yuvi1-1/cloud-devops-platform.git
    targetRevision: main
    path: gitops/bootstrap
    helm:
      valueFiles: [values-kind.yaml]
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated: { prune: true, selfHeal: true }
YAML
  echo
  echo "Argo CD is now installing the platform (takes ~5-10 min). Watch it with:"
  echo "  kubectl -n argocd port-forward svc/argocd-server 8081:80   → http://localhost:8081"
  echo "  user: admin   password: \$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d)"
  echo "Dev environment: http://dev.$HOST"
  exit 0
fi

step "Building images"
docker build -f "$ROOT/apps/api/Dockerfile" -t cloud-devops/api:local \
  --build-arg APP_VERSION=local --build-arg GIT_COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)" "$ROOT"
docker build -f "$ROOT/apps/web/Dockerfile" -t cloud-devops/web:local \
  --build-arg APP_VERSION=local --build-arg GIT_COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)" "$ROOT"
kind load docker-image cloud-devops/api:local cloud-devops/web:local --name "$CLUSTER"

step "Installing metrics-server (HPA metrics)"
helm upgrade --install metrics-server metrics-server --repo https://kubernetes-sigs.github.io/metrics-server \
  --version "$METRICS_SERVER_CHART_VERSION" -n kube-system --set 'args={--kubelet-insecure-tls}' --wait

step "Installing Envoy Gateway (Gateway API)"
helm upgrade --install envoy-gateway oci://docker.io/envoyproxy/gateway-helm \
  --version "$ENVOY_GATEWAY_VERSION" -n envoy-gateway-system --create-namespace --wait

if [[ $WITH_ROLLOUTS == 1 ]]; then
  step "Installing Argo Rollouts (+ Gateway API plugin)"
  helm upgrade --install argo-rollouts argo-rollouts --repo https://argoproj.github.io/argo-helm \
    --version "$ROLLOUTS_CHART_VERSION" -n argo-rollouts --create-namespace --wait \
    -f "$ROOT/gitops/platform/values/argo-rollouts.yaml" \
    --set controller.metrics.serviceMonitor.enabled=false
fi

if [[ $WITH_MONITORING == 1 ]]; then
  step "Installing kube-prometheus-stack (Prometheus, Grafana, Alertmanager)"
  helm upgrade --install kube-prometheus-stack kube-prometheus-stack \
    --repo https://prometheus-community.github.io/helm-charts --version "$KPS_CHART_VERSION" \
    -n monitoring --create-namespace --wait --timeout 10m \
    -f "$ROOT/gitops/platform/values/kube-prometheus-stack.yaml" \
    --set grafana.additionalDataSources=null
fi

step "Configuring the shared Gateway"
helm upgrade --install platform-config "$ROOT/gitops/platform/config" -n envoy-gateway-system \
  --set cluster.provider=kind --set policies.enabled=false --set "appNamespaces={$NS}" --wait
kubectl wait --for=condition=Programmed gateway/platform-gateway -n envoy-gateway-system --timeout=180s

bool() { [[ $1 == 1 ]] && echo true || echo false; }
ROLLOUTS=$(bool "$WITH_ROLLOUTS")
MONITORING=$(bool "$WITH_MONITORING")

step "Deploying Cloud DevOps Platform"
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
kubectl label namespace "$NS" --overwrite \
  cloud-devops.io/gateway-access=true \
  pod-security.kubernetes.io/enforce=restricted >/dev/null
helm upgrade --install cloud-devops "$ROOT/helm/cloud-devops" -n "$NS" --wait --timeout 10m \
  --set environment=local \
  --set web.image.repository=cloud-devops/web --set web.image.tag=local \
  --set api.image.repository=cloud-devops/api --set api.image.tag=local \
  --set "gateway.hostnames={$HOST}" \
  --set database.password=local-dev-only-password \
  --set api.ingestToken.value=local-dev-ingest-token \
  --set api.seedDemoData=true --set api.enableLoadEndpoint=true \
  --set api.rollout.enabled="$ROLLOUTS" \
  --set api.rollout.analysis.enabled="$MONITORING" \
  --set monitoring.podMonitor.enabled="$MONITORING" \
  --set monitoring.prometheusRule.enabled="$MONITORING" \
  --set monitoring.grafanaDashboard.enabled="$MONITORING"

step "Running helm test"
helm test cloud-devops -n "$NS" --logs

cat <<MSG

✔ Platform is up
  Dashboard     http://$HOST
  DORA API      http://$HOST/api/v1/dora?environment=prod&days=30
  Ingest token  local-dev-ingest-token
  Pods          kubectl -n $NS get pods -o wide
  HPA demo      ./scripts/hpa-demo.sh
MSG
if [[ $WITH_MONITORING == 1 ]]; then
  echo "  Grafana       kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3001:80  (admin / prom-operator)"
fi
if [[ $WITH_ROLLOUTS == 1 ]]; then
  echo "  Canary demo   see docs/demo-guide.md"
fi
