// k6 load test: realistic read traffic on the dashboard API plus CPU-heavy
// requests that drive the Horizontal Pod Autoscaler.
//
//   k6 run -e BASE_URL=http://cloud-devops.localtest.me tests/load/k6-smoke-and-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://cloud-devops.localtest.me';

export const options = {
  scenarios: {
    dashboard_reads: {
      executor: 'ramping-vus',
      exec: 'dashboard',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m', target: 20 },
        { duration: '30s', target: 0 },
      ],
    },
    cpu_burn: {
      executor: 'constant-arrival-rate',
      exec: 'burn',
      rate: 20,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 20,
      maxVUs: 60,
    },
  },
  // Service-level objectives — the test fails if they are breached.
  thresholds: {
    'http_req_failed{scenario:dashboard_reads}': ['rate<0.01'],
    'http_req_duration{scenario:dashboard_reads}': ['p(95)<500'],
  },
};

export function dashboard() {
  const res = http.batch([
    ['GET', `${BASE}/api/v1/dora?environment=prod&days=30`],
    ['GET', `${BASE}/api/v1/services`],
    ['GET', `${BASE}/api/v1/deployments?environment=prod&limit=12`],
  ]);
  for (const r of res) check(r, { 'status is 200': (x) => x.status === 200 });
  sleep(1);
}

export function burn() {
  const r = http.get(`${BASE}/api/v1/load?ms=100`);
  check(r, { 'load ok': (x) => x.status === 200 });
}
