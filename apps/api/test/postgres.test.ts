/**
 * Integration tests against a real PostgreSQL. Runs in CI (service container)
 * or locally when TEST_DATABASE_URL is set; skipped otherwise.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrations.js';
import { PostgresRepository } from '../src/db/postgres.js';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PostgresRepository', () => {
  let pool: pg.Pool;
  let repo: PostgresRepository;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await pool.query('DROP TABLE IF EXISTS deployments, schema_migrations');
    expect(await migrate(pool)).toBe(1);
    expect(await migrate(pool)).toBe(0); // idempotent
    repo = new PostgresRepository(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('creates, updates and queries deployments', async () => {
    await repo.ping();
    const a = await repo.create({
      service: 'api',
      environment: 'prod',
      version: '1.0.0',
      commitSha: 'ABCDEF1',
      status: 'in_progress',
      triggeredBy: 'ci',
      startedAt: new Date(Date.now() - 60_000),
    });
    expect(a.commitSha).toBe('abcdef1');
    expect(a.finishedAt).toBeNull();

    const b = await repo.create({
      service: 'api',
      environment: 'prod',
      version: '1.0.1',
      commitSha: 'abcdef2',
      status: 'succeeded',
      triggeredBy: 'ci',
    });
    expect(b.finishedAt).toBeInstanceOf(Date);

    const updated = await repo.update(a.id, { status: 'failed' });
    expect(updated?.status).toBe('failed');
    expect(updated?.finishedAt).toBeInstanceOf(Date);

    expect(await repo.count()).toBe(2);
    expect((await repo.list({ environment: 'prod', limit: 10 }))[0]?.id).toBe(b.id);
    expect(await repo.list({ status: 'failed', limit: 10 })).toHaveLength(1);
    expect(await repo.listSince('prod', new Date(Date.now() - 3_600_000), 'api')).toHaveLength(2);

    const latest = await repo.latestPerServiceEnvironment();
    expect(latest).toHaveLength(1);
    expect(latest[0]?.version).toBe('1.0.1');
    expect(await repo.get(a.id)).not.toBeNull();
  });
});
