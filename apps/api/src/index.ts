import { setTimeout as sleep } from 'node:timers/promises';
import { loadConfig } from './config.js';
import { MemoryRepository } from './db/memory.js';
import { migrate } from './db/migrations.js';
import { PostgresRepository, createPool } from './db/postgres.js';
import type { DeploymentRepository } from './db/repository.js';
import { seedDemoData } from './seed.js';
import { buildApp, type AppState } from './server.js';

async function main() {
  const config = loadConfig();

  let repo: DeploymentRepository;
  if (config.DATABASE_URL) {
    const pool = createPool({
      connectionString: config.DATABASE_URL,
      ssl: config.DATABASE_SSL,
      max: config.DATABASE_POOL_MAX,
    });
    if (config.MIGRATE_ON_START) await migrate(pool, (m) => console.log(JSON.stringify({ level: 30, msg: m })));
    repo = new PostgresRepository(pool);
  } else {
    repo = new MemoryRepository();
  }

  const state: AppState = { shuttingDown: false };
  const app = await buildApp({ config, repo, state });

  if (config.SEED_DEMO_DATA) {
    const n = await seedDemoData(repo);
    app.log.info({ created: n }, 'demo data seeded');
  }

  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info({ storage: repo.kind, environment: config.DEPLOY_ENVIRONMENT }, 'api started');

  // Graceful shutdown: fail readiness first so Kubernetes removes the pod from
  // Service endpoints, keep serving in-flight traffic for a short drain window,
  // then close the server and the DB pool.
  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    state.shuttingDown = true;
    app.log.info({ signal, drainMs: config.SHUTDOWN_DELAY_MS }, 'shutdown requested');
    await sleep(config.SHUTDOWN_DELAY_MS);
    await app.close();
    await repo.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
