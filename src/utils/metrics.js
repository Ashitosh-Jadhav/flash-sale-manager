// ============================================
// Prometheus Metrics — Flash Sale Manager
// ============================================
// WHY Prometheus:
// Prometheus is a pull-based monitoring system. Every N seconds,
// Prometheus scrapes GET /metrics on our API and stores the data
// as time-series. Grafana then queries Prometheus to visualize it.
//
// PULL vs PUSH:
// - PULL (Prometheus): The monitoring system asks "Give me your metrics."
//   Advantage: Simpler app code. If Prometheus is down, the app doesn't care.
// - PUSH (StatsD/Datadog): The app sends metrics to a collector.
//   Advantage: Works for short-lived jobs. But adds dependency.
//
// We use PULL because our API servers are long-running and always reachable.
//
// GOLDEN SIGNALS (what we measure):
// 1. LATENCY   — How long do requests take? (http_request_duration_seconds)
// 2. TRAFFIC   — How many requests/sec? (http_requests_total)
// 3. ERRORS    — What % of requests fail? (http_requests_total where status >= 500)
// 4. SATURATION — Is the system at capacity? (active connections, queue depth)

const client = require('prom-client');

// Create a dedicated registry for our custom metrics.
// WHY: prom-client has a global default registry that auto-collects
// Node.js runtime metrics (CPU, memory, event loop, GC).
// We use it directly so we get BOTH our custom metrics AND runtime metrics.
const register = client.register;

// Collect default Node.js metrics (CPU, memory, event loop, GC)
// These are exposed automatically at GET /metrics.
// prefix: adds 'nodejs_' to all default metric names.
client.collectDefaultMetrics({
  prefix: 'nodejs_',
  // labels: applied to ALL default metrics for multi-instance identification
  labels: { instance: process.env.INSTANCE_ID || `api-${process.pid}` },
});

// ============================================
// HTTP Request Metrics
// ============================================

// Counter: Total number of HTTP requests received.
// Labels let us break this down by method, route, and status code.
// Example PromQL: rate(http_requests_total{status="500"}[5m])
//   = "5xx errors per second over the last 5 minutes"
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

// Histogram: Distribution of request durations.
// Buckets define the boundaries for counting.
// Example: How many requests took 0-10ms? 10-50ms? 50-100ms?
// This lets us calculate p50, p95, p99 latencies.
// PromQL: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
//   = "95th percentile latency over the last 5 minutes"
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  // Buckets chosen for API latency patterns:
  // Flash sale: most requests 5-50ms, some 100-500ms under contention
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// Gauge: Number of requests currently being processed.
// Unlike a Counter (only goes up), a Gauge can go up AND down.
// High values indicate the API is saturated.
const httpActiveRequests = new client.Gauge({
  name: 'http_active_requests',
  help: 'Number of HTTP requests currently being processed',
});

// ============================================
// Order Metrics
// ============================================
const ordersCreatedTotal = new client.Counter({
  name: 'orders_created_total',
  help: 'Total orders submitted to the queue',
});

const ordersConfirmedTotal = new client.Counter({
  name: 'orders_confirmed_total',
  help: 'Total orders confirmed by the worker',
});

const ordersFailedTotal = new client.Counter({
  name: 'orders_failed_total',
  help: 'Total orders that failed processing',
});

// ============================================
// Redis Queue Metrics
// ============================================
const queueDepth = new client.Gauge({
  name: 'redis_queue_depth',
  help: 'Number of jobs waiting in the Redis order queue',
});

// ============================================
// Worker Metrics
// ============================================
const workerJobDuration = new client.Histogram({
  name: 'worker_job_duration_seconds',
  help: 'Time to process a single worker job',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

const workerJobsProcessedTotal = new client.Counter({
  name: 'worker_jobs_processed_total',
  help: 'Total jobs processed by the worker',
  labelNames: ['status'], // 'confirmed' or 'failed'
});

// ============================================
// Database Metrics
// ============================================
const dbActiveConnections = new client.Gauge({
  name: 'db_active_connections',
  help: 'Number of active MySQL connections in the pool',
});

const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'MySQL query duration in seconds',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

module.exports = {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  httpActiveRequests,
  ordersCreatedTotal,
  ordersConfirmedTotal,
  ordersFailedTotal,
  queueDepth,
  workerJobDuration,
  workerJobsProcessedTotal,
  dbActiveConnections,
  dbQueryDuration,
};
