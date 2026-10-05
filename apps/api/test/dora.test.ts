import { describe, expect, it } from 'vitest';
import {
  classifyChangeFailureRate,
  classifyDeploymentFrequency,
  classifyLeadTime,
  classifyTimeToRestore,
  computeDora,
  median,
  restoreDurationsMs,
} from '../src/domain/dora.js';
import type { Deployment, DeploymentStatus } from '../src/domain/types.js';

const HOUR = 3_600_000;
const NOW = new Date('2026-10-01T12:00:00Z');
let seq = 0;

function dep(hoursAgo: number, status: DeploymentStatus, extra: Partial<Deployment> = {}): Deployment {
  const startedAt = new Date(NOW.getTime() - hoursAgo * HOUR);
  return {
    id: String(++seq),
    service: 'api',
    environment: 'prod',
    version: '1.0.0',
    commitSha: 'abcdef1',
    status,
    triggeredBy: 'test',
    commitTimestamp: new Date(startedAt.getTime() - 2 * HOUR),
    startedAt,
    finishedAt: status === 'in_progress' ? null : new Date(startedAt.getTime() + 0.1 * HOUR),
    ...extra,
  };
}

describe('median', () => {
  it('handles empty, odd and even inputs', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('performance classification', () => {
  it('classifies deployment frequency', () => {
    expect(classifyDeploymentFrequency(3)).toBe('elite');
    expect(classifyDeploymentFrequency(0.5)).toBe('high');
    expect(classifyDeploymentFrequency(0.1)).toBe('medium');
    expect(classifyDeploymentFrequency(0.01)).toBe('low');
  });
  it('classifies lead time', () => {
    expect(classifyLeadTime(2)).toBe('elite');
    expect(classifyLeadTime(48)).toBe('high');
    expect(classifyLeadTime(24 * 10)).toBe('medium');
    expect(classifyLeadTime(24 * 60)).toBe('low');
  });
  it('classifies change failure rate', () => {
    expect(classifyChangeFailureRate(0)).toBe('elite');
    expect(classifyChangeFailureRate(8)).toBe('high');
    expect(classifyChangeFailureRate(15)).toBe('medium');
    expect(classifyChangeFailureRate(40)).toBe('low');
  });
  it('classifies time to restore', () => {
    expect(classifyTimeToRestore(0.5)).toBe('elite');
    expect(classifyTimeToRestore(5)).toBe('high');
    expect(classifyTimeToRestore(48)).toBe('medium');
    expect(classifyTimeToRestore(24 * 8)).toBe('low');
  });
});

describe('restoreDurationsMs', () => {
  it('measures failure → next success per service', () => {
    const rows = [
      dep(10, 'succeeded'),
      dep(8, 'failed'),
      dep(7, 'rolled_back'), // still degraded — clock keeps running from first failure
      dep(5, 'succeeded'),
      dep(4, 'failed', { service: 'web' }),
    ];
    const durations = restoreDurationsMs(rows);
    expect(durations).toHaveLength(1); // web never recovered
    expect(durations[0]).toBeCloseTo(3 * HOUR, -3);
  });
});

describe('computeDora', () => {
  it('returns n/a levels when there is no data', () => {
    const report = computeDora([], { environment: 'prod', windowDays: 7, now: NOW });
    expect(report.totals.deployments).toBe(0);
    expect(report.deploymentFrequency.level).toBe('n/a');
    expect(report.leadTimeForChanges.value).toBeNull();
    expect(report.changeFailureRate.value).toBeNull();
    expect(report.timeToRestore.value).toBeNull();
    expect(report.daily.length).toBeGreaterThanOrEqual(7);
  });

  it('computes the four key metrics over the window', () => {
    const rows = [
      dep(1, 'succeeded'),
      dep(20, 'succeeded'),
      dep(30, 'failed'),
      dep(29, 'succeeded'),
      dep(50, 'succeeded'),
      dep(60, 'in_progress'),
      dep(24 * 40, 'succeeded'), // outside 7-day window
      dep(2, 'succeeded', { environment: 'dev' }), // other environment
    ];
    const report = computeDora(rows, { environment: 'prod', windowDays: 7, now: NOW });

    expect(report.totals).toEqual({ deployments: 6, succeeded: 4, failed: 1, inProgress: 1 });
    expect(report.deploymentFrequency.value).toBeCloseTo(4 / 7, 2);
    expect(report.deploymentFrequency.level).toBe('high');
    expect(report.leadTimeForChanges.value).toBeCloseTo(2.1, 1);
    expect(report.leadTimeForChanges.level).toBe('elite');
    expect(report.changeFailureRate.value).toBe(20);
    expect(report.changeFailureRate.level).toBe('low');
    expect(report.timeToRestore.value).toBeCloseTo(1, 1);
    expect(report.timeToRestore.level).toBe('high');

    const totalDaily = report.daily.reduce((n, b) => n + b.succeeded + b.failed, 0);
    expect(totalDaily).toBe(5);
  });

  it('filters by service', () => {
    const rows = [dep(1, 'succeeded'), dep(2, 'failed', { service: 'web' })];
    const report = computeDora(rows, { environment: 'prod', service: 'web', windowDays: 7, now: NOW });
    expect(report.totals.deployments).toBe(1);
    expect(report.changeFailureRate.value).toBe(100);
  });
});
