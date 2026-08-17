const { createRedisClient } = require('../config/redis');

// ============================================
// Rate Limiter Middleware (Redis-Backed Sliding Window Counter)
// ============================================
//
// ALGORITHM: Sliding Window Counter
// ==================================
// We chose this algorithm after evaluating 5 options:
//
// 1. Fixed Window Counter:
//    - Divides time into fixed windows (e.g., 0:00-0:59, 1:00-1:59).
//    - Simple: INCR a key with TTL.
//    - Problem: "Boundary burst" — 100 requests at 0:59 + 100 at 1:00 = 200 in 2 seconds
//      even though the limit is 100/minute. Clients can exploit this.
//
// 2. Sliding Window Log:
//    - Stores a timestamp for EVERY request in a sorted set.
//    - Perfectly accurate — counts exact requests in the last N seconds.
//    - Problem: Memory. 10,000 users × 100 requests = 1,000,000 entries in Redis.
//      At 50 bytes per entry, that's 50MB just for rate limits.
//
// 3. Sliding Window Counter (OUR CHOICE):
//    - Hybrid of Fixed Window + weighted previous window.
//    - Uses only 2 counters per client per endpoint (current + previous window).
//    - Formula: weightedCount = prevCount * overlapFraction + currentCount
//    - Example: Limit=100/min, window=60s, we're 15s into the current window.
//      overlapFraction = (60-15)/60 = 0.75
//      weightedCount = prevWindowCount * 0.75 + currentWindowCount
//    - Memory: O(1) per client per endpoint. Extremely efficient.
//    - Accuracy: ~99.5% accurate (slightly approximate but no boundary burst exploit).
//    - Redis-friendly: Only needs INCR + EXPIRE. No sorted sets.
//
// 4. Token Bucket:
//    - Each client has a "bucket" of N tokens. Each request consumes a token.
//      Tokens are refilled at a fixed rate (e.g., 2/second).
//    - Good for: APIs where you want to allow short bursts.
//    - Problem: Requires storing last refill timestamp + remaining tokens.
//      More complex to implement atomically in Redis.
//
// 5. Leaky Bucket:
//    - Requests enter a queue that "leaks" at a fixed rate.
//    - Produces perfectly smooth output traffic.
//    - Problem: Adds queueing latency. Not suitable for real-time API responses.
//
// WHY SLIDING WINDOW COUNTER:
// - Our flash sale has bursty but legitimate traffic (10,000 users at sale start).
// - We need accuracy (no boundary exploit) with minimal Redis memory.
// - We need atomicity (multiple API instances sharing Redis).
// - We do NOT need perfectly smooth output (that's what our Redis queue does).
//
// CLIENT IDENTIFICATION:
// =======================
// For authenticated requests: User ID (from JWT). 
//   - Why not IP? Multiple users behind the same NAT/corporate network/college WiFi
//     would share a single IP. Limiting by IP would unfairly throttle legitimate users.
// For unauthenticated requests: IP address.
//   - We don't have a user ID yet. IP is the only identifier.
//   - Edge case: NAT/corporate networks may share IPs. This is acceptable for
//     unauthenticated endpoints because those endpoints (login, register) should
//     have strict limits regardless.
//
// WHY NOT ONLY IP:
// - Behind NAT: 500 college students share 1 IP. A 10 req/min IP limit means
//   the entire campus gets 10 requests total. Unacceptable.
// - Proxy chains: X-Forwarded-For can be spoofed unless we trust only our own proxy.
//
// WHY NOT ONLY USER ID:
// - Unauthenticated endpoints (login, register) don't have a user ID.
// - An attacker with a botnet could use many IPs to brute-force one account.
//   For login, we also limit by email (target account) in addition to IP.

// Create a dedicated Redis client for rate limiting
// WHY separate client: Rate limiting is a different concern from order queuing.
// If the queue connection is busy with a BRPOP, it shouldn't block rate limit checks.
let rateLimitRedis = null;

function getRateLimitRedis() {
  if (!rateLimitRedis) {
    rateLimitRedis = createRedisClient('rate-limiter');
  }
  return rateLimitRedis;
}

