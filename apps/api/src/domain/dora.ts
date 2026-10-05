/**
 * DORA ("DevOps Research & Assessment") four key metrics.
 *
 *  1. Deployment frequency   – how often a successful release reaches the environment
 *  2. Lead time for changes  – commit → running in the environment
 *  3. Change failure rate    – share of deployments that fail or are rolled back
 *  4. Time to restore        – failure → next successful deployment of the same service
 *
 * Performance bands follow the State of DevOps report conventions
 * (elite / high / medium / low). All functions here are pure so they are
 * trivially unit-testable and independent of the storage backend.
 */
import type { Deployment } from './types.js';

export type PerformanceLevel = 'elite' | 'high' | 'medium' | 'low' | 'n/a';

export interface MetricResult {
  value: number | null;
  unit: string;
  level: PerformanceLevel;
}

export interface DailyBucket {
  date: string; // YYYY-MM-DD (UTC)
  succeeded: number;
  failed: number;
}

export interface DoraReport {
  environment: string;
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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

const isFailure = (d: Deployment) => d.status === 'failed' || d.status === 'rolled_back';

export function classifyDeploymentFrequency(perDay: number): PerformanceLevel {
  if (perDay >= 1) return 'elite'; // on demand / multiple per day
  if (perDay >= 1 / 7) return 'high'; // between once per day and once per week
  if (perDay >= 1 / 30) return 'medium'; // between once per week and once per month
  return 'low';
}

export function classifyLeadTime(hours: number): PerformanceLevel {
  if (hours < 24) return 'elite';
  if (hours < 24 * 7) return 'high';
  if (hours < 24 * 30) return 'medium';
  return 'low';
}

export function classifyChangeFailureRate(pct: number): PerformanceLevel {
  if (pct <= 5) return 'elite';
  if (pct <= 10) return 'high';
  if (pct <= 15) return 'medium';
  return 'low';
}

export function classifyTimeToRestore(hours: number): PerformanceLevel {
  if (hours < 1) return 'elite';
  if (hours < 24) return 'high';
  if (hours < 24 * 7) return 'medium';
  return 'low';
}

/**
 * For every failed deployment, find the next successful deployment of the same
 * service and measure how long the service stayed degraded.
 */
export function restoreDurationsMs(deployments: Deployment[]): number[] {
  const byService = new Map<string, Deployment[]>();
  for (const d of deployments) {
    const list = byService.get(d.service) ?? [];
    list.push(d);
    byService.set(d.service, list);
  }

  const durations: number[] = [];
  for (const list of byService.values()) {
    list.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    let failedAt: number | null = null;
    for (const d of list) {
      if (isFailure(d) && failedAt === null) {
        failedAt = (d.finishedAt ?? d.startedAt).getTime();
      } else if (d.status === 'succeeded' && failedAt !== null) {
        const restoredAt = (d.finishedAt ?? d.startedAt).getTime();
        durations.push(Math.max(0, restoredAt - failedAt));
        failedAt = null;
      }
    }
  }
  return durations;
}

export function dailyBuckets(deployments: Deployment[], from: Date, to: Date): DailyBucket[] {
  const buckets = new Map<string, DailyBucket>();
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  for (let t = start; t <= to.getTime(); t += DAY) {
    const key = new Date(t).toISOString().slice(0, 10);
    buckets.set(key, { date: key, succeeded: 0, failed: 0 });
  }
  for (const d of deployments) {
    const bucket = buckets.get(d.startedAt.toISOString().slice(0, 10));
    if (!bucket) continue;
    if (d.status === 'succeeded') bucket.succeeded += 1;
    else if (isFailure(d)) bucket.failed += 1;
  }
  return [...buckets.values()];
}

export function computeDora(
  deployments: Deployment[],
  opts: { environment: string; service?: string | null; windowDays: number; now?: Date },
): DoraReport {
  const to = opts.now ?? new Date();
  const from = new Date(to.getTime() - opts.windowDays * DAY);
  const inWindow = deployments.filter(
    (d) =>
      d.environment === opts.environment &&
      (!opts.service || d.service === opts.service) &&
      d.startedAt >= from &&
      d.startedAt <= to,
  );

  const succeeded = inWindow.filter((d) => d.status === 'succeeded');
  const failed = inWindow.filter(isFailure);
  const finished = succeeded.length + failed.length;

  const perDay = succeeded.length / opts.windowDays;

  const leadTimesMs = succeeded
    .filter((d) => d.commitTimestamp)
    .map((d) => (d.finishedAt ?? d.startedAt).getTime() - d.commitTimestamp!.getTime())
    .filter((ms) => ms >= 0);
  const leadMedianHours = median(leadTimesMs);

  const cfrPct = finished === 0 ? null : (failed.length / finished) * 100;
  const restoreMedian = median(restoreDurationsMs(inWindow));

  return {
    environment: opts.environment,
    service: opts.service ?? null,
    windowDays: opts.windowDays,
    from: from.toISOString(),
    to: to.toISOString(),
    totals: {
      deployments: inWindow.length,
      succeeded: succeeded.length,
      failed: failed.length,
      inProgress: inWindow.filter((d) => d.status === 'in_progress').length,
    },
    deploymentFrequency: {
      value: round(perDay),
      unit: 'deploys/day',
      level: succeeded.length === 0 ? 'n/a' : classifyDeploymentFrequency(perDay),
    },
    leadTimeForChanges:
      leadMedianHours === null
        ? { value: null, unit: 'hours', level: 'n/a' }
        : {
            value: round(leadMedianHours / HOUR),
            unit: 'hours',
            level: classifyLeadTime(leadMedianHours / HOUR),
          },
    changeFailureRate:
      cfrPct === null
        ? { value: null, unit: '%', level: 'n/a' }
        : { value: round(cfrPct, 1), unit: '%', level: classifyChangeFailureRate(cfrPct) },
    timeToRestore:
      restoreMedian === null
        ? { value: null, unit: 'hours', level: 'n/a' }
        : {
            value: round(restoreMedian / HOUR),
            unit: 'hours',
            level: classifyTimeToRestore(restoreMedian / HOUR),
          },
    daily: dailyBuckets(inWindow, from, to),
  };
}
