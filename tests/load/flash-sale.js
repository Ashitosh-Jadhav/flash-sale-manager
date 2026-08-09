// ============================================
// k6 Load Test — Flash Sale Order Endpoint
// ============================================
// This script tests POST /api/orders which is the core
// flash-sale purchase operation. It simulates virtual
// users attempting to buy a product concurrently.
//
// Usage: k6 run flash-sale.js --vus 10 --duration 10s
// ============================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics for deeper analysis
const orderSuccesses = new Counter('order_successes');
const orderFailures = new Counter('order_failures');
const orderLatency = new Trend('order_latency', true);

// Default options (can be overridden via CLI flags)
export const options = {
  vus: 1,
  duration: '10s',
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests should be under 2s
    http_req_failed: ['rate<0.5'],     // Less than 50% failure rate (stock runs out)
  },
};

const BASE_URL = 'http://localhost:3000';

// setup() runs ONCE before the test starts.
// We use it to seed a product with known stock for controlled testing.
export function setup() {
  // Create a product with high stock so we can sustain load
  const productPayload = JSON.stringify({
    name: `Load Test Product ${Date.now()}`,
    description: 'Product for load testing',
    price: 99.99,
    stock: 100000,
    flash_sale: true,
  });

  const createRes = http.post(`${BASE_URL}/api/products`, productPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const productData = JSON.parse(createRes.body);

  if (createRes.status !== 201 || !productData.data || !productData.data.id) {
    console.error('Failed to create test product:', createRes.body);
    return { productId: 1 }; // fallback
  }

  console.log(`Created test product ID: ${productData.data.id} with 100,000 stock`);
  return { productId: productData.data.id };
}

// default() runs for EVERY virtual user on EVERY iteration
export default function (data) {
  const payload = JSON.stringify({
    productId: data.productId,
    customerName: `User_${__VU}_${__ITER}`,
    customerEmail: `user_${__VU}_${__ITER}@loadtest.com`,
    quantity: 1,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      // Each request gets a unique idempotency key
      'Idempotency-Key': `k6-${__VU}-${__ITER}-${Date.now()}`,
    },
  };

  const res = http.post(`${BASE_URL}/api/orders`, payload, params);

  // Track custom metrics
  orderLatency.add(res.timings.duration);

  // Verify response
  const isSuccess = check(res, {
    'status is 201 or 400': (r) => r.status === 201 || r.status === 400,
    'response has body': (r) => r.body.length > 0,
  });

  if (res.status === 201) {
    orderSuccesses.add(1);
  } else {
    orderFailures.add(1);
  }

  // Small pause between requests to simulate realistic user behavior
  // Remove this for pure stress testing
  sleep(0.1);
}

// teardown() runs ONCE after the test ends
export function teardown(data) {
  console.log(`Test complete. Product ID tested: ${data.productId}`);
}
