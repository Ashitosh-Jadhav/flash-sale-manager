const AuthService = require('../services/authService');
const User = require('../models/User');

// ============================================
// Authentication Middleware
// ============================================
// WHY middleware: Authentication is a cross-cutting concern.
// Instead of checking tokens in EVERY controller function,
// we check ONCE in middleware and attach `req.user`.
// Controllers only run if the token is valid.
//
// Flow:
//   Request → authenticate() → req.user is set → next() → controller
//   Request → authenticate() → invalid token → 401 Unauthorized (controller never runs)

/**
 * Verify JWT token and attach user to request
 * Rejects with 401 if token is missing, invalid, or expired.
 */
const authenticate = async (req, res, next) => {
  try {
    // 1. Extract token from Authorization header
    // Format: "Bearer eyJhbGciOiJIUzI1NiIs..."
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid Bearer token.',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Token is missing.',
      });
    }

    // 2. Verify the JWT signature and expiration
    let decoded;
    try {
      decoded = AuthService.verifyToken(token);
    } catch (jwtError) {
      // Handle specific JWT errors with appropriate messages
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token has expired. Please login again.',
        });
      }
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token. Please login again.',
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Authentication failed.',
      });
    }

    // 3. Fetch the user from the database
    // WHY: The JWT might be valid but the user might have been deleted.
    // Also, we get fresh role/name data instead of relying on stale JWT claims.
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User no longer exists.',
      });
    }

    // 4. Attach user to request object
    // Every subsequent middleware and controller can access req.user
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

// ============================================
// Authorization Middleware (Role-Based Access Control)
// ============================================
// WHY: Authentication answers "WHO are you?"
// Authorization answers "WHAT are you allowed to do?"
//
// Usage in routes:
//   router.post('/products', authenticate, authorize('admin'), createProduct);
//
// This creates a middleware chain:
//   1. authenticate() — verifies token, sets req.user
//   2. authorize('admin') — checks if req.user.role === 'admin'
//   3. createProduct — only runs if both checks pass

/**
 * Restrict access to users with specific roles
 * @param  {...string} roles - Allowed roles (e.g., 'admin', 'customer')
 * @returns {Function} Express middleware
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    // req.user is guaranteed to exist because authenticate() runs first
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user?.role || 'none'}.`,
      });
    }
    next();
  };
};

module.exports = { authenticate, authorize };
