import type { Pool } from 'pg';

/**
 * Forward-only, versioned schema migrations. Kept in code (rather than .sql
 * files) so the compiled container image is self-contained.
 */
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'create_deployments',
    sql: `
      CREATE TABLE deployments (
        id               uuid PRIMARY KEY,
        service          text        NOT NULL,
        environment      text        NOT NULL CHECK (environment IN ('dev', 'staging', 'prod')),
        version          text        NOT NULL,
        commit_sha       text        NOT NULL,
        status           text        NOT NULL CHECK (status IN ('in_progress', 'succeeded', 'failed', 'rolled_back')),
        triggered_by     text        NOT NULL DEFAULT 'unknown',
        commit_timestamp timestamptz,
        started_at       timestamptz NOT NULL DEFAULT now(),
        finished_at      timestamptz
      );
      CREATE INDEX deployments_env_started_idx ON deployments (environment, started_at DESC);
      CREATE INDEX deployments_service_env_started_idx ON deployments (service, environment, started_at DESC);
    `,
  },
];

// Arbitrary constant so that concurrent replicas / Jobs never migrate at the same time.
const MIGRATION_LOCK_ID = 727_274_001;

export async function migrate(pool: Pool, log: (msg: string) => void = () => {}): Promise<number> {
  const client = await pool.connect();
  let applied = 0;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    integer PRIMARY KEY,
        name       text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ version: number }>('SELECT version FROM schema_migrations');
    const done = new Set(rows.map((r) => r.version));

    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      log(`applying migration ${m.version}_${m.name}`);
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
        await client.query('COMMIT');
        applied += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
  return applied;
}
