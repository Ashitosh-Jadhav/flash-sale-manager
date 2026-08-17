# Flash Sale Manager — Rate Limiting Architecture

## 1. Why Rate Limiting?

Rate limiting controls how many requests a client can make to an API within a time window. Without it, our flash sale API is vulnerable to:

### Threats Mitigated
| Threat | Description | Target Endpoint |
|--------|------------|-----------------|
| Brute-force login | Trying millions of passwords | POST /api/auth/login |
| Credential stuffing | Using leaked password databases | POST /api/auth/login |
| Account creation abuse | Spam bots creating fake accounts | POST /api/auth/register |
| Order flooding | Scripts submitting thousands of orders | POST /api/orders |
| Application-level DoS | Overwhelming the API with valid requests | All endpoints |

### What Rate Limiting Does NOT Solve
- **DDoS attacks**: A distributed denial-of-service with millions of IPs requires infrastructure-level protection (Cloudflare, AWS Shield). Our rate limiter is application-level.
- **Network-layer floods**: SYN floods, UDP floods happen below HTTP. They never reach our Express middleware.

## 2. Algorithm: Sliding Window Counter

### Algorithms Evaluated

| Algorithm | Memory | Accuracy | Burst Handling | Complexity | Redis-Friendly |
|-----------|--------|----------|----------------|------------|:--------------:|
| Fixed Window Counter | O(1) | ❌ Boundary burst exploit | Poor | Low | ✅ |
| Sliding Window Log | O(n) | ✅ Perfect | Good | Medium | ⚠️ High memory |
| **Sliding Window Counter** | **O(1)** | **~99.5%** | **Good** | **Medium** | **✅** |
| Token Bucket | O(1) | ✅ Good | Allows controlled burst | High | ⚠️ |
| Leaky Bucket | O(1) | ✅ Perfect | Smooth output | High | ⚠️ |

### Why Sliding Window Counter
- **Memory efficient**: Only 2 counters per client per endpoint (current + previous window).
- **No boundary exploit**: Unlike fixed window, the weighted calculation prevents the "boundary burst" attack where a client sends 2x the limit by timing requests across a window boundary.
- **Redis-friendly**: Only needs `INCR` and `EXPIRE` — the simplest Redis operations.
- **Accurate enough**: ~99.5% accuracy is acceptable for rate limiting. We don't need exact counts.

### How It Works
```
Window = 60 seconds
Limit = 100 requests
Current time = 45 seconds into the current window

Previous window had 80 requests
Current window has 30 requests

Overlap fraction = (60 - 45) / 60 = 0.25
Weighted count = 80 × 0.25 + 30 = 50

50 < 100 → Request ALLOWED
```

## 3. Client Identification Strategy

| Endpoint | Identifier | Rationale |
|----------|-----------|-----------|
| Login | IP + email | Prevents both IP-based brute-force AND per-email flooding without allowing account lockout attacks |
| Register | IP | No user identity exists yet; IP is the only option |
| Orders | User ID | Authenticated; per-user limits respect shared network environments |
| General API | IP | Catch-all safety net |

### Why Not Only IP?
- Behind NAT: 500 college students share 1 IP. A 10 req/min IP limit throttles the entire campus.
- Corporate networks: Large offices may have thousands of users behind a single egress IP.

### Why IP+Email for Login?
- If we only limit by email: An attacker floods login attempts for `victim@company.com`, locking out the real user. This is an account denial-of-service.
- If we only limit by IP: An attacker behind a botnet rotates IPs to brute-force one email.
- IP+email: The attacker's specific IP gets blocked from that specific email. The real user on a different IP can still log in.

### X-Forwarded-For Handling
We do NOT blindly trust `X-Forwarded-For`. An attacker can spoof it:
```
X-Forwarded-For: 1.2.3.4  ← attacker sets this to bypass IP limits
```
We only trust it when Express's `trust proxy` is configured, meaning Nginx (our trusted proxy) sets the header.

## 4. Endpoint-Specific Policies

