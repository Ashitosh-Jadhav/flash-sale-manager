// ============================================
// Express Application Setup (app.js)
// ============================================
// WHY this file is separate from server.js:
//
// app.js  = Defines WHAT the server does
//           (routes, middleware, error handling)
// server.js = Defines HOW the server runs
//           (which port, when to start listening)
//
// This separation lets us:
// 1. Import `app` in tests WITHOUT starting a server
// 2. Reuse `app` in serverless environments (AWS Lambda)
// 3. Keep concerns clean and testable
// ============================================

const express = require('express');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const authRoutes = require('./routes/authRoutes');
const { generalLimiter } = require('./middleware/rateLimiter');

// Create an Express application instance.
// Think of this as creating a brand new web server object
// that doesn't yet know any routes or rules.
const app = express();

// ============================================
// Trust Proxy Configuration
// ============================================
// WHY: When Nginx sits in front of Express, the client IP that Express
// sees is Nginx's IP (the Docker internal IP), NOT the real client.
// Nginx sets X-Forwarded-For to the real client IP.
//
// 'trust proxy' = 1 means: "Trust the FIRST proxy hop."
// With this enabled, req.ip reads from X-Forwarded-For instead of
// the socket connection.
//
// SECURITY: We ONLY enable this because we control Nginx.
// If we enabled this without a trusted proxy in front, any client
// could spoof X-Forwarded-For to bypass IP-based rate limiting.
//
// We use an env var so it's only enabled in Docker (where Nginx exists).
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', parseInt(process.env.TRUST_PROXY, 10) || 1);
}

// Instance identification for load balancing verification
// Intentionally breaking the pipeline here:
const INSTANCE_ID = process.env.INSTANCE_ID || `api-${process.pid}` // Missing semicolon doesn't break, let's do a real syntax error:
THIS_IS_A_SYNTAX_ERROR_TO_BREAK_CI_PIPELINE();

// ============================================
// Instance ID Header (Load Balancing Verification)
// ============================================
// Adds X-Instance-Id to EVERY response so we can verify Nginx
// is distributing traffic across API replicas during testing.
app.use((req, res, next) => {
  res.setHeader('X-Instance-Id', INSTANCE_ID);
  next();
});

// ============================================
// Built-in Middleware
// ============================================

// express.json() is middleware that parses incoming
// request bodies with JSON payloads.
//
// When a client sends: POST /api/orders
// with body: { "productId": 1, "quantity": 2 }
//
// Without this middleware: req.body is undefined
// With this middleware: req.body = { productId: 1, quantity: 2 }
//
// In a flash sale, EVERY order request sends JSON data.
// This middleware MUST be registered before any route handlers.
app.use(express.json());

// express.urlencoded() parses form-encoded data
// (like traditional HTML form submissions).
// extended: true allows nested objects in form data.
app.use(express.urlencoded({ extended: true }));

// ============================================
// Global Rate Limiter
// ============================================
// Applied to ALL /api/* routes as a safety net (100 req/min per IP).
// Endpoint-specific limiters (login, register, order) are stricter
// and applied separately in their route files.
app.use('/api', generalLimiter);

// ============================================
// API Routes
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// ============================================
// Health Check Route
// ============================================
// WHY: Every production server needs a health check endpoint.
// Load balancers (Nginx, AWS ALB) hit this endpoint every
// few seconds to check if the server is alive.
// If it returns non-200, the load balancer stops sending traffic.
//
// In our flash sale system, if a server is overwhelmed,
// the health check will fail and traffic gets redirected
// to healthy servers. This is called "health-based routing".
app.get('/health', (req, res) => {
  // res.status(200) sets the HTTP status code to 200 (OK).
  // .json({...}) sends a JSON response body.
  res.status(200).json({
    status: 'OK',
    service: 'flash-sale-manager',
    instance: INSTANCE_ID,
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// Root Route
// ============================================
// A simple welcome route so hitting http://localhost:3000/
// shows something useful instead of "Cannot GET /"
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Flash Sale Manager API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
    },
  });
});

// ============================================
// 404 Handler — Catch-all for undefined routes
// ============================================
// WHY: If someone hits /api/banana (which doesn't exist),
// Express silently sends a default HTML "Cannot GET /api/banana".
// In a production API, we want to return a structured JSON error.
//
// This middleware MUST come AFTER all route definitions.
// Express evaluates middleware in ORDER — if no route above matched,
// execution falls through to here.
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} does not exist`,
  });
});

// ============================================
// Global Error Handler
// ============================================
// WHY: If any route throws an error (e.g., database connection fails),
// Express catches it and passes it here.
//
// The 4-parameter signature (err, req, res, next) is how Express
// identifies this as an ERROR handler vs a normal middleware.
// DO NOT remove any of the 4 parameters — Express checks the
// function's arity (parameter count) to decide its type.
//
// In a flash sale under heavy load, database timeouts, Redis failures,
// and race conditions WILL throw errors. This handler ensures:
// 1. The client gets a clean JSON error (not an HTML stack trace)
// 2. The error is logged for debugging
// 3. Internal details are hidden in production
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.message);

  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    error: statusCode === 500 ? 'Internal Server Error' : err.message,
    // Only show stack traces in development, NEVER in production
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Export the app so server.js can use it,
// and test files can import it without starting a server.
module.exports = app;
