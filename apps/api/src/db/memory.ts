import { randomUUID } from 'node:crypto';
import type {
  CreateDeploymentInput,
  Deployment,
  Environment,
  ListDeploymentsQuery,
  UpdateDeploymentInput,
} from '../domain/types.js';
import { isTerminal, type DeploymentRepository } from './repository.js';

export class MemoryRepository implements DeploymentRepository {
  readonly kind = 'memory' as const;
  private readonly rows = new Map<string, Deployment>();

  async create(input: CreateDeploymentInput): Promise<Deployment> {
    const startedAt = input.startedAt ?? new Date();
    const row: Deployment = {
      id: randomUUID(),
      service: input.service,
      environment: input.environment,
      version: input.version,
      commitSha: input.commitSha.toLowerCase(),
      status: input.status,
      triggeredBy: input.triggeredBy,
      commitTimestamp: input.commitTimestamp ?? null,
      startedAt,
      finishedAt: isTerminal(input.status) ? (input.finishedAt ?? new Date()) : null,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async update(id: string, input: UpdateDeploymentInput): Promise<Deployment | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    row.status = input.status;
    row.finishedAt = isTerminal(input.status) ? (input.finishedAt ?? new Date()) : null;
    return { ...row };
  }

  async get(id: string): Promise<Deployment | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async list(q: ListDeploymentsQuery): Promise<Deployment[]> {
    return [...this.rows.values()]
      .filter(
        (d) =>
          (!q.service || d.service === q.service) &&
          (!q.environment || d.environment === q.environment) &&
          (!q.status || d.status === q.status),
      )
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, q.limit)
      .map((d) => ({ ...d }));
  }

  async listSince(environment: Environment, since: Date, service?: string): Promise<Deployment[]> {
    return [...this.rows.values()]
      .filter(
        (d) => d.environment === environment && d.startedAt >= since && (!service || d.service === service),
      )
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
      .map((d) => ({ ...d }));
  }

  async latestPerServiceEnvironment(): Promise<Deployment[]> {
    const latest = new Map<string, Deployment>();
    for (const d of this.rows.values()) {
      const key = `${d.service}/${d.environment}`;
      const current = latest.get(key);
      if (!current || d.startedAt > current.startedAt) latest.set(key, d);
    }
    return [...latest.values()].map((d) => ({ ...d }));
  }

  async count(): Promise<number> {
    return this.rows.size;
  }

  async ping(): Promise<void> {}

  async close(): Promise<void> {}
}
