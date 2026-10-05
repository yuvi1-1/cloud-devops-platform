import type { DeploymentStatus } from '../types';

const META: Record<DeploymentStatus, { label: string; icon: string; tone: string }> = {
  succeeded: { label: 'Succeeded', icon: '✓', tone: 'good' },
  failed: { label: 'Failed', icon: '✕', tone: 'critical' },
  rolled_back: { label: 'Rolled back', icon: '↺', tone: 'serious' },
  in_progress: { label: 'In progress', icon: '…', tone: 'info' },
};

export function StatusPill({ status }: { status: DeploymentStatus }) {
  const m = META[status];
  return (
    <span className={`pill pill--${m.tone}`}>
      <span aria-hidden="true">{m.icon}</span> {m.label}
    </span>
  );
}
