import { useState } from 'react';
import { api } from './api';
import { DeploymentChart } from './components/DeploymentChart';
import { DeploymentsTable } from './components/DeploymentsTable';
import { PlatformPanel } from './components/PlatformPanel';
import { ServiceMatrix } from './components/ServiceMatrix';
import { StatTile } from './components/StatTile';
import { formatDuration, formatFrequency, formatPercent } from './format';
import type { Environment } from './types';
import { usePolling } from './usePolling';

const ENVIRONMENTS: Environment[] = ['prod', 'staging', 'dev'];
const WINDOWS = [7, 30, 90];

export default function App() {
  const [env, setEnv] = useState<Environment>('prod');
  const [days, setDays] = useState(30);
  const [service, setService] = useState<string | null>(null);

  const info = usePolling((s) => api.info(s), []);
  const services = usePolling((s) => api.services(s), []);
  const dora = usePolling((s) => api.dora(env, days, service, s), [env, days, service]);
  const recent = usePolling((s) => api.deployments(env, service, 12, s), [env, service]);

  const serviceNames = (services.data ?? []).map((r) => r.service);
  const report = dora.data;
  const apiDown = Boolean(info.error) && !info.loading;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <div>
            <h1>Cloud DevOps Platform</h1>
            <p className="muted">Delivery performance across every environment</p>
          </div>
        </div>
        <div className="topbar__status" aria-live="polite">
          <span className={`dot ${apiDown ? 'dot--down' : 'dot--ok'}`} aria-hidden="true" />
          {apiDown ? 'API unreachable' : `Live · ${info.data?.environment ?? '…'}`}
        </div>
      </header>

      <main>
        <section className="filters" aria-label="Filters">
          <div className="segmented" role="group" aria-label="Environment">
            {ENVIRONMENTS.map((e) => (
              <button key={e} type="button" aria-pressed={env === e} onClick={() => setEnv(e)}>
                {e}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Time window">
            {WINDOWS.map((w) => (
              <button key={w} type="button" aria-pressed={days === w} onClick={() => setDays(w)}>
                {w}d
              </button>
            ))}
          </div>
          <label className="select">
            <span>Service</span>
            <select value={service ?? ''} onChange={(e) => setService(e.target.value || null)}>
              <option value="">All services</option>
              {serviceNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </section>

        {dora.error && !report && (
          <div className="alert" role="alert">
            Could not load metrics from the API ({dora.error.message}). Retrying automatically…
          </div>
        )}

        <section className="tiles" aria-label="DORA metrics">
          <StatTile
            label="Deployment frequency"
            value={formatFrequency(report?.deploymentFrequency.value ?? null)}
            level={report?.deploymentFrequency.level ?? 'n/a'}
            hint="Successful releases to this environment"
          />
          <StatTile
            label="Lead time for changes"
            value={formatDuration(report?.leadTimeForChanges.value ?? null)}
            level={report?.leadTimeForChanges.level ?? 'n/a'}
            hint="Median commit → running in environment"
          />
          <StatTile
            label="Change failure rate"
            value={formatPercent(report?.changeFailureRate.value ?? null)}
            level={report?.changeFailureRate.level ?? 'n/a'}
            hint="Deployments that failed or were rolled back"
          />
          <StatTile
            label="Time to restore"
            value={formatDuration(report?.timeToRestore.value ?? null)}
            level={report?.timeToRestore.level ?? 'n/a'}
            hint="Median failure → next successful deploy"
          />
        </section>

        <section className="card">
          <header className="card__head">
            <h2 id="chart-title">Deployments per day</h2>
            {report && (
              <p className="muted">
                {report.totals.deployments} deployments · {report.totals.succeeded} succeeded ·{' '}
                {report.totals.failed} failed · last {report.windowDays} days
              </p>
            )}
          </header>
          {report ? <DeploymentChart data={report.daily} /> : <div className="skeleton" />}
        </section>

        <div className="grid-2">
          <section className="card">
            <header className="card__head">
              <h2>Services by environment</h2>
              <p className="muted">Latest release per environment</p>
            </header>
            <ServiceMatrix rows={services.data ?? []} />
          </section>
          <section className="card">
            <header className="card__head">
              <h2>Platform</h2>
              <p className="muted">Refresh to watch load-balancing across pods</p>
            </header>
            <PlatformPanel info={info.data} healthy={!apiDown} />
          </section>
        </div>

        <section className="card">
          <header className="card__head">
            <h2>Recent deployments</h2>
            <p className="muted">{env}</p>
          </header>
          <DeploymentsTable items={recent.data ?? []} />
        </section>
      </main>

      <footer className="footer muted">
        Built with React · Fastify · PostgreSQL · Kubernetes (EKS) · Argo CD · Prometheus
      </footer>
    </div>
  );
}
