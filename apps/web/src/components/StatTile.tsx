import type { PerformanceLevel } from '../types';
import { LevelBadge } from './LevelBadge';

interface Props {
  label: string;
  value: string;
  level: PerformanceLevel;
  hint: string;
}

export function StatTile({ label, value, level, hint }: Props) {
  return (
    <article className="card tile" aria-label={label}>
      <header className="tile__head">
        <h3 className="tile__label">{label}</h3>
        <LevelBadge level={level} />
      </header>
      <p className="tile__value">{value}</p>
      <p className="tile__hint">{hint}</p>
    </article>
  );
}
