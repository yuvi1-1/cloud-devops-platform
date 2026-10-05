# ADR-0003: Canary releases with Argo Rollouts and Prometheus analysis

**Status:** Accepted

## Context

A rolling update replaces pods as soon as they pass readiness. Readiness proves the process works, not that the *new version behaves correctly under real traffic*. A bad release reaches 100% of users before anyone notices.

## Decision

Render the API as an Argo Rollouts `Rollout` (opt-in per environment) with:

* canary steps shifting traffic on the HTTPRoute (prod: 20 → 50 → 80 → 100%);
* background `AnalysisTemplate` querying Prometheus for the **canary pods only** (via the `rollouts_pod_template_hash` label added by the PodMonitor): success rate ≥ 95% and p95 latency ≤ 500 ms;
* automatic abort and traffic return on failure.

The web tier stays a standard Deployment (static content, low risk).

## Alternatives

* **Blue/green** — doubles capacity and switches 100% at once; less informative than gradual exposure.
* **Flagger** — similar capabilities; Argo Rollouts integrates naturally with Argo CD and has a dashboard/CLI suited to demos.
* **Manual verification gates** — slow and subjective.

## Consequences

* ✅ Bad releases affect a small share of traffic for a bounded time and roll back without humans.
* ✅ The change failure rate measured by the product reflects real, automatically detected failures.
* ⚠️ Analysis needs traffic; with none, the measurement is treated as success (`len(result) == 0 || isNaN(...)`). Low-traffic environments rely on the e2e tests instead.
* ⚠️ Requires a PodMonitor (not ServiceMonitor) because Rollouts rewrites Service selectors.
