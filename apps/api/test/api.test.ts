import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { MemoryRepository } from '../src/db/memory.js';
import { seedDemoData } from '../src/seed.js';
import { buildApp, type AppState } from '../src/server.js';

const TOKEN = 'test-ingest-token-123456';
const auth = { authorization: `Bearer ${TOKEN}` };

describe('HTTP API', () => {
  let app: FastifyInstance;
  let repo: MemoryRepository;
  let state: AppState;

  beforeEach(async () => {
    repo = new MemoryRepository();
    state = { shuttingDown: false };
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      INGEST_TOKEN: TOKEN,
      ENABLE_LOAD_ENDPOINT: 'true',
      APP_VERSION: '9.9.9',
      GIT_COMMIT: 'deadbeef',
    });
    app = await buildApp({ config, repo, state });
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves liveness and readiness probes', async () => {
    expect((await app.inject('/healthz')).json()).toEqual({ status: 'ok' });
    const ready = await app.inject('/readyz');
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ready', storage: 'memory' });
  });

  it('fails readiness while shutting down', async () => {
    state.shuttingDown = true;
    expect((await app.inject('/readyz')).statusCode).toBe(503);
  });

  it('fails readiness when the database is unreachable', async () => {
    repo.ping = async () => {
      throw new Error('connection refused');
    };
    expect((await app.inject('/readyz')).statusCode).toBe(503);
  });

  it('reports build info', async () => {
    const res = await app.inject('/api/v1/info');
    expect(res.json()).toMatchObject({ version: '9.9.9', commit: 'deadbeef', storage: 'memory' });
  });

  it('rejects writes without a valid token', async () => {
    const body = { service: 'api', environment: 'prod', version: '1.0.0', commitSha: 'abcdef1' };
    expect((await app.inject({ method: 'POST', url: '/api/v1/deployments', payload: body })).statusCode).toBe(401);
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/v1/deployments',
      payload: body,
      headers: { authorization: 'Bearer nope' },
    });
    expect(wrong.statusCode).toBe(401);
  });

  it('validates input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/deployments',
      headers: auth,
      payload: { service: 'Bad Name!', environment: 'moon', version: '', commitSha: 'xyz' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining(['service', 'environment', 'version', 'commitSha']),
    );
  });

  it('records a deployment lifecycle and exposes it', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/deployments',
      headers: auth,
      payload: {
        service: 'api',
        environment: 'prod',
        version: '1.2.3',
        commitSha: 'ABCDEF1234',
        triggeredBy: 'github-actions',
        commitTimestamp: new Date(Date.now() - 3_600_000).toISOString(),
      },
    });
    expect(created.statusCode).toBe(201);
    const { id, status, finishedAt, commitSha } = created.json();
    expect(status).toBe('in_progress');
    expect(finishedAt).toBeNull();
    expect(commitSha).toBe('abcdef1234');

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/deployments/${id}`,
      headers: auth,
      payload: { status: 'succeeded' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().finishedAt).not.toBeNull();

    const list = await app.inject('/api/v1/deployments?environment=prod');
    expect(list.json().count).toBe(1);

    const one = await app.inject(`/api/v1/deployments/${id}`);
    expect(one.json().status).toBe('succeeded');

    const services = await app.inject('/api/v1/services');
    expect(services.json().items[0]).toMatchObject({ service: 'api', environments: { prod: { version: '1.2.3' } } });

    const dora = await app.inject('/api/v1/dora?environment=prod&days=7');
    expect(dora.json().totals.succeeded).toBe(1);
    expect(dora.json().leadTimeForChanges.level).toBe('elite');
  });

  it('returns 404 for unknown deployments', async () => {
    expect((await app.inject('/api/v1/deployments/does-not-exist')).statusCode).toBe(404);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/deployments/does-not-exist',
      headers: auth,
      payload: { status: 'failed' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('exposes Prometheus metrics including request counters', async () => {
    await app.inject('/api/v1/info');
    const res = await app.inject('/metrics');
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('http_requests_total{method="GET",route="/api/v1/info",status_code="200"');
    expect(res.body).toContain('process_cpu_user_seconds_total');
  });

  it('computes DORA metrics over seeded demo data', async () => {
    const created = await seedDemoData(repo);
    expect(created).toBeGreaterThan(100);
    expect(await seedDemoData(repo)).toBe(0); // idempotent
    const res = await app.inject('/api/v1/dora?environment=prod&days=30');
    const body = res.json();
    expect(body.totals.deployments).toBeGreaterThan(0);
    expect(body.daily).toHaveLength(31);
    expect(['elite', 'high', 'medium', 'low']).toContain(body.deploymentFrequency.level);
  });

  it('serves the CPU load endpoint when enabled', async () => {
    const res = await app.inject('/api/v1/load?ms=5');
    expect(res.json().burnedMs).toBe(5);
  });

  it('disables ingest when no token is configured', async () => {
    const noToken = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      repo: new MemoryRepository(),
    });
    const res = await noToken.inject({
      method: 'POST',
      url: '/api/v1/deployments',
      payload: {},
      headers: auth,
    });
    expect(res.statusCode).toBe(503);
    expect((await noToken.inject('/api/v1/load')).statusCode).toBe(404);
    await noToken.close();
  });
});

describe('config', () => {
  it('rejects invalid configuration', () => {
    expect(() => loadConfig({ PORT: 'not-a-port' })).toThrow(/Invalid configuration/);
    expect(() => loadConfig({ INGEST_TOKEN: 'short' })).toThrow(/INGEST_TOKEN/);
  });
  it('detects postgres from DATABASE_URL or libpq variables', async () => {
    const { usesPostgres } = await import('../src/config.js');
    expect(usesPostgres(loadConfig({}))).toBe(false);
    expect(usesPostgres(loadConfig({ PGHOST: 'db' }))).toBe(true);
    expect(usesPostgres(loadConfig({ DATABASE_URL: 'postgres://u:p@db:5432/x' }))).toBe(true);
  });
  it('applies defaults', () => {
    const c = loadConfig({});
    expect(c.PORT).toBe(3000);
    expect(c.MIGRATE_ON_START).toBe(false);
  });
});
