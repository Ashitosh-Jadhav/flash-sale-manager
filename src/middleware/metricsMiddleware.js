// ============================================
// Metrics Middleware — HTTP Request Instrumentation
// ============================================
// This middleware wraps EVERY HTTP request to record:
// 1. Total request count (Counter)
// 2. Request duration (Histogram)
// 3. Active requests (Gauge)
//
// It also logs each request as structured JSON.

const {
  httpRequestsTotal,
  httpRequestDuration,
  httpActiveRequests,
} = require('../utils/metrics');
const logger = require('../utils/logger');

function metricsMiddleware(req, res, next) {
  // Skip metrics endpoint itself to avoid infinite recursion
  if (req.path === '/metrics') return next();

  const startTime = process.hrtime.bigint();
  httpActiveRequests.inc();

  // Hook into response finish event
  res.on('finish', () => {
    httpActiveRequests.dec();

    const durationNs = Number(process.hrtime.bigint() - startTime);
    const durationSec = durationNs / 1e9;
    const durationMs = durationNs / 1e6;

    // Normalize route to prevent label explosion.
    // Without this, /api/orders/1, /api/orders/2, /api/orders/3
    // would each create a separate time-series → unbounded cardinality.
    const route = normalizeRoute(req.route?.path || req.path, req.baseUrl);
    const status = res.statusCode;

    // Record Prometheus metrics
    httpRequestsTotal.inc({ method: req.method, route, status });
    httpRequestDuration.observe({ method: req.method, route, status }, durationSec);

    // Structured request log
    logger.info('request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      route,
      status,
      durationMs: Math.round(durationMs * 100) / 100,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });

  next();
}

/**
 * Normalize Express routes to prevent Prometheus label explosion.
 * /api/orders/42 → /api/orders/:id
 * /api/products/5 → /api/products/:id
 */
function normalizeRoute(routePath, baseUrl) {
  const full = (baseUrl || '') + (routePath || '');
  // Replace numeric path segments with :id
  return full.replace(/\/\d+/g, '/:id') || 'unknown';
}

module.exports = metricsMiddleware;
