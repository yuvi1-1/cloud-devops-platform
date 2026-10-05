#!/usr/bin/env bash
# Horizontal Pod Autoscaler demo: generate CPU load against the API's
# /api/v1/load endpoint from inside the cluster and watch replicas scale out
# (and back in ~2 minutes after the load stops).
#
#   ./scripts/hpa-demo.sh [namespace] [duration-seconds]
set -euo pipefail
NS=${1:-cloud-devops}
DURATION=${2:-180}

echo "Starting load generator in $NS for ${DURATION}s (Ctrl+C to stop early)…"
kubectl -n "$NS" delete pod load-generator --ignore-not-found >/dev/null
# shellcheck disable=SC2016 # $(...) is evaluated inside the pod, not here
kubectl -n "$NS" run load-generator --restart=Never --image=curlimages/curl:8.15.0 \
  --labels=cloud-devops.io/client=true,app.kubernetes.io/component=test \
  --overrides='{"spec":{"securityContext":{"runAsNonRoot":true,"runAsUser":100,"seccompProfile":{"type":"RuntimeDefault"}},"containers":[{"name":"load-generator","image":"curlimages/curl:8.15.0","command":["sh","-c","end=$(( $(date +%s) + '"$DURATION"' )); while [ $(date +%s) -lt $end ]; do for i in 1 2 3 4 5 6 7 8; do curl -s -o /dev/null http://cloud-devops-api/api/v1/load?ms=200 & done; wait; done"],"resources":{"requests":{"cpu":"50m","memory":"16Mi"},"limits":{"memory":"64Mi"}},"securityContext":{"allowPrivilegeEscalation":false,"readOnlyRootFilesystem":true,"capabilities":{"drop":["ALL"]}}}]}}' >/dev/null
trap 'kubectl -n "$NS" delete pod load-generator --ignore-not-found >/dev/null' EXIT

echo "Watching the HPA (CPU target 70%). Replicas should climb within ~1 minute:"
kubectl -n "$NS" get hpa cloud-devops-api -w &
WATCH=$!
sleep "$DURATION"
kill "$WATCH" 2>/dev/null || true
kubectl -n "$NS" top pods -l app.kubernetes.io/component=api || true
