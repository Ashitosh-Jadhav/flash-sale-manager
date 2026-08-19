const http = require('http');

// ============================================
// Phase 13 Observability Test Script
// ============================================
// This script simulates a "flash sale spike" to generate traffic,
// errors, and queue backlog so we can observe the metrics in Grafana.

const API_URL = 'http://localhost/api';

async function fetchHelper(path, options = {}) {
  return new Promise((resolve) => {
    const req = http.request(`http://localhost${path}`, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', () => resolve({ status: 0, data: 'connection failed' }));
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runLoadSpike() {
  console.log('🚀 Starting Observability Load Spike...');
  console.log('Sending requests to generate metrics. Open Grafana at http://localhost:3001');

  // 1. Generate normal traffic (Products)
  console.log('\n📦 Generating product traffic...');
  for (let i = 0; i < 50; i++) {
    fetchHelper('/api/products');
    await new Promise(r => setTimeout(r, 20));
  }

  // 2. Generate 429 Rate Limit Errors
  console.log('\n🛑 Triggering Rate Limit (429) Errors...');
  for (let i = 0; i < 110; i++) {
    // Spam the general limiter (100/min)
    fetchHelper('/api/products/1');
  }

  // 3. Generate 404 Errors
  console.log('\n🔍 Triggering 404 Errors...');
  for (let i = 0; i < 20; i++) {
    fetchHelper('/api/non-existent-route');
  }

  // 4. Generate Order Traffic (to fill queue)
  console.log('\n🛒 Generating Order Traffic...');
  for (let i = 0; i < 40; i++) {
    fetchHelper('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 1, quantity: 1 })
    });
    await new Promise(r => setTimeout(r, 10)); // Slow enough to not trip rate limit instantly
  }

  console.log('\n✅ Load Spike Complete.');
  console.log('Check Grafana to observe:');
  console.log('1. Requests/sec spike');
  console.log('2. 4xx Error spike');
  console.log('3. Queue Depth variation');
  console.log('4. Per-instance traffic distribution');
}

runLoadSpike();
