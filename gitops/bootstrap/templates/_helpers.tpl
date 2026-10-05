{{- define "bootstrap.syncPolicy" -}}
automated:
  prune: true
  selfHeal: true
syncOptions:
  - CreateNamespace=true
  # Large CRDs (Prometheus operator, Envoy Gateway) exceed the client-side apply annotation limit.
  - ServerSideApply=true
retry:
  limit: 10
  backoff:
    duration: 15s
    factor: 2
    maxDuration: 5m
{{- end }}