// ============================================
// Lua Script for Atomic Sliding Window Counter
// ============================================
// WHY Lua: Redis executes Lua scripts ATOMICALLY.
// Without Lua, the sequence INCR → EXPIRE could have a race condition:
//   Thread A: INCR key → count = 1
//   Thread A: (crashes before EXPIRE)
//   Result: key has no TTL → lives forever → counter never resets!
//
// With Lua, INCR and EXPIRE happen in ONE atomic operation.
// No other Redis command can execute between them.
//
// The script implements a Sliding Window Counter:
//   1. Get count from previous window (key with prev timestamp)
//   2. INCR current window
//   3. Calculate weighted total
//   4. Return: [currentCount, previousCount, ttl]
const SLIDING_WINDOW_LUA = `
  local currentKey = KEYS[1]
  local previousKey = KEYS[2]
  local windowSize = tonumber(ARGV[1])
  local limit = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])

  -- Increment current window counter
  local current = redis.call('INCR', currentKey)
  if current == 1 then
    -- First request in this window — set expiry to 2x window so previous window data persists
    redis.call('EXPIRE', currentKey, windowSize * 2)
  end

  -- Get previous window count (may not exist → defaults to 0)
  local previous = tonumber(redis.call('GET', previousKey) or '0')

  -- Calculate how far we are into the current window (0.0 to 1.0)
  local windowStart = math.floor(now / windowSize) * windowSize
  local elapsed = now - windowStart
  local overlapFraction = math.max(0, (windowSize - elapsed) / windowSize)

  -- Weighted count = previous window's contribution + current window
  local weightedCount = math.floor(previous * overlapFraction) + current

  -- Get TTL for reset header
  local ttl = redis.call('TTL', currentKey)

  return {weightedCount, current, previous, ttl, limit}
`;

/**
 * Create a rate limiter middleware with specified policy.
 *
 * @param {Object} options
 * @param {number} options.windowMs    - Window size in milliseconds (e.g., 60000 for 1 minute)
 * @param {number} options.max         - Maximum requests allowed per window
 * @param {string} options.prefix      - Redis key prefix (e.g., 'rl:login', 'rl:api')
 * @param {string} [options.keyGenerator] - 'ip', 'user', 'ip+email', or custom function
 * @param {string} [options.failBehavior] - 'open' (allow on Redis failure) or 'closed' (reject)
 * @param {string} [options.message]   - Custom error message
 * @returns {Function} Express middleware
 */
function createRateLimiter(options) {
  const {
    windowMs = 60000,         // Default: 1 minute
    max = 100,                // Default: 100 requests per window
    prefix = 'rl:general',    // Redis key prefix
    keyGenerator = 'ip',      // How to identify the client
    failBehavior = 'open',    // What to do if Redis is down
    message = 'Too many requests. Please try again later.',
  } = options;

  const windowSizeSeconds = Math.ceil(windowMs / 1000);

  return async (req, res, next) => {
    try {
      const redis = getRateLimitRedis();

      // If Redis is not connected, apply fail behavior
      if (!redis || redis.status !== 'ready') {
        if (failBehavior === 'closed') {
          return res.status(503).json({
            success: false,
            error: 'Service temporarily unavailable. Please try again.',
          });
        }
        // fail open — allow the request
        return next();
      }

      // 1. Identify the client
      const clientKey = generateClientKey(req, keyGenerator);

      // 2. Calculate window keys
      const now = Math.floor(Date.now() / 1000); // Unix seconds
      const currentWindow = Math.floor(now / windowSizeSeconds);
      const previousWindow = currentWindow - 1;

      const currentKey = `${prefix}:${clientKey}:${currentWindow}`;
      const previousKey = `${prefix}:${clientKey}:${previousWindow}`;

      // 3. Execute atomic Lua script
      const result = await redis.eval(
        SLIDING_WINDOW_LUA,
        2,                  // number of KEYS
        currentKey,         // KEYS[1]
        previousKey,        // KEYS[2]
        windowSizeSeconds,  // ARGV[1]
        max,                // ARGV[2]
        now                 // ARGV[3]
      );

      const [weightedCount, currentCount, previousCount, ttl, limit] = result;

      // 4. Set rate limit headers (always, even if allowed)
      // These headers follow the IETF draft standard for rate limiting.
      const remaining = Math.max(0, limit - weightedCount);
      const resetTime = Math.ceil(Date.now() / 1000) + ttl;

      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Remaining', String(remaining));
      res.set('X-RateLimit-Reset', String(resetTime));

      // 5. Check if over limit
      if (weightedCount > limit) {
        res.set('Retry-After', String(ttl));
        return res.status(429).json({
          success: false,
          error: message,
          retryAfter: ttl,
          limit,
          remaining: 0,
        });
      }

      // 6. Allowed — continue to next middleware
      next();

    } catch (error) {
      // Redis error — apply fail behavior
      console.error(`[RateLimiter:${prefix}] Redis error:`, error.message);
      if (failBehavior === 'closed') {
        return res.status(503).json({
          success: false,
          error: 'Service temporarily unavailable.',
        });
      }
      // fail open
      next();
    }
  };
}

/**
 * Generate a client identification key based on the strategy.
 */
