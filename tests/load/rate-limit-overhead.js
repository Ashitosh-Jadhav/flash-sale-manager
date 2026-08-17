// ============================================
// k6 Load Test — Rate Limiter Performance Impact
// ============================================
// Tests GET /api/products (public endpoint with general rate limiter)
// to measure the latency overhead of the Redis-backed rate limiter.
// Compare results against Phase 6 baseline.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const latency = new Trend('endpoint_latency', true);

export const options = {
  vus: 25,
  duration: '10s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

const BASE_URL = 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE_URL}/api/products`);
  latency.add(res.timings.duration);

  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.05);
}
