import { createHash, timingSafeEqual } from 'node:crypto';
import os from 'node:os';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { Config } from './config.js';
import { summarizeServices, type DeploymentRepository } from './db/repository.js';
import { computeDora } from './domain/dora.js';
import {
  CreateDeploymentSchema,
  DoraQuerySchema,
  ListDeploymentsQuerySchema,
  UpdateDeploymentSchema,
  serializeDeployment,
} from './domain/types.js';
import { createMetrics, registerHttpMetrics } from './metrics.js';

export interface AppState {
  shuttingDown: boolean;
}

export interface BuildOptions {
  config: Config;
  repo: DeploymentRepository;
  state?: AppState;
}

const DAY = 86_400_000;

const sha256 = (s: string) => createHash('sha256').update(s).digest();

export async function buildApp({ config, repo, state = { shuttingDown: false } }: BuildOptions) {
  const app: FastifyInstance = Fastify({
    trustProxy: true,
    bodyLimit: 64 * 1024,
    logger:
      config.LOG_LEVEL === 'silent'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: ['req.headers.authorization'],
            // Structured JSON logs → collected by Promtail/Loki in the cluster.
            base: { service: 'cloud-devops-api', version: config.APP_VERSION, pod: config.POD_NAME },
          },
  });

  const metrics = createMetrics({ app: 'cloud-devops-api', version: config.APP_VERSION });
  registerHttpMetrics(app, metrics);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    allowList: (req) => ['/healthz', '/readyz', '/metrics'].includes(req.url),
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, request, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: 'ValidationError',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) request.log.error({ err }, 'unhandled error');
    return reply.status(status).send({ error: status >= 500 ? 'InternalServerError' : err.name, message: err.message });
  });

  // ── Fault injection (demo of automated canary rollback) ─────────────────────
  if (config.CHAOS_ERROR_RATE > 0) {
    app.log.warn({ rate: config.CHAOS_ERROR_RATE }, 'chaos mode enabled: injecting HTTP 500s');
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/') && Math.random() < config.CHAOS_ERROR_RATE) {
        return reply.status(500).send({ error: 'InjectedFault', message: 'chaos mode' });
      }
    });
  }

  // ── Auth for write endpoints ────────────────────────────────────────────────
  const expectedToken = config.INGEST_TOKEN ? sha256(config.INGEST_TOKEN) : null;
  async function requireIngestToken(request: FastifyRequest, reply: FastifyReply) {
    if (!expectedToken) {
      return reply.status(503).send({ error: 'IngestDisabled', message: 'INGEST_TOKEN is not configured' });
    }
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    // Compare fixed-length digests in constant time to avoid timing side channels.
    if (!token || !timingSafeEqual(sha256(token), expectedToken)) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  }

  // ── Probes & telemetry ─────────────────────────────────────────────────────
  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_req, reply) => {
    if (state.shuttingDown) return reply.status(503).send({ status: 'shutting_down' });
    try {
      await repo.ping();
      return { status: 'ready', storage: repo.kind };
    } catch (err) {
      app.log.warn({ err }, 'readiness check failed');
      return reply.status(503).send({ status: 'unavailable', storage: repo.kind });
    }
  });

  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  // ── API v1 ─────────────────────────────────────────────────────────────────
  const startedAt = Date.now();
  app.get('/api/v1/info', async () => ({
    name: 'cloud-devops-api',
    version: config.APP_VERSION,
    commit: config.GIT_COMMIT,
    environment: config.DEPLOY_ENVIRONMENT,
    pod: config.POD_NAME ?? os.hostname(),
    node: config.NODE_NAME ?? null,
    storage: repo.kind,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    nodeVersion: process.version,
  }));

  app.get('/api/v1/deployments', async (request) => {
    const query = ListDeploymentsQuerySchema.parse(request.query);
    const items = await repo.list(query);
    return { items: items.map(serializeDeployment), count: items.length };
  });

  app.get<{ Params: { id: string } }>('/api/v1/deployments/:id', async (request, reply) => {
    const found = await repo.get(request.params.id).catch(() => null);
    if (!found) return reply.status(404).send({ error: 'NotFound' });
    return serializeDeployment(found);
  });

  app.post('/api/v1/deployments', { preHandler: requireIngestToken }, async (request, reply) => {
    const input = CreateDeploymentSchema.parse(request.body);
    const created = await repo.create(input);
    metrics.deploymentsRecorded.inc({ service: created.service, environment: created.environment, status: created.status });
    request.log.info({ deployment: created.id, service: created.service, env: created.environment }, 'deployment recorded');
    return reply.status(201).send(serializeDeployment(created));
  });

  app.patch<{ Params: { id: string } }>(
    '/api/v1/deployments/:id',
    { preHandler: requireIngestToken },
    async (request, reply) => {
      const input = UpdateDeploymentSchema.parse(request.body);
      const updated = await repo.update(request.params.id, input).catch(() => null);
      if (!updated) return reply.status(404).send({ error: 'NotFound' });
      metrics.deploymentsRecorded.inc({ service: updated.service, environment: updated.environment, status: updated.status });
      return serializeDeployment(updated);
    },
  );

  app.get('/api/v1/dora', async (request) => {
    const q = DoraQuerySchema.parse(request.query);
    const now = new Date();
    const since = new Date(now.getTime() - q.days * DAY);
    const rows = await repo.listSince(q.environment, since, q.service);
    return computeDora(rows, { environment: q.environment, service: q.service, windowDays: q.days, now });
  });

  app.get('/api/v1/services', async () => {
    const latest = await repo.latestPerServiceEnvironment();
    return {
      items: summarizeServices(latest).map((s) => ({
        service: s.service,
        environments: Object.fromEntries(
          Object.entries(s.environments).map(([env, d]) => [env, d ? serializeDeployment(d) : null]),
        ),
      })),
    };
  });

  // CPU-burn endpoint used to demonstrate the Horizontal Pod Autoscaler. Disabled by default.
  if (config.ENABLE_LOAD_ENDPOINT) {
    app.get<{ Querystring: { ms?: string } }>('/api/v1/load', async (request) => {
      const ms = Math.min(Number(request.query.ms ?? 50) || 50, 500);
      const end = Date.now() + ms;
      let x = 0;
      while (Date.now() < end) x += Math.sqrt(Math.random());
      return { burnedMs: ms, checksum: Math.round(x) };
    });
  }

  return app;
}
