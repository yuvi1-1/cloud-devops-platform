import { useEffect, useMemo, useRef, useState } from 'react';
import type { DailyBucket } from '../types';

const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 26, left: 32 };
const GAP = 2; // surface gap between stacked segments

function niceMax(n: number): number {
  if (n <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / step) * step;
}

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Daily deployments as stacked columns (succeeded / failed). Hand-rolled SVG:
 * no chart library, crisp at any width via viewBox, hover tooltip per column,
 * legend + screen-reader table so identity is never colour-only.
 */
export function DeploymentChart({ data }: { data: DailyBucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);

  // Render at the real pixel width (no SVG stretching → undistorted text and true bar widths).
  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setMeasured(Math.round(entry?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const width = measured || Math.max(320, data.length * 22);
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const { max, ticks } = useMemo(() => {
    const m = niceMax(Math.max(0, ...data.map((d) => d.succeeded + d.failed)));
    return { max: m, ticks: [0, m / 2, m] };
  }, [data]);

  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(24, slot - 6));
  const y = (v: number) => (v / max) * innerH;
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(innerW / 70)));
  const hovered = hover !== null ? data[hover] : undefined;

  return (
    <figure className="chart" aria-labelledby="chart-title">
      <figcaption className="chart__legend">
        <span className="legend-item">
          <span className="swatch swatch--ok" aria-hidden="true" /> Succeeded
        </span>
        <span className="legend-item">
          <span className="swatch swatch--fail" aria-hidden="true" /> Failed / rolled back
        </span>
      </figcaption>

      <div className="chart__plot" ref={plotRef} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label="Daily deployments chart">
          {ticks.map((t) => (
            <g key={t}>
              <line
                className={t === 0 ? 'axis' : 'grid'}
                x1={PAD.left}
                x2={width - PAD.right}
                y1={PAD.top + innerH - y(t)}
                y2={PAD.top + innerH - y(t)}
              />
              <text className="tick" x={PAD.left - 6} y={PAD.top + innerH - y(t) + 4} textAnchor="end">
                {t}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const okH = y(d.succeeded);
            const failH = y(d.failed);
            const base = PAD.top + innerH;
            const topIsFail = d.failed > 0;
            return (
              <g key={d.date} data-testid="bar" opacity={hover === null || hover === i ? 1 : 0.45}>
                {d.succeeded > 0 && (
                  <path className="bar bar--ok" d={column(x, base, barW, okH, !topIsFail)} />
                )}
                {d.failed > 0 && (
                  <path
                    className="bar bar--fail"
                    d={column(x, base - okH - (d.succeeded > 0 ? GAP : 0), barW, failH, true)}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text className="tick" x={x + barW / 2} y={HEIGHT - 8} textAnchor="middle">
                    {fmtDay(d.date)}
                  </text>
                )}
                {/* Hit target: the full column slot, larger than the mark. */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  tabIndex={-1}
                />
              </g>
            );
          })}
        </svg>

        {hovered && hover !== null && (
          <div
            className="tooltip"
            role="status"
            style={{ left: Math.min(Math.max(PAD.left + (hover + 0.5) * slot, 70), width - 70) }}
          >
            <strong>{fmtDay(hovered.date)}</strong>
            <span>
              <span className="swatch swatch--ok" aria-hidden="true" /> {hovered.succeeded} succeeded
            </span>
            <span>
              <span className="swatch swatch--fail" aria-hidden="true" /> {hovered.failed} failed
            </span>
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>Deployments per day</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Succeeded</th>
            <th>Failed</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.succeeded}</td>
              <td>{d.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Column path with a 4px rounded data-end (top) and a square baseline. */
function column(x: number, baseY: number, w: number, h: number, roundTop: boolean): string {
  if (h <= 0) return '';
  const r = roundTop ? Math.min(4, h, w / 2) : 0;
  const top = baseY - h;
  return [
    `M${x},${baseY}`,
    `V${top + r}`,
    r ? `Q${x},${top} ${x + r},${top}` : '',
    `H${x + w - r}`,
    r ? `Q${x + w},${top} ${x + w},${top + r}` : '',
    `V${baseY}`,
    'Z',
  ].join(' ');
}
