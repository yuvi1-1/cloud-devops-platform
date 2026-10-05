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

  /** When unset the API falls back to an in-memory store (local demos & unit tests). */
  DATABASE_URL: z.string().url().optional(),
  DATABASE_SSL: booleanFromEnv,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  MIGRATE_ON_START: booleanFromEnv,

  /** Bearer token required for write endpoints (CI/CD pipelines post deployment events). */
  INGEST_TOKEN: z.string().min(16).optional(),

  SEED_DEMO_DATA: booleanFromEnv,
  ENABLE_LOAD_ENDPOINT: booleanFromEnv,
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(600),

  /** Time to keep serving after SIGTERM while readiness reports 503 (lets endpoints drain). */
  SHUTDOWN_DELAY_MS: z.coerce.number().int().min(0).default(5000),

  APP_VERSION: z.string().default('dev'),
  GIT_COMMIT: z.string().default('unknown'),
  DEPLOY_ENVIRONMENT: z.string().default('local'),
  POD_NAME: z.string().optional(),
  NODE_NAME: z.string().optional(),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return parsed.data;
}
