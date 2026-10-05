import type { PerformanceLevel } from './types';

export function formatDuration(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

export function formatFrequency(perDay: number | null): string {
  if (perDay === null) return '—';
  if (perDay >= 1) return `${perDay.toFixed(1)} / day`;
  if (perDay * 7 >= 1) return `${(perDay * 7).toFixed(1)} / week`;
  return `${(perDay * 30).toFixed(1)} / month`;
}

export function formatPercent(pct: number | null): string {
  return pct === null ? '—' : `${pct.toFixed(1)}%`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

export const LEVEL_LABEL: Record<PerformanceLevel, string> = {
  elite: 'Elite',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  'n/a': 'No data',
};

export const shortSha = (sha: string) => sha.slice(0, 7);

/** Injected at image build time (Docker build args → Vite env). */
export const WEB_BUILD = {
  version: import.meta.env.VITE_APP_VERSION ?? 'dev',
  commit: import.meta.env.VITE_GIT_COMMIT ?? 'local',
};
