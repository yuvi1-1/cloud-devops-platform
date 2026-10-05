import { WEB_BUILD, formatUptime, shortSha } from '../format';
import type { ApiInfo } from '../types';

export function PlatformPanel({ info, healthy }: { info: ApiInfo | null; healthy: boolean }) {
  return (
    <dl className="kv">
      <div>
        <dt>API status</dt>
        <dd>
          <span className={`dot ${healthy ? 'dot--ok' : 'dot--down'}`} aria-hidden="true" />
          {healthy ? 'Healthy' : 'Unreachable'}
        </dd>
      </div>
      <div>
        <dt>Served by pod</dt>
        <dd className="mono">{info?.pod ?? '—'}</dd>
      </div>
      <div>
        <dt>Node</dt>
        <dd className="mono">{info?.node ?? '—'}</dd>
      </div>
      <div>
        <dt>API version</dt>
        <dd className="mono">
          {info ? `${info.version} @${shortSha(info.commit)}` : '—'}
        </dd>
      </div>
      <div>
        <dt>Web version</dt>
        <dd className="mono">
          {WEB_BUILD.version} @{shortSha(WEB_BUILD.commit)}
        </dd>
      </div>
      <div>
        <dt>Storage</dt>
        <dd>{info ? (info.storage === 'postgres' ? 'PostgreSQL' : 'In-memory (demo)') : '—'}</dd>
      </div>
      <div>
        <dt>Environment</dt>
        <dd>{info?.environment ?? '—'}</dd>
      </div>
      <div>
        <dt>Uptime</dt>
        <dd>{info ? formatUptime(info.uptimeSeconds) : '—'}</dd>
      </div>
    </dl>
  );
}
