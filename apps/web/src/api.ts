import type { ApiInfo, Deployment, DoraReport, Environment, ServiceRow } from './types';

const BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  info: (signal?: AbortSignal) => get<ApiInfo>('/info', signal),
  dora: (env: Environment, days: number, service: string | null, signal?: AbortSignal) => {
    const q = new URLSearchParams({ environment: env, days: String(days) });
    if (service) q.set('service', service);
    return get<DoraReport>(`/dora?${q}`, signal);
  },
  deployments: (env: Environment, service: string | null, limit = 15, signal?: AbortSignal) => {
    const q = new URLSearchParams({ environment: env, limit: String(limit) });
    if (service) q.set('service', service);
    return get<{ items: Deployment[] }>(`/deployments?${q}`, signal).then((r) => r.items);
  },
  services: (signal?: AbortSignal) => get<{ items: ServiceRow[] }>('/services', signal).then((r) => r.items),
};
