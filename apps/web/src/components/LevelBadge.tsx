import { LEVEL_LABEL } from '../format';
import type { PerformanceLevel } from '../types';

const ICON: Record<PerformanceLevel, string> = {
  elite: '▲',
  high: '●',
  medium: '◆',
  low: '▼',
  'n/a': '–',
};

/** Status is never conveyed by colour alone: icon + text label + colour. */
export function LevelBadge({ level }: { level: PerformanceLevel }) {
  return (
    <span className={`badge badge--${level === 'n/a' ? 'na' : level}`}>
      <span aria-hidden="true">{ICON[level]}</span> {LEVEL_LABEL[level]}
    </span>
  );
}
