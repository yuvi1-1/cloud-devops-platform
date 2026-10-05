import type { FastifyInstance } from 'fastify';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export interface AppMetrics {
  registry: Registry;
  httpDuration: Histogram<'method' | 'route' | 'status_code'>;
  httpRequests: Counter<'method' | 'route' | 'status_code'>;
  deploymentsRecorded: Counter<'service' | 'environment' | 'status'>;
}

/**
 * RED metrics (Rate, Errors, Duration) in Prometheus format. A dedicated
 * registry per app instance keeps tests isolated.
 */
export function createMetrics(defaultLabels: Record<string, string>): AppMetrics {
  const registry = new Registry();
  registry.setDefaultLabels(defaultLabels);
  collectDefaultMetrics({ register: registry });

  return {
    registry,
    httpDuration: new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [registry],
    }),
    httpRequests: new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [registry],
    }),
    deploymentsRecorded: new Counter({
      name: 'deployments_recorded_total',
      help: 'Deployment events recorded through the ingest API',
      labelNames: ['service', 'environment', 'status'],
      registers: [registry],
    }),
  };
}

const IGNORED_ROUTES = new Set(['/metrics', '/healthz', '/readyz']);

export function registerHttpMetrics(app: FastifyInstance, metrics: AppMetrics) {
  app.addHook('onResponse', async (request, reply) => {
    // Use the route *template* (/api/v1/deployments/:id) to keep label cardinality bounded.
    const route = request.routeOptions.url ?? 'unmatched';
    if (IGNORED_ROUTES.has(route)) return;
    const labels = { method: request.method, route, status_code: String(reply.statusCode) };
    metrics.httpRequests.inc(labels);
    metrics.httpDuration.observe(labels, reply.elapsedTime / 1000);
  });
}
