# ADR-0007: A DORA metrics service as the application

**Status:** Accepted · **Supersedes:** v1 Vite starter page

## Context

v1 deployed the default Vite template. A platform project is more convincing — and more realistic — when it ships a stateful, observable service with a database, migrations and an API, and when the application has a reason to exist.

## Decision

Build a DORA metrics service: an API that ingests deployment events and computes deployment frequency, lead time, change failure rate and time to restore; and a dashboard to explore them. Connect the platform's own pipeline to it (`record-deployment.yml`) so the project measures itself.

## Consequences

* ✅ Exercises real platform concerns: stateful data, migrations, readiness depending on a database, secrets, RED metrics, canary analysis on real traffic.
* ✅ Produces a compelling demo: the dashboard shows the delivery performance of the system that deployed it.
* ⚠️ Synthetic demo data (`SEED_DEMO_DATA`) is enabled in dev only, so prod metrics are genuine.
