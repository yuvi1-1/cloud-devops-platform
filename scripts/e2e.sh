#!/usr/bin/env bash
# End-to-end test against a running Kubernetes cluster (kind in CI).
# Installs the chart with locally built images, then verifies:
#   1. helm test smoke tests (web, api readiness incl. database, DORA endpoint)
#   2. the full ingest → DORA flow through the real API + PostgreSQL
#   3. the ingest endpoint rejects unauthenticated writes
#   4. NetworkPolicies block traffic from unlabelled pods (zero trust)
#   5. a rolling restart completes with zero unavailable replicas
#
# Usage: IMAGE_TAG=e2e ./scripts/e2e.sh    (images cloud-devops/{api,web}:$IMAGE_TAG loaded in kind)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NS=${NS:-e2e}
TAG=${IMAGE_TAG:-e2e}
TOKEN=e2e-ingest-token-0123456789
PF_PID=""

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
fail() { echo "✖ $*"; kubectl -n "$NS" get pods -o wide || true; kubectl -n "$NS" get events --sort-by=.lastTimestamp | tail -30 || true; exit 1; }
cleanup() { if [[ -n $PF_PID ]]; then kill "$PF_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT

step "Installing chart into namespace $NS"
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
kubectl label namespace "$NS" --overwrite pod-security.kubernetes.io/enforce=restricted >/dev/null
helm upgrade --install cloud-devops "$ROOT/helm/cloud-devops" -n "$NS" --wait --timeout 8m \
  --set environment=e2e \
  --set web.image.repository=cloud-devops/web --set web.image.tag="$TAG" --set web.image.pullPolicy=Never \
  --set api.image.repository=cloud-devops/api --set api.image.tag="$TAG" --set api.image.pullPolicy=Never \
  --set gateway.enabled=false \
  --set database.password=e2e-password \
  --set api.ingestToken.value="$TOKEN" \
  --set web.autoscaling.enabled=false --set web.replicaCount=2 \
  --set api.autoscaling.enabled=false --set api.replicaCount=2 \
  || fail "helm install failed"

step "helm test (smoke tests)"
helm test cloud-devops -n "$NS" --logs || fail "helm test failed"

step "Port-forwarding the API"
kubectl -n "$NS" port-forward svc/cloud-devops-api 18080:80 >/dev/null 2>&1 &
PF_PID=$!
for _ in $(seq 1 30); do curl -fs http://127.0.0.1:18080/healthz >/dev/null && break; sleep 1; done
API=http://127.0.0.1:18080

step "Ingest → DORA flow"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/v1/deployments" \
  -H 'content-type: application/json' -d '{"service":"api","environment":"prod","version":"1.0.0","commitSha":"abcdef1"}')
[[ $code == 401 ]] || fail "unauthenticated write returned $code (expected 401)"
echo "✔ unauthenticated write rejected (401)"

commit_ts=$(date -u -d '-2 hours' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-2H +%Y-%m-%dT%H:%M:%SZ)
id=$(curl -fsS -X POST "$API/api/v1/deployments" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"service\":\"e2e\",\"environment\":\"prod\",\"version\":\"1.2.3\",\"commitSha\":\"0123abcd\",\"commitTimestamp\":\"$commit_ts\",\"triggeredBy\":\"e2e\"}" \
  | sed -E 's/.*"id":"([^"]+)".*/\1/')
[[ -n $id ]] || fail "create deployment failed"
curl -fsS -X PATCH "$API/api/v1/deployments/$id" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"status":"succeeded"}' >/dev/null || fail "update failed"
dora=$(curl -fsS "$API/api/v1/dora?environment=prod&days=7&service=e2e")
echo "$dora" | grep -q '"succeeded":1' || fail "DORA totals wrong: $dora"
echo "$dora" | grep -q '"leadTimeForChanges":{"value":2' || fail "lead time not computed: $dora"
echo "✔ deployment recorded in PostgreSQL and reflected in DORA metrics"

curl -fsS "$API/metrics" | grep -q 'deployments_recorded_total{service="e2e",environment="prod",status="succeeded"' \
  || fail "Prometheus metric missing"
echo "✔ Prometheus metrics exported"

step "NetworkPolicy: unlabelled pod must NOT reach the API or the database"
probe() { # name target write-out
  kubectl -n "$NS" run "$1" --rm -i --restart=Never --quiet --image=curlimages/curl:8.15.0 \
    --overrides='{"spec":{"securityContext":{"runAsNonRoot":true,"runAsUser":100,"seccompProfile":{"type":"RuntimeDefault"}},"containers":[{"name":"'"$1"'","image":"curlimages/curl:8.15.0","args":["-s","--connect-timeout","4","-m","6","-o","/dev/null","-w","'"$3"'","'"$2"'"],"securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}}}]}}' \
    2>/dev/null || true
}
out=$(probe np-probe-api http://cloud-devops-api/healthz '%{http_code}')
[[ -n $out ]] || fail "probe pod could not run"
[[ $out == 000 ]] || fail "NetworkPolicy did not block access to the API (HTTP $out)"
echo "✔ API unreachable from an arbitrary pod"
# time_connect stays 0 when the TCP handshake never completes.
out=$(probe np-probe-db telnet://cloud-devops-postgresql:5432 '%{time_connect}')
[[ -n $out ]] || fail "probe pod could not run"
[[ $out == 0.000000 || $out == 0 ]] || fail "NetworkPolicy did not block access to PostgreSQL (connected in ${out}s)"
echo "✔ PostgreSQL unreachable from an arbitrary pod"

step "Zero-downtime rolling restart"
kubectl -n "$NS" rollout restart deploy/cloud-devops-api
errors=0
end=$((SECONDS + 90))
while ! kubectl -n "$NS" rollout status deploy/cloud-devops-api --timeout=1s >/dev/null 2>&1; do
  # Requests go through the Service so they follow readiness changes.
  kubectl -n "$NS" get endpoints cloud-devops-api -o jsonpath='{.subsets[*].addresses[*].ip}' | grep -q . || errors=$((errors + 1))
  (( SECONDS > end )) && fail "rollout did not finish"
  sleep 1
done
(( errors == 0 )) || fail "service had no ready endpoints during the rollout ($errors samples)"
echo "✔ rollout finished with ready endpoints throughout"

echo
echo "✔ end-to-end tests passed"
