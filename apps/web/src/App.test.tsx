import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { DoraReport } from './types';

const dora = (env: string): DoraReport => ({
  environment: env as DoraReport['environment'],
  service: null,
  windowDays: 30,
  from: '2026-09-01T00:00:00Z',
  to: '2026-10-01T00:00:00Z',
  totals: { deployments: 12, succeeded: 10, failed: 2, inProgress: 0 },
  deploymentFrequency: { value: env === 'prod' ? 1.5 : 4, unit: 'deploys/day', level: 'elite' },
  leadTimeForChanges: { value: 3, unit: 'hours', level: 'elite' },
  changeFailureRate: { value: 16.7, unit: '%', level: 'low' },
  timeToRestore: { value: 2, unit: 'hours', level: 'high' },
  daily: [
    { date: '2026-09-29', succeeded: 3, failed: 1 },
    { date: '2026-09-30', succeeded: 2, failed: 0 },
  ],
});

const deployment = {
  id: '1',
  service: 'api',
  environment: 'prod',
  version: '2.0.0',
  commitSha: 'abcdef1234',
  status: 'succeeded',
  triggeredBy: 'github-actions',
  commitTimestamp: null,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
};

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    switch (url.pathname) {
      case '/api/v1/info':
        return json({
          name: 'cloud-devops-api',
          version: '2.0.0',
          commit: 'abcdef1234',
          environment: 'prod',
          pod: 'cloud-devops-api-7d9f-abcde',
          node: 'ip-10-0-1-23',
          storage: 'postgres',
          uptimeSeconds: 125,
          nodeVersion: 'v22',
        });
      case '/api/v1/dora':
        return json(dora(url.searchParams.get('environment') ?? 'prod'));
      case '/api/v1/deployments':
        return json({ items: [deployment] });
      case '/api/v1/services':
        return json({ items: [{ service: 'api', environments: { prod: deployment } }] });
      default:
        return new Response('not found', { status: 404 });
    }
  });
}

describe('<App />', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the four DORA metrics with performance levels', async () => {
    render(<App />);
    const tiles = await screen.findByRole('region', { name: 'DORA metrics' });
    await waitFor(() => expect(within(tiles).getByText('1.5 / day')).toBeInTheDocument());
    expect(within(tiles).getByText('3.0 h')).toBeInTheDocument();
    expect(within(tiles).getByText('16.7%')).toBeInTheDocument();
    expect(within(tiles).getAllByText('Elite')).toHaveLength(2);
    expect(within(tiles).getByText('Low')).toBeInTheDocument();
  });

  it('shows platform info including the serving pod', async () => {
    render(<App />);
    expect(await screen.findByText('cloud-devops-api-7d9f-abcde')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
  });

  it('renders the chart and an accessible data table', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByTestId('bar')).toHaveLength(2));
    expect(screen.getByRole('table', { name: 'Deployments per day' })).toBeInTheDocument();
  });

  it('re-queries metrics when the environment filter changes', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('1.5 / day');
    await user.click(screen.getByRole('button', { name: 'dev' }));
    expect(await screen.findByText('4.0 / day')).toBeInTheDocument();
    const calls = vi.mocked(fetch).mock.calls.map(([u]) => String(u));
    expect(calls.some((u) => u.includes('environment=dev'))).toBe(true);
  });

  it('shows an alert when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 502, statusText: 'Bad Gateway' })));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load metrics');
  });
});
