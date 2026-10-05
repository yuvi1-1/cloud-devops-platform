import { z } from 'zod';

export const ENVIRONMENTS = ['dev', 'staging', 'prod'] as const;
export const STATUSES = ['in_progress', 'succeeded', 'failed', 'rolled_back'] as const;
export const TERMINAL_STATUSES: readonly DeploymentStatus[] = ['succeeded', 'failed', 'rolled_back'];

export type Environment = (typeof ENVIRONMENTS)[number];
export type DeploymentStatus = (typeof STATUSES)[number];

export interface Deployment {
  id: string;
  service: string;
  environment: Environment;
  version: string;
  commitSha: string;
  status: DeploymentStatus;
  triggeredBy: string;
  /** When the change was committed — used for "lead time for changes". */
  commitTimestamp: Date | null;
  startedAt: Date;
  finishedAt: Date | null;
}

const serviceName = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'must be a DNS-1123 label (lowercase, digits, dashes)');

export const CreateDeploymentSchema = z.object({
  service: serviceName,
  environment: z.enum(ENVIRONMENTS),
  version: z.string().min(1).max(128),
  commitSha: z.string().regex(/^[0-9a-f]{7,40}$/i, 'must be a git SHA'),
  status: z.enum(STATUSES).default('in_progress'),
  triggeredBy: z.string().min(1).max(128).default('unknown'),
  commitTimestamp: z.coerce.date().optional(),
  startedAt: z.coerce.date().optional(),
  finishedAt: z.coerce.date().optional(),
});
export type CreateDeploymentInput = z.infer<typeof CreateDeploymentSchema>;

export const UpdateDeploymentSchema = z.object({
  status: z.enum(STATUSES),
  finishedAt: z.coerce.date().optional(),
});
export type UpdateDeploymentInput = z.infer<typeof UpdateDeploymentSchema>;

export const ListDeploymentsQuerySchema = z.object({
  service: serviceName.optional(),
  environment: z.enum(ENVIRONMENTS).optional(),
  status: z.enum(STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type ListDeploymentsQuery = z.infer<typeof ListDeploymentsQuerySchema>;

export const DoraQuerySchema = z.object({
  environment: z.enum(ENVIRONMENTS).default('prod'),
  days: z.coerce.number().int().min(1).max(365).default(30),
  service: serviceName.optional(),
});
export type DoraQuery = z.infer<typeof DoraQuerySchema>;

export function serializeDeployment(d: Deployment) {
  return {
    ...d,
    commitTimestamp: d.commitTimestamp?.toISOString() ?? null,
    startedAt: d.startedAt.toISOString(),
    finishedAt: d.finishedAt?.toISOString() ?? null,
  };
}
