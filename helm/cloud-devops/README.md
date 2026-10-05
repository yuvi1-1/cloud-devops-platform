# cloud-devops Helm chart

Deploys the Cloud DevOps Platform: `web` (React/NGINX), `api` (Fastify) and optionally PostgreSQL.

```bash
helm upgrade --install cloud-devops helm/cloud-devops -n cloud-devops --create-namespace \
  --set database.password=change-me \
  --set api.ingestToken.value=at-least-16-characters \
  --set "gateway.hostnames={cloud-devops.example.com}"
helm test cloud-devops -n cloud-devops
```

Values are validated by `values.schema.json`; unknown keys are rejected.

## Key values

| Key | Default | Description |
|---|---|---|
| `environment` | `local` | label shown by the API/UI |
| `global.imageTag` | `""` → `appVersion` | tag for both images (CI sets the commit SHA) |
| `web.image.*`, `api.image.*` | GHCR | repository / tag / `digest` (digest wins) |
| `api.ingestToken.existingSecret` / `.value` | — | bearer token for write endpoints |
| `api.seedDemoData` | `false` | synthetic history for demos |
| `api.enableLoadEndpoint` | `false` | `/api/v1/load` for HPA demos |
| `api.chaosErrorRate` | `0` | fault injection (0–1) for rollback demos |
| `api.rollout.enabled` | `false` | Argo Rollouts canary instead of a Deployment |
| `api.rollout.steps` | 20/50/80% | canary steps |
| `api.rollout.analysis.*` | enabled | Prometheus address, success rate ≥ 0.95, p95 ≤ 0.5 s |
| `*.autoscaling.*` | enabled | HPA min/max and CPU/memory targets |
| `*.podDisruptionBudget.*` | `minAvailable: 1` | PDB |
| `database.mode` | `internal` | `internal` StatefulSet · `external` (RDS) · `none` (in-memory) |
| `database.password` / `existingSecret` | — | required unless External Secrets is used |
| `database.external.host`, `.ssl`, `.caFile` | — / `true` / RDS bundle | external PostgreSQL with verified TLS |
| `externalSecrets.enabled` | `false` | sync DB password / ingest token from AWS Secrets Manager |
| `gateway.enabled` | `true` | HTTPRoutes on `gateway.parentRefs` for `gateway.hostnames` |
| `ingress.enabled` | `false` | classic Ingress fallback |
| `networkPolicy.enabled` | `true` | default-deny + explicit allows |
| `networkPolicy.ingressNamespaces` | `[envoy-gateway-system]` | namespaces allowed to reach web/api |
| `monitoring.podMonitor/prometheusRule/grafanaDashboard.enabled` | `false` | kube-prometheus-stack integration |
| `topologySpread.enabled` | `true` | spread replicas across zones and nodes |

`ci/*.yaml` contains value sets exercised by CI (`scripts/validate-manifests.sh`).
