import { shortSha, timeAgo } from '../format';
import type { Environment, ServiceRow } from '../types';
import { StatusPill } from './StatusPill';

const ENVS: Environment[] = ['dev', 'staging', 'prod'];

export function ServiceMatrix({ rows }: { rows: ServiceRow[] }) {
  if (rows.length === 0) return <p className="empty">No services have reported a deployment yet.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Service</th>
            {ENVS.map((e) => (
              <th key={e} scope="col">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.service}>
              <th scope="row" className="mono">
                {r.service}
              </th>
              {ENVS.map((e) => {
                const d = r.environments[e];
                return (
                  <td key={e}>
                    {d ? (
                      <div className="cell-stack">
                        <span className="mono">
                          v{d.version} <span className="muted">@{shortSha(d.commitSha)}</span>
                        </span>
                        <span className="cell-meta">
                          <StatusPill status={d.status} /> <span className="muted">{timeAgo(d.startedAt)}</span>
                        </span>
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
