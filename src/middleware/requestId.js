// ============================================
// Request ID Middleware (Correlation)
// ============================================
// WHY request IDs:
//
// Without request IDs, debugging a failed order looks like this:
//   API log:  "Order created"          (which order? which instance?)
//   Worker log: "Order #42 confirmed"  (was it the same request?)
//   Redis:    (no visibility)
//
// With request IDs:
//   API log:  { requestId: "abc-123", orderId: 42, path: "/api/orders" }
//   Worker log: { requestId: "abc-123", orderId: 42, status: "confirmed" }
//   Now you can search "abc-123" and see the entire lifecycle.
//
// HOW IT WORKS:
// 1. Nginx can set X-Request-Id if present (from an upstream proxy).
// 2. If no X-Request-Id exists, we generate one.
// 3. The ID is attached to the request object and included in the response header.
// 4. Every log entry includes this ID.
//
// CORRELATION ID vs REQUEST ID:
// - Request ID: Unique per HTTP request.
// - Correlation ID: Shared across multiple related requests (e.g., order creation
//   triggers payment, notification, etc.).
// For our project, Request ID is sufficient. We don't have multi-service saga flows.

const crypto = require('crypto');

function requestIdMiddleware(req, res, next) {
  // Use existing X-Request-Id (from Nginx or an upstream proxy)
  // or generate a new one.
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();

  // Attach to request for use in downstream code
  req.requestId = requestId;

  // Include in response so the client can reference it in support tickets
  res.setHeader('X-Request-Id', requestId);

  next();
}

module.exports = requestIdMiddleware;
