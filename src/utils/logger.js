// ============================================
// Structured Logger — Flash Sale Manager
// ============================================
// WHY structured logging:
//
// Plain text logs:
//   "Order 42 processed successfully in 150ms"
//
// Structured JSON logs:
//   {"timestamp":"2026-08-19T10:00:00Z","level":"info","service":"api","instance":"api-1",
//    "requestId":"abc-123","method":"POST","path":"/api/orders","orderId":42,
//    "duration":150,"status":200}
//
// WHY JSON is better:
// 1. PARSEABLE: Tools like Grafana Loki, Elasticsearch, or even `jq` can
//    filter, search, and aggregate JSON logs. Try searching plain text for
//    "all orders that took >500ms on api-2" — it's nearly impossible.
//
// 2. CORRELATABLE: A requestId field lets you trace a request across
//    API → Redis → Worker → MySQL using a single search query.
//
// 3. ALERTABLE: Monitoring systems can trigger alerts on specific JSON
//    fields (e.g., alert when level="error" AND service="worker").
//
// WHAT WE DO NOT LOG:
// - Passwords (req.body.password)
// - JWT tokens (Authorization header)
// - Database credentials
// - Any PII beyond what's needed for debugging
//
// WHY: If logs are compromised, leaked secrets = compromised system.
// GDPR and similar regulations also restrict logging personal data.

const INSTANCE_ID = process.env.INSTANCE_ID || `api-${process.pid}`;
const SERVICE_NAME = process.env.SERVICE_NAME || 'api';

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

/**
 * Create a structured log entry.
 * @param {string} level - Log level (error, warn, info, debug)
 * @param {string} message - Human-readable message
 * @param {Object} meta - Additional structured fields
 */
function log(level, message, meta = {}) {
  if (LOG_LEVELS[level] > CURRENT_LEVEL) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    instance: INSTANCE_ID,
    message,
    ...meta,
  };

  // Use stderr for errors, stdout for everything else.
  // WHY: Docker and log aggregators often treat stdout and stderr differently.
  const output = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(output + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
}

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};
