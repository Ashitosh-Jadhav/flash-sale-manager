# Flash Sale Manager — Authentication & Authorization Architecture

## 1. Overview

The Flash Sale Manager uses **JWT-based stateless authentication** with **role-based access control (RBAC)** and **object-level authorization**.

```
Client
  ↓ (POST /api/auth/login)
Express API
  ↓ (bcrypt.compare)
MySQL (users table)
  ↓ (jwt.sign)
JWT Token → Client stores in memory/localStorage
  ↓ (Authorization: Bearer <token>)
Every subsequent request → authenticate middleware → req.user
```

## 2. User Schema

```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_email (email)
);
```

**Design decisions:**
- `email` has a UNIQUE index — prevents duplicate registrations and enables fast login lookups.
- `password_hash` stores bcrypt output (60 chars), NEVER plaintext.
- `role` uses MySQL ENUM for database-level constraint enforcement.
- `created_at` / `updated_at` — audit trail.

## 3. Password Security

### Why Hashing, Not Encryption
- **Encryption** is reversible — if an attacker gets the key, they get all passwords.
- **Hashing** is one-way — even if the database leaks, passwords cannot be recovered.

### Why bcrypt
- Deliberately slow (~300ms per hash at cost 12). Brute-force attacks become computationally infeasible.
- Built-in **salt** — two users with the same password get different hashes.
- **Cost factor** = 12 (2^12 = 4096 iterations). Each increment doubles compute time.

### Registration Flow
```
User password ("Secure123")
  ↓ bcrypt.hash(password, 12)
  ↓ Generates random 16-byte salt
  ↓ Hashes password + salt (4096 iterations)
  ↓ Result: "$2b$12$LJ3m4ys3Lk.../...hashedvalue..."
  ↓ Store in password_hash column
```

### Login Flow
```
User provides password ("Secure123")
  ↓ Fetch user by email
  ↓ bcrypt.compare(password, stored_hash)
  ↓ Extracts salt from stored hash
  ↓ Hashes provided password with same salt
  ↓ Compares: match → authenticated, no match → rejected
```

## 4. JWT Design

### Structure
```
HEADER.PAYLOAD.SIGNATURE

Header:  { "alg": "HS256", "typ": "JWT" }
Payload: { "userId": 1, "role": "customer", "iat": 1723..., "exp": 1723..., "iss": "flash-sale-manager", "sub": "1" }
Signature: HMACSHA256(base64(header) + "." + base64(payload), JWT_SECRET)
```

### What's in the Payload
- `userId` — identifies the user (looked up in DB on each request)
- `role` — used for quick RBAC checks
- `iat` — issued at timestamp
- `exp` — expiration (24 hours)
- `iss` — issuer claim ("flash-sale-manager")
- `sub` — subject (user ID as string)

### What's NOT in the Payload
- ❌ Password or password hash
- ❌ Email (personal data — minimize PII in tokens)
- ❌ Credit card information
- ❌ Any data that would be catastrophic if decoded

### Token Lifetime
- Access token: **24 hours** (`JWT_EXPIRES_IN=24h`)
- We do NOT implement refresh tokens in this phase. For a flash sale system with short-duration events, a 24h access token is sufficient.

## 5. Middleware Architecture

### authenticate()
```
Request → Extract "Authorization: Bearer <token>" header
  → jwt.verify(token, JWT_SECRET) — checks signature + expiration
  → User.findById(decoded.userId) — ensures user still exists
  → Attach user to req.user
  → next()
```

### authorize(...roles)
```
Request → (already authenticated, req.user exists)
  → Check if req.user.role is in allowed roles
  → If yes: next()
  → If no: 403 Forbidden
```

## 6. Access Control Policy

| Endpoint | Method | Auth Required | Role Required | Ownership Check |
|----------|--------|:------------:|:-------------:|:---------------:|
| `/api/auth/register` | POST | ❌ | — | — |
| `/api/auth/login` | POST | ❌ | — | — |
| `/api/auth/me` | GET | ✅ | any | — |
| `/api/products` | GET | ❌ | — | — |
| `/api/products/:id` | GET | ❌ | — | — |
| `/api/products` | POST | ✅ | admin | — |
| `/api/orders` | POST | ✅ | any | — |
| `/api/orders/async` | POST | ✅ | any | — |
| `/api/orders` | GET | ✅ | any | ✅ (own orders only, admin sees all) |
| `/api/orders/:id` | GET | ✅ | any | ✅ (own order or admin) |
| `/api/orders/:id/status` | PATCH | ✅ | admin | — |

## 7. Object-Level Authorization (IDOR Prevention)

**Problem:** Authentication and RBAC alone don't prevent:
```
Alice (authenticated customer) → GET /api/orders/456
Order #456 belongs to Bob
Without ownership check: Alice sees Bob's order! (IDOR vulnerability)
```

**Solution:** After finding the order, check `order.user_id === req.user.id` OR `req.user.role === 'admin'`.

## 8. Security Decisions & Threats Considered

| Threat | Mitigation |
|--------|-----------|
| Plaintext password storage | bcrypt with cost 12 |
| Email enumeration on login | Same error for "not found" and "wrong password" |
| JWT secret in code | Loaded from `.env`, never committed |
| Sensitive data in JWT | Only userId and role in payload |
| Expired tokens | 24h expiry enforced by jwt.verify |
| Token tampering | HMAC-SHA256 signature verification |
| IDOR attacks | Object-level ownership checks |
| Privilege escalation | RBAC middleware on admin routes |
| Password hash leakage | findById excludes password_hash column |
| Brute force login | Prepared for rate limiting (Phase 9) |

## 9. Trade-offs

### No Refresh Tokens
For a flash sale system with events lasting hours, a 24h access token is practical. Refresh tokens add complexity (secure storage, rotation, revocation) that isn't justified for this use case.

### Stateless JWT vs Server Sessions
We chose stateless JWT because:
- No session store needed (no Redis session overhead)
- Horizontal scaling is trivial (any API server can verify the token)
- No server-side state to manage

The downside: we can't revoke individual tokens without a blacklist. For this project, token expiry is sufficient.
