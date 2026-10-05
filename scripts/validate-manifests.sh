#!/usr/bin/env bash
# Render every Helm chart in the repo with every supported value combination and
# validate the output: helm lint (+ values.schema.json), kubeconform (Kubernetes
# + CRD schemas) and kube-linter (best practices). Used by CI and locally.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
K8S_VERSION="${K8S_VERSION:-1.33.0}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

need() { command -v "$1" >/dev/null 2>&1 || { echo "✖ '$1' is required (see docs/local-development.md)"; exit 1; }; }
need helm
need kubeconform
HAVE_KUBE_LINTER=1
command -v kube-linter >/dev/null 2>&1 || { HAVE_KUBE_LINTER=0; echo "⚠ kube-linter not found — skipping best-practice lint"; }

CRD_SCHEMAS='https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'
conform() {
  kubeconform -strict -summary -kubernetes-version "$K8S_VERSION" \
    -schema-location default -schema-location "$CRD_SCHEMAS" "$@"
}

render() { # name chart [helm args...]
  local name=$1 chart=$2; shift 2
  echo "▶ $name"
  helm lint "$chart" --strict "$@" >/dev/null
  helm template "$name" "$chart" "$@" >"$OUT/$name.yaml"
  conform "$OUT/$name.yaml"
}

APP="$ROOT/helm/cloud-devops"
for f in "$APP"/ci/*.yaml; do
  render "app-$(basename "$f" .yaml)" "$APP" -f "$f" --namespace cloud-devops
done
for env in dev prod; do
  render "app-env-$env" "$APP" -f "$ROOT/gitops/environments/$env/values.yaml" \
    --set environment="$env" --set database.password=ci --set api.ingestToken.value=ci-ingest-token-0000 \
    --namespace "cloud-devops-$env"
done

render bootstrap-eks "$ROOT/gitops/bootstrap"
render bootstrap-kind "$ROOT/gitops/bootstrap" -f "$ROOT/gitops/bootstrap/values-kind.yaml"
render platform-eks "$ROOT/gitops/platform/config" --set gateway.letsEncryptEmail=ci@example.com
render platform-kind "$ROOT/gitops/platform/config" --set cluster.provider=kind

if [[ $HAVE_KUBE_LINTER == 1 ]]; then
  echo "▶ kube-linter"
  kube-linter lint --config "$ROOT/.kube-linter.yaml" "$OUT"/app-*.yaml
fi

# Negative tests: the schema / templates must reject bad input.
expect_fail() { # description helm-args...
  local desc=$1; shift
  if helm template t "$APP" "$@" >/dev/null 2>&1; then
    echo "✖ expected failure: $desc"; exit 1
  fi
  echo "✔ rejects: $desc"
}
expect_fail "missing database password"
expect_fail "unknown top-level key" --set database.password=x --set wbe.enabled=true
expect_fail "short ingest token" --set database.password=x --set api.ingestToken.value=short
expect_fail "invalid database mode" --set database.password=x --set database.mode=sqlite
expect_fail "chaos rate above 1" --set database.password=x --set api.chaosErrorRate=2

echo "✔ all manifests valid"
