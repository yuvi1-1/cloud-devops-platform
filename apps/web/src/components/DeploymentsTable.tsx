import { shortSha, timeAgo } from '../format';
import type { Deployment } from '../types';
import { StatusPill } from './StatusPill';

function duration(d: Deployment): string {
  if (!d.finishedAt) return '—';
  const s = Math.round((new Date(d.finishedAt).getTime() - new Date(d.startedAt).getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function DeploymentsTable({ items }: { items: Deployment[] }) {
  if (items.length === 0) return <p className="empty">No deployments in this environment yet.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col">Version</th>
            <th scope="col">Commit</th>
            <th scope="col">Status</th>
            <th scope="col">Duration</th>
            <th scope="col">Triggered by</th>
            <th scope="col">Started</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.id}>
              <td className="mono">{d.service}</td>
              <td className="mono">{d.version}</td>
              <td className="mono muted">{shortSha(d.commitSha)}</td>
              <td>
                <StatusPill status={d.status} />
              </td>
              <td className="num">{duration(d)}</td>
              <td>{d.triggeredBy}</td>
              <td className="muted" title={new Date(d.startedAt).toLocaleString()}>
                {timeAgo(d.startedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
