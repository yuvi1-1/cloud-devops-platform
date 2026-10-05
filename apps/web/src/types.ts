export type Environment = 'dev' | 'staging' | 'prod';
export type DeploymentStatus = 'in_progress' | 'succeeded' | 'failed' | 'rolled_back';
export type PerformanceLevel = 'elite' | 'high' | 'medium' | 'low' | 'n/a';

export interface Deployment {
  id: string;
  service: string;
  environment: Environment;
  version: string;
  commitSha: string;
  status: DeploymentStatus;
  triggeredBy: string;
  commitTimestamp: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface MetricResult {
  value: number | null;
  unit: string;
  level: PerformanceLevel;
}

export interface DailyBucket {
  date: string;
  succeeded: number;
  failed: number;
}

export interface DoraReport {
  environment: Environment;
  service: string | null;
  windowDays: number;
  from: string;
  to: string;
  totals: { deployments: number; succeeded: number; failed: number; inProgress: number };
  deploymentFrequency: MetricResult;
  leadTimeForChanges: MetricResult;
  changeFailureRate: MetricResult;
  timeToRestore: MetricResult;
  daily: DailyBucket[];
}

export interface ServiceRow {
  service: string;
  environments: Partial<Record<Environment, Deployment | null>>;
}

export interface ApiInfo {
  name: string;
  version: string;
  commit: string;
  environment: string;
  pod: string;
  node: string | null;
  storage: 'postgres' | 'memory';
  uptimeSeconds: number;
  nodeVersion: string;
}
