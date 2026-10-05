import type {
  CreateDeploymentInput,
  Deployment,
  Environment,
  ListDeploymentsQuery,
  UpdateDeploymentInput,
} from '../domain/types.js';

export interface ServiceSummary {
  service: string;
  environments: Partial<Record<Environment, Deployment>>;
}

/**
 * Storage abstraction. The production implementation is PostgreSQL; an
 * in-memory implementation backs unit tests and zero-dependency demos.
 */
export interface DeploymentRepository {
  readonly kind: 'postgres' | 'memory';
  create(input: CreateDeploymentInput): Promise<Deployment>;
  update(id: string, input: UpdateDeploymentInput): Promise<Deployment | null>;
  get(id: string): Promise<Deployment | null>;
  list(query: ListDeploymentsQuery): Promise<Deployment[]>;
  listSince(environment: Environment, since: Date, service?: string): Promise<Deployment[]>;
  latestPerServiceEnvironment(): Promise<Deployment[]>;
  count(): Promise<number>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export const isTerminal = (status: string) => status !== 'in_progress';

export function summarizeServices(latest: Deployment[]): ServiceSummary[] {
  const map = new Map<string, ServiceSummary>();
  for (const d of latest) {
    const entry = map.get(d.service) ?? { service: d.service, environments: {} };
    entry.environments[d.environment] = d;
    map.set(d.service, entry);
  }
  return [...map.values()].sort((a, b) => a.service.localeCompare(b.service));
}
