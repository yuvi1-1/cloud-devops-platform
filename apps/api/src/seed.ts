import type { DeploymentRepository } from './db/repository.js';
import type { DeploymentStatus, Environment } from './domain/types.js';

/** Small deterministic PRNG (mulberry32) so demo data is reproducible. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOUR = 3_600_000;
const SERVICES = ['web', 'api', 'payments', 'notifications'];
const PROFILE: Record<Environment, { perDay: number; failRate: number }> = {
  dev: { perDay: 4, failRate: 0.18 },
  staging: { perDay: 2, failRate: 0.1 },
  prod: { perDay: 1.2, failRate: 0.07 },
};

/**
 * Populate an empty store with ~60 days of realistic deployment history so the
 * dashboard is meaningful on first launch. No-op if data already exists.
 */
export async function seedDemoData(repo: DeploymentRepository, now = new Date(), days = 60): Promise<number> {
  if ((await repo.count()) > 0) return 0;
  const rand = prng(42);
  const hex = () => Math.floor(rand() * 0xffffffff).toString(16).padStart(8, '0');
  let created = 0;

  for (const environment of Object.keys(PROFILE) as Environment[]) {
    const { perDay, failRate } = PROFILE[environment];
    for (const service of SERVICES) {
      let minor = 0;
      let patch = 0;
      for (let day = days; day >= 0; day--) {
        const count = Math.floor(perDay / 2 + rand() * perDay);
        for (let i = 0; i < count; i++) {
          const startedAt = new Date(now.getTime() - day * 24 * HOUR + rand() * 10 * HOUR - 12 * HOUR);
          if (startedAt > now) continue;
          const failed = rand() < failRate;
          const status: DeploymentStatus = failed ? (rand() < 0.5 ? 'failed' : 'rolled_back') : 'succeeded';
          if (rand() < 0.15) {
            minor += 1;
            patch = 0;
          } else patch += 1;
          await repo.create({
            service,
            environment,
            version: `1.${minor}.${patch}`,
            commitSha: hex() + hex().slice(0, 4),
            status,
            triggeredBy: rand() < 0.8 ? 'github-actions' : 'argocd',
            commitTimestamp: new Date(startedAt.getTime() - (0.5 + rand() * 20) * HOUR),
            startedAt,
            finishedAt: new Date(startedAt.getTime() + (2 + rand() * 8) * 60_000),
          });
          created += 1;
        }
      }
    }
  }
  return created;
}
