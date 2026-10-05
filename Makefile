# Cloud DevOps Platform — common tasks. `make help` lists them.
SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage: make \033[36m<target>\033[0m\n\n"} /^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

##@ Develop
.PHONY: install dev-api dev-web lint typecheck test build
install: ## Install npm dependencies (all workspaces)
	npm ci
dev-api: ## Run the API with hot reload (in-memory store + demo data)
	SEED_DEMO_DATA=true INGEST_TOKEN=local-dev-ingest-token ENABLE_LOAD_ENDPOINT=true LOG_LEVEL=debug npm run dev -w apps/api
dev-web: ## Run the dashboard with hot reload (proxies /api to :3000)
	npm run dev -w apps/web
lint: ## ESLint all workspaces
	npm run lint
typecheck: ## TypeScript type-check all workspaces
	npm run typecheck
test: ## Unit + component tests (set TEST_DATABASE_URL for PostgreSQL integration tests)
	npm test
build: ## Production builds
	npm run build

##@ Containers
.PHONY: up down logs
up: ## Full stack with docker compose (web, api, postgres, prometheus, grafana)
	docker compose up --build -d
	@echo "Dashboard http://localhost:8080 · API http://localhost:3000 · Prometheus http://localhost:9090 · Grafana http://localhost:3001"
down: ## Stop the compose stack and delete its volume
	docker compose down -v
logs: ## Follow compose logs
	docker compose logs -f api web

##@ Kubernetes (local kind cluster)
.PHONY: kind-up kind-full kind-gitops kind-down e2e hpa-demo load-test
kind-up: ## Platform on kind: app + Envoy Gateway + metrics-server
	./scripts/kind-up.sh
kind-full: ## kind + Argo Rollouts + Prometheus/Grafana (canary & observability demos)
	./scripts/kind-up.sh --with-rollouts --with-monitoring
kind-gitops: ## kind managed by Argo CD from GitHub (app-of-apps)
	./scripts/kind-up.sh --gitops
kind-down: ## Delete the kind cluster
	./scripts/kind-down.sh
e2e: ## End-to-end tests against the current kube context
	./scripts/e2e.sh
hpa-demo: ## Generate load and watch the HPA scale the API
	./scripts/hpa-demo.sh
load-test: ## k6 load test with SLO thresholds (BASE_URL=...)
	k6 run -e BASE_URL=$${BASE_URL:-http://cloud-devops.localtest.me} tests/load/k6-smoke-and-load.js

##@ Quality gates
.PHONY: validate tf-test tf-lint scan ci
validate: ## Lint + render + schema-check every Helm chart / GitOps manifest
	./scripts/validate-manifests.sh
tf-test: ## terraform fmt/validate/test (offline, mocked providers)
	cd infra/terraform && terraform fmt -check -recursive && terraform init -backend=false -input=false >/dev/null && terraform validate && terraform test
tf-lint: ## tflint
	cd infra/terraform && tflint --init && tflint
scan: ## Trivy scan of the repository (vulns, secrets, misconfigurations)
	trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL .
ci: lint typecheck test build validate tf-test ## Run the CI checks locally

##@ AWS
.PHONY: aws-plan aws-apply aws-destroy kubeconfig
aws-plan: ## terraform plan for the EKS platform
	cd infra/terraform && terraform init -backend-config=environments/shared.s3.tfbackend && terraform plan -var-file=environments/shared.tfvars
aws-apply: ## terraform apply (creates billable AWS resources!)
	cd infra/terraform && terraform apply -var-file=environments/shared.tfvars
aws-destroy: ## Tear everything down to stop AWS charges
	./scripts/aws-destroy.sh
kubeconfig: ## Point kubectl at the EKS cluster
	aws eks update-kubeconfig --region ap-south-1 --name cloud-devops-cluster
