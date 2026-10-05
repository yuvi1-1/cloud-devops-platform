import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /**
   * PostgreSQL connection. Either a DATABASE_URL, or the standard libpq
   * variables (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) which avoid
   * URL-encoding problems with generated passwords. With neither set, the API
   * falls back to an in-memory store (local demos & unit tests).
   */
  DATABASE_URL: z.string().url().optional(),
  PGHOST: z.string().min(1).optional(),
  DATABASE_SSL: booleanFromEnv,
  /** PEM bundle to trust for TLS to the database (e.g. the Amazon RDS CA bundle). */
  DATABASE_SSL_CA_FILE: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  MIGRATE_ON_START: booleanFromEnv,

  /** Bearer token required for write endpoints (CI/CD pipelines post deployment events). */
  INGEST_TOKEN: z.string().min(16).optional(),

  SEED_DEMO_DATA: booleanFromEnv,
  ENABLE_LOAD_ENDPOINT: booleanFromEnv,
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(600),
  /**
   * Fault injection for demos: share (0-1) of /api/v1 requests answered with
   * HTTP 500. Used to show Argo Rollouts aborting a bad canary automatically.
   */
  CHAOS_ERROR_RATE: z.coerce.number().min(0).max(1).default(0),

  /** Time to keep serving after SIGTERM while readiness reports 503 (lets endpoints drain). */
  SHUTDOWN_DELAY_MS: z.coerce.number().int().min(0).default(5000),

  APP_VERSION: z.string().default('dev'),
  GIT_COMMIT: z.string().default('unknown'),
  DEPLOY_ENVIRONMENT: z.string().default('local'),
  POD_NAME: z.string().optional(),
  NODE_NAME: z.string().optional(),
});

export type Config = z.infer<typeof EnvSchema>;

export const usesPostgres = (c: Config) => Boolean(c.DATABASE_URL || c.PGHOST);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return parsed.data;
}
