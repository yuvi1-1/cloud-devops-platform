/**
 * Standalone migration entrypoint. Runs as a Helm pre-install/pre-upgrade hook
 * Job so schema changes are applied exactly once, before new pods roll out.
 */
import { loadConfig, usesPostgres } from './config.js';
import { migrate } from './db/migrations.js';
import { createPool } from './db/postgres.js';

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...extra }));

async function run() {
  const config = loadConfig();
  if (!usesPostgres(config)) {
    log('no database configured (DATABASE_URL / PGHOST) — nothing to migrate');
    return;
  }
  const pool = createPool({
    connectionString: config.DATABASE_URL,
    ssl: config.DATABASE_SSL,
    sslCaFile: config.DATABASE_SSL_CA_FILE,
    max: 1,
  });

  // The database may still be starting (e.g. fresh install) — retry with backoff.
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (err) {
      if (attempt >= 30) throw err;
      log('database not reachable yet, retrying', { attempt });
      await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 5000)));
    }
  }

  const applied = await migrate(pool, log);
  log('migrations complete', { applied });
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