function generateClientKey(req, strategy) {
  if (typeof strategy === 'function') {
    return strategy(req);
  }

  switch (strategy) {
    case 'user':
      // For authenticated routes — use user ID if available, fallback to IP
      return req.user ? `uid:${req.user.id}` : `ip:${getClientIp(req)}`;

    case 'ip+email':
      // For login — combine IP and the email being targeted
      // This prevents an attacker from locking out a legitimate user's email
      // by flooding login attempts. The limit applies per IP+email combination.
      const email = req.body?.email || 'unknown';
      return `ip:${getClientIp(req)}:email:${email}`;

    case 'ip':
    default:
      return `ip:${getClientIp(req)}`;
  }
}

/**
 * Extract client IP address, respecting trusted proxies.
 *
 * WHY NOT blindly trust X-Forwarded-For:
 *   An attacker can send: X-Forwarded-For: 1.2.3.4
 *   If we blindly trust this, they can bypass IP-based rate limiting
 *   by rotating fake IPs in the header.
 *
 * We only trust X-Forwarded-For if Express's 'trust proxy' is configured.
 * In production behind Nginx, we set: app.set('trust proxy', 1)
 * which means "trust the FIRST proxy hop" (Nginx).
 * Nginx then sets X-Forwarded-For to the real client IP.
 */
function getClientIp(req) {
  // req.ip already handles trust proxy configuration
  // If trust proxy is enabled, req.ip = leftmost X-Forwarded-For entry
  // If trust proxy is disabled (default), req.ip = socket.remoteAddress
  return req.ip || req.connection?.remoteAddress || '0.0.0.0';
}

// ============================================
// Pre-configured Rate Limit Policies
// ============================================
// WHY different limits per endpoint:
// - Login needs strict limits (brute-force target).
// - Register needs moderate limits (account creation abuse).
// - Flash sale orders need generous limits (legitimate traffic spikes).
// - General API needs standard limits.

/**
 * Login rate limiter — STRICT
 * 10 attempts per 15 minutes per IP+email combination.
 *
 * WHY 10/15min: bcrypt takes ~300ms per attempt. An attacker trying
 * 10 passwords per 15 minutes would need 250 hours to try 10,000 passwords.
 * This is aggressive but won't affect legitimate users who rarely fail login.
 *
 * WHY IP+email: If we only limit by email, an attacker could lock out
 * a legitimate user by flooding their email. With IP+email, the attacker
 * locks out only THEIR OWN IP from that email.
 *
 * FAIL BEHAVIOR: CLOSED. If Redis is down, we do NOT allow unlimited
 * login attempts. Security is more important than availability for auth.
 */
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // 10 attempts per window
  prefix: 'rl:login',
  keyGenerator: 'ip+email',
  failBehavior: 'closed',     // Security-critical: reject if Redis is down
  message: 'Too many login attempts. Please try again in 15 minutes.',
});

/**
 * Register rate limiter — MODERATE
 * 5 registrations per hour per IP.
 *
 * WHY 5/hour: No legitimate user registers 5 accounts in an hour.
 * This prevents automated account creation (spam bots, fraud).
 *
 * FAIL BEHAVIOR: CLOSED. Preventing mass account creation is security-critical.
 */
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,                     // 5 registrations per hour
  prefix: 'rl:register',
  keyGenerator: 'ip',
  failBehavior: 'closed',
  message: 'Too many registration attempts. Please try again in 1 hour.',
});

/**
 * Order rate limiter — GENEROUS
 * 30 orders per minute per user.
 *
 * WHY 30/min: During a flash sale, a legitimate user might quickly try
 * to order multiple different products. 30/min = 1 every 2 seconds, which
 * is generous enough for real users but prevents scripts from flooding.
 *
 * WHY per user (not per IP): Multiple users on the same Wi-Fi (e.g., a
 * college dorm during a flash sale) should each get their own limit.
 *
 * FAIL BEHAVIOR: OPEN. During a flash sale, availability is more important.
 * If Redis rate-limit is down but the order queue Redis works, we still
 * want to accept orders. The queue provides backpressure protection.
 */
const orderLimiter = createRateLimiter({
  windowMs: 60 * 1000,       // 1 minute
  max: 30,                    // 30 orders per minute
  prefix: 'rl:order',
  keyGenerator: 'user',
  failBehavior: 'open',
  message: 'Too many order requests. Please slow down.',
});

/**
 * General API rate limiter — STANDARD
 * 100 requests per minute per IP.
 *
 * Applies to all other endpoints as a safety net.
 *
 * FAIL BEHAVIOR: OPEN. General API availability is more important
 * than blocking a few extra requests during Redis downtime.
 */
const generalLimiter = createRateLimiter({
  windowMs: 60 * 1000,       // 1 minute
  max: 100,                   // 100 requests per minute
  prefix: 'rl:general',
  keyGenerator: 'ip',
  failBehavior: 'open',
  message: 'Too many requests. Please try again later.',
});

module.exports = {
  createRateLimiter,
  loginLimiter,
  registerLimiter,
  orderLimiter,
  generalLimiter,
  getRateLimitRedis,
};
