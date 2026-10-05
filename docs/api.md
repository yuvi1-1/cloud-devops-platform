# API reference

Base path: `/api/v1`. All responses are JSON. Timestamps are ISO-8601 UTC.

## Probes and telemetry

| Method | Path | Description |
|---|---|---|
| GET | `/healthz` | Liveness — `200 {"status":"ok"}` while the process runs |
| GET | `/readyz` | Readiness — `200` when the database answers; `503` when it does not or during shutdown |
| GET | `/metrics` | Prometheus exposition format |

## Read endpoints (public)

### `GET /api/v1/info`

Build and runtime information — the dashboard uses it to show which pod served the request.

```json
{ "name": "cloud-devops-api", "version": "1fe1a24…", "commit": "1fe1a24…", "environment": "prod",
  "pod": "cloud-devops-api-7d9f8-abcde", "node": "ip-10-20-3-41.ap-south-1.compute.internal",
  "storage": "postgres", "uptimeSeconds": 5321, "nodeVersion": "v22.x" }
```

### `GET /api/v1/dora`

| Query | Default | Notes |
|---|---|---|
| `environment` | `prod` | `dev` \| `staging` \| `prod` |
| `days` | `30` | 1–365 |
| `service` | — | optional filter |

```json
{
  "environment": "prod", "service": null, "windowDays": 30,
  "from": "2026-09-05T12:00:00.000Z", "to": "2026-10-05T12:00:00.000Z",
  "totals": { "deployments": 79, "succeeded": 71, "failed": 8, "inProgress": 0 },
  "deploymentFrequency": { "value": 2.37, "unit": "deploys/day", "level": "elite" },
  "leadTimeForChanges":  { "value": 10.8, "unit": "hours", "level": "elite" },
  "changeFailureRate":   { "value": 10.1, "unit": "%", "level": "medium" },
  "timeToRestore":       { "value": 46.3, "unit": "hours", "level": "medium" },
  "daily": [ { "date": "2026-09-05", "succeeded": 2, "failed": 0 } ]
}
```

`level` is one of `elite`, `high`, `medium`, `low`, or `n/a` when there is no data. See [architecture.md §2.5](architecture.md#25-dora-calculations) for the formulas.

### `GET /api/v1/deployments`

Query: `service`, `environment`, `status`, `limit` (1–500, default 50). Newest first.

### `GET /api/v1/deployments/:id`

`404` if unknown.

### `GET /api/v1/services`

Latest deployment of every service in every environment (the dashboard's release matrix).

## Write endpoints (require `Authorization: Bearer <INGEST_TOKEN>`)

### `POST /api/v1/deployments` → `201`

| Field | Type | Required | Notes |
|---|---|---|---|
| `service` | string | ✔ | DNS-1123 label, e.g. `api` |
| `environment` | enum | ✔ | `dev` \| `staging` \| `prod` |
| `version` | string | ✔ | ≤ 128 chars |
| `commitSha` | string | ✔ | 7–40 hex characters (stored lowercase) |
| `status` | enum | | default `in_progress`; terminal statuses set `finishedAt` |
| `triggeredBy` | string | | default `unknown` |
| `commitTimestamp` | datetime | | enables lead-time calculation |
| `startedAt`, `finishedAt` | datetime | | for back-filling history |

### `PATCH /api/v1/deployments/:id` → `200`

Body: `{ "status": "succeeded" | "failed" | "rolled_back" | "in_progress", "finishedAt"?: datetime }`.

### Errors

| Status | When |
|---|---|
| `400` | validation failed — `{"error":"ValidationError","issues":[{"path":"service","message":"…"}]}` |
| `401` | missing or wrong token |
| `404` | unknown deployment |
| `429` | rate limit exceeded |
| `503` | ingest disabled (no `INGEST_TOKEN` configured) |

## Demo-only endpoint

`GET /api/v1/load?ms=50` burns CPU for up to 500 ms to exercise the HPA. It exists only when `ENABLE_LOAD_ENDPOINT=true` (dev and local).

## Example: report a deployment from any CI system

```bash
ID=$(curl -fsS -X POST "$DORA_API_URL/api/v1/deployments" \
  -H "authorization: Bearer $INGEST_TOKEN" -H 'content-type: application/json' \
  -d "{\"service\":\"checkout\",\"environment\":\"prod\",\"version\":\"$VERSION\",
       \"commitSha\":\"$GIT_SHA\",\"commitTimestamp\":\"$(git log -1 --format=%cI)\"}" | jq -r .id)
# … deploy …
curl -fsS -X PATCH "$DORA_API_URL/api/v1/deployments/$ID" \
  -H "authorization: Bearer $INGEST_TOKEN" -H 'content-type: application/json' -d '{"status":"succeeded"}'
```
