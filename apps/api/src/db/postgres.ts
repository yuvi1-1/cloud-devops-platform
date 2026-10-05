import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import type {
  CreateDeploymentInput,
  Deployment,
  DeploymentStatus,
  Environment,
  ListDeploymentsQuery,
  UpdateDeploymentInput,
} from '../domain/types.js';
import { isTerminal, type DeploymentRepository } from './repository.js';

interface Row {
  id: string;
  service: string;
  environment: Environment;
  version: string;
  commit_sha: string;
  status: DeploymentStatus;
  triggered_by: string;
  commit_timestamp: Date | null;
  started_at: Date;
  finished_at: Date | null;
}

const COLUMNS =
  'id, service, environment, version, commit_sha, status, triggered_by, commit_timestamp, started_at, finished_at';

const toDeployment = (r: Row): Deployment => ({
  id: r.id,
  service: r.service,
  environment: r.environment,
  version: r.version,
  commitSha: r.commit_sha,
  status: r.status,
  triggeredBy: r.triggered_by,
  commitTimestamp: r.commit_timestamp,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
});

export interface PoolOptions {
  /** Omit to let `pg` read PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD. */
  connectionString?: string;
  ssl: boolean;
  sslCaFile?: string;
  max: number;
}

export function createPool(opts: PoolOptions): pg.Pool {
  return new pg.Pool({
    connectionString: opts.connectionString,
    max: opts.max,
    ssl: opts.ssl
      ? { rejectUnauthorized: true, ca: opts.sslCaFile ? readFileSync(opts.sslCaFile, 'utf8') : undefined }
      : undefined,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    application_name: 'cloud-devops-api',
  });
}

export class PostgresRepository implements DeploymentRepository {
  readonly kind = 'postgres' as const;

  constructor(private readonly pool: pg.Pool) {}

  async create(input: CreateDeploymentInput): Promise<Deployment> {
    const finishedAt = isTerminal(input.status) ? (input.finishedAt ?? new Date()) : null;
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO deployments (id, service, environment, version, commit_sha, status, triggered_by,
                                commit_timestamp, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()), $10)
       RETURNING ${COLUMNS}`,
      [
        randomUUID(),
        input.service,
        input.environment,
        input.version,
        input.commitSha.toLowerCase(),
        input.status,
        input.triggeredBy,
        input.commitTimestamp ?? null,
        input.startedAt ?? null,
        finishedAt,
      ],
    );
    return toDeployment(rows[0]!);
  }

  async update(id: string, input: UpdateDeploymentInput): Promise<Deployment | null> {
    const finishedAt = isTerminal(input.status) ? (input.finishedAt ?? new Date()) : null;
    const { rows } = await this.pool.query<Row>(
      `UPDATE deployments SET status = $2, finished_at = $3 WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, input.status, finishedAt],
    );
    return rows[0] ? toDeployment(rows[0]) : null;
  }

  async get(id: string): Promise<Deployment | null> {
    const { rows } = await this.pool.query<Row>(`SELECT ${COLUMNS} FROM deployments WHERE id = $1`, [id]);
    return rows[0] ? toDeployment(rows[0]) : null;
  }

  async list(q: ListDeploymentsQuery): Promise<Deployment[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace('?', `$${params.length}`));
    };
    if (q.service) add('service = ?', q.service);
    if (q.environment) add('environment = ?', q.environment);
    if (q.status) add('status = ?', q.status);
    params.push(q.limit);
    const sql = `SELECT ${COLUMNS} FROM deployments
                 ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY started_at DESC LIMIT $${params.length}`;
    const { rows } = await this.pool.query<Row>(sql, params);
    return rows.map(toDeployment);
  }

  async listSince(environment: Environment, since: Date, service?: string): Promise<Deployment[]> {
    const { rows } = await this.pool.query<Row>(
      `SELECT ${COLUMNS} FROM deployments
       WHERE environment = $1 AND started_at >= $2 AND ($3::text IS NULL OR service = $3)
       ORDER BY started_at ASC`,
      [environment, since, service ?? null],
    );
    return rows.map(toDeployment);
  }

  async latestPerServiceEnvironment(): Promise<Deployment[]> {
    const { rows } = await this.pool.query<Row>(
      `SELECT DISTINCT ON (service, environment) ${COLUMNS}
       FROM deployments ORDER BY service, environment, started_at DESC`,
    );
    return rows.map(toDeployment);
  }

  async count(): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>('SELECT count(*)::text AS n FROM deployments');
    return Number(rows[0]?.n ?? 0);
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