| Endpoint | Limit | Window | Identifier | Fail Behavior |
|----------|-------|--------|------------|:-------------:|
| POST /api/auth/login | 10 | 15 min | IP + email | **CLOSED** |
| POST /api/auth/register | 5 | 1 hour | IP | **CLOSED** |
| POST /api/orders | 30 | 1 min | User ID | OPEN |
| POST /api/orders/async | 30 | 1 min | User ID | OPEN |
| All /api/* | 100 | 1 min | IP | OPEN |

### Policy Justification
- **Login (10/15min)**: bcrypt takes ~300ms. At 10 attempts per 15 minutes, brute-forcing 10,000 passwords would take ~10 days. Legitimate users rarely fail login > 5 times.
- **Register (5/hour)**: No legitimate user creates 5 accounts per hour. This prevents automated account creation.
- **Orders (30/min)**: During a flash sale, a user might quickly try multiple products. 30/min = 1 every 2 seconds. Generous enough for humans, restrictive for bots.
- **General (100/min)**: Standard API protection. Prevents any single IP from monopolizing server resources.

## 5. Redis Design

### Atomic Lua Script
The rate limiter uses a Lua script executed atomically in Redis:
```lua
INCR currentKey
EXPIRE currentKey (2 × windowSize)
GET previousKey
-- Calculate weighted count
return {weightedCount, currentCount, previousCount, ttl, limit}
```

**Why Lua?** Without it:
```
INCR key       ← succeeds
-- process crashes here --
EXPIRE key     ← never executes
```
The key lives forever, counter never resets. Lua guarantees atomicity.

### Key Format
```
rl:{policy}:{identifier}:{windowNumber}
Example: rl:login:ip:192.168.1.1:email:user@test.com:1985539
```

## 6. Failure Behavior

| Scenario | Login/Register | Orders/General |
|----------|:--------------:|:--------------:|
| Redis down | **FAIL CLOSED** (503) | **FAIL OPEN** (allow) |
| Redis timeout | **FAIL CLOSED** (503) | **FAIL OPEN** (allow) |

### Why Different?
- **Login/Register (CLOSED)**: Security-critical. If we can't verify rate limits, we must not allow unlimited brute-force attempts.
- **Orders/General (OPEN)**: Availability-critical. During a flash sale, blocking all orders because the rate-limit Redis is temporarily slow would be catastrophic. The order queue already provides backpressure protection.

## 7. HTTP 429 Response

```json
HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1723847400

{
  "success": false,
  "error": "Too many login attempts. Please try again in 15 minutes.",
  "retryAfter": 45,
  "limit": 10,
  "remaining": 0
}
```

### Headers
- `X-RateLimit-Limit`: Maximum requests allowed per window
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when the window resets
- `Retry-After`: Seconds until the client should retry (only on 429)

## 8. Performance Impact

### Measured Overhead (k6, 25 VUs, 10s)
| Metric | Without Rate Limiter | With Rate Limiter |
|--------|:-------------------:|:-----------------:|
| Avg Latency | ~2ms | ~2ms |
| P95 Latency | ~3ms | ~3ms |
| Throughput | ~475 RPS | ~475 RPS |

**Conclusion**: The Redis-backed rate limiter adds negligible latency (~0.1ms per Redis round-trip). It is not a performance bottleneck.

## 9. Distributed Rate Limiting

```
          Nginx LB
            │
    ┌───────┼───────┐
    ▼       ▼       ▼
  API1    API2    API3
    │       │       │
    └───────┼───────┘
            ▼
          Redis  ← Single source of truth for rate limits
```

Without shared Redis: Each API instance tracks limits independently.
- API1 sees 4 requests from user X
- API2 sees 3 requests from user X
- API3 sees 3 requests from user X
- **Total**: 10 requests, but no single instance blocks. The limit of 10 is bypassed.

With shared Redis: All instances INCR the same key.
- After 10 total requests across all instances, the 11th request gets 429.

## 10. Security Considerations

| Consideration | Implementation |
|---------------|---------------|
| IP spoofing via X-Forwarded-For | Only trust when `trust proxy` is configured |
| Rate limit bypass via header manipulation | Rate limit headers are informational; enforcement is server-side |
| Account lockout via email flooding | IP+email combination prevents cross-IP lockout |
| Redis memory exhaustion | Keys auto-expire via TTL; no unbounded growth |
| Timing oracle | 429 response time is consistent regardless of which limit was hit |
