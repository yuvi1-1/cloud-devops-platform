# Local development

## Tooling

| Tool | Needed for | Install (macOS) |
|---|---|---|
| Node.js 22 | app development and tests | `brew install node@22` or `nvm install 22` (`.nvmrc`) |
| Docker Desktop | compose stack, kind | docker.com |
| kind ≥ 0.24 | local Kubernetes | `brew install kind` |
| kubectl, Helm 3 | Kubernetes | `brew install kubectl helm` |
| Terraform ≥ 1.10 | IaC tests | `brew install terraform` (or `opentofu`) |
| kubeconform, kube-linter | manifest validation | `brew install kubeconform kube-linter` |
| k6 | load tests | `brew install k6` |
| Trivy | security scans | `brew install trivy` |

## Option A — hot reload (fastest inner loop)

```bash
npm ci
make dev-api     # http://localhost:3000 — in-memory store, 60 days of demo data
make dev-web     # http://localhost:5173 — Vite proxies /api to :3000
```

To run against PostgreSQL instead of the in-memory store:

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17-alpine
DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres MIGRATE_ON_START=true \
  SEED_DEMO_DATA=true npm run dev -w apps/api
```

### Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | listen address |
| `DATABASE_URL` or `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` | — | PostgreSQL; unset → in-memory store |
| `DATABASE_SSL`, `DATABASE_SSL_CA_FILE` | `false` | verified TLS to the database |
| `MIGRATE_ON_START` | `false` | apply migrations at boot (compose); Kubernetes uses an init container |
| `INGEST_TOKEN` | — | bearer token for write endpoints (≥ 16 chars); unset → writes disabled |
| `SEED_DEMO_DATA` | `false` | seed an empty store with synthetic history |
| `ENABLE_LOAD_ENDPOINT` | `false` | expose `/api/v1/load?ms=N` (HPA demos) |
| `CHAOS_ERROR_RATE` | `0` | share of `/api/v1/*` requests answered with HTTP 500 (rollback demos) |
| `RATE_LIMIT_PER_MINUTE` | `600` | per-client rate limit |
| `SHUTDOWN_DELAY_MS` | `5000` | drain window after SIGTERM |
| `LOG_LEVEL` | `info` | pino log level |

The web image takes `APP_VERSION` and `GIT_COMMIT` as build arguments (shown in the Platform panel).

## Option B — Docker Compose (production images)

```bash
docker compose up --build        # or: make up
```

Web on :8080, API on :3000, Prometheus on :9090 (with the same alert rules as the cluster), Grafana on :3001 (with the same dashboard). Containers run read-only with all capabilities dropped, like in Kubernetes.

## Option C — kind (real Kubernetes)

```bash
make kind-up         # ≈3 min: builds images, installs metrics-server, Envoy Gateway, the chart
open http://cloud-devops.localtest.me
make kind-full       # + Argo Rollouts and Prometheus/Grafana (give Docker ≥ 6 GB RAM)
make kind-gitops     # Argo CD installs everything from GitHub (needs public GHCR images)
make kind-down
```

`*.localtest.me` always resolves to `127.0.0.1`, and the kind control-plane maps host ports 80/443 to the Envoy Gateway NodePorts, so no `/etc/hosts` edits are needed.

## Tests and quality gates

```bash
make test                       # API + web tests
TEST_DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres npm test -w apps/api   # + PostgreSQL integration
npm run test:coverage -w apps/api
make lint typecheck
make validate                   # every Helm/GitOps manifest: lint, schema, kubeconform, kube-linter
make tf-test                    # Terraform fmt/validate/test (offline, mocked AWS)
make e2e                        # against the current kube context (e.g. after make kind-up)
make load-test                  # k6 with SLO thresholds
make scan                       # Trivy
make ci                         # most of the CI pipeline locally
```

## Project conventions

* **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat(api): …`, `fix(helm): …`, `ci: …`).
* **Branches:** short-lived feature branches, PR to `main`, squash or rebase merge.
* **Versioning:** images are tagged with the commit SHA; human-facing releases are git tags `vX.Y.Z`.
* **Environments are code:** never `kubectl edit` in dev/prod — change `gitops/` and let Argo CD apply it.
