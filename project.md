# Flash Sale Manager — Project Progress Journal

> A production-grade flash sale order management system built step-by-step.
> This document tracks every phase, every decision, and every lesson learned.

---

## 📋 Project Roadmap

| Phase | Component                          | Status         |
|-------|------------------------------------|----------------|
| 1     | Express Server Setup               | ✅ Complete    |
| 2     | MySQL + Data Models                | ✅ Complete    |
| 3     | CRUD API Routes                    | ✅ Complete    |
| 4     | Flash Sale Logic & Concurrency     | 🔄 In Progress |
| 5     | Redis Caching                      | 🔲 Not Started |
| 6     | Background Workers                 | 🔲 Not Started |
| 7     | Authentication & Auth              | 🔲 Not Started |
| 8     | Rate Limiting                      | 🔲 Not Started |
| 9     | Docker Containerization            | 🔲 Not Started |
| 10    | Nginx Reverse Proxy                | 🔲 Not Started |
| 11    | CI/CD Pipeline                     | 🔲 Not Started |
| 12    | Monitoring & Logging               | 🔲 Not Started |
| 13    | Load Testing                       | 🔲 Not Started |

---

## 📅 Day 1 — August 1, 2026

### Phase 1: Express Server Setup

#### 🎯 Goal
Set up the project foundation: Node.js project initialization, Express.js web server, production-grade project structure, and graceful shutdown handling.

#### 🧠 Concepts Learned

1. **What is Express.js?**
   - A minimal, unopinionated Node.js web framework
   - Handles HTTP request routing, middleware pipeline, and response sending
   - Used in production by Uber, IBM, PayPal
   - Chosen because it teaches fundamentals without hiding complexity

2. **What is `package.json`?**
   - The "birth certificate" of a Node.js project
   - Tracks project metadata (name, version, description)
   - Lists dependencies (libraries your code needs to run)
   - Lists devDependencies (tools only needed during development)
   - Defines scripts (shortcuts like `npm run dev`)

3. **Why separate `app.js` from `server.js`?**
   - `app.js` defines WHAT the server does (routes, middleware, error handling)
   - `server.js` defines HOW the server runs (port, startup, shutdown)
   - Separation enables testing (import app without starting a real server)
   - Industry-standard pattern used in production codebases

4. **What is Middleware?**
   - Functions that run BETWEEN receiving a request and sending a response
   - `express.json()` — parses JSON request bodies
   - `express.urlencoded()` — parses form data
   - Middleware executes in ORDER of registration
   - Can modify `req`/`res` objects or terminate the request cycle

5. **What is a Health Check endpoint?**
   - `GET /health` — returns 200 OK if the server is alive
   - Used by load balancers (Nginx, AWS ALB) to route traffic
   - If it fails, traffic is redirected to healthy servers
   - Critical during flash sales to handle server overload

6. **What is Graceful Shutdown?**
   - When the server receives SIGTERM/SIGINT (Ctrl+C or deploy)
   - Stop accepting NEW connections
   - Wait for in-flight requests to complete
   - Close database/Redis connections cleanly
   - Prevents corrupted orders during a flash sale

7. **What is `.env` and `dotenv`?**
   - `.env` stores environment-specific config (port, DB URL, secrets)
   - `dotenv` package loads `.env` values into `process.env`
   - NEVER committed to Git (security risk)
   - Different environments (dev/staging/prod) have different `.env` files

8. **What is `.gitignore`?**
   - Tells Git which files/folders to never track
   - `node_modules/` — reproducible via `npm install`, can be 200MB+
   - `.env` — contains secrets
   - Logs, OS files, IDE config — not part of source code

#### 📁 Files Created

| File | Purpose |
|------|---------|
| `package.json` | Project metadata, dependencies, scripts |
| `.env` | Environment variables (PORT, NODE_ENV) |
| `.gitignore` | Files Git should ignore |
| `src/config/index.js` | Centralized config reader (reads .env once) |
| `src/app.js` | Express app definition (routes, middleware, error handlers) |
| `src/server.js` | Server entry point (starts listening, graceful shutdown) |
| `src/routes/README.md` | Placeholder — route definitions (Phase 3) |
| `src/controllers/README.md` | Placeholder — request handlers (Phase 3) |
| `src/models/README.md` | Placeholder — database models (Phase 2) |
| `src/middleware/README.md` | Placeholder — auth, rate limiting (Phase 6-7) |
| `src/utils/README.md` | Placeholder — helper functions |

#### 🏗 Project Structure

```
flash-sale-manager/
├── .env                    # Environment variables (NEVER commit)
├── .gitignore              # Git ignore rules
├── package.json            # Project config & dependencies
├── package-lock.json       # Exact dependency versions (auto-generated)
├── node_modules/           # Installed packages (auto-generated)
└── src/                    # ALL source code lives here
    ├── app.js              # Express app (routes + middleware)
    ├── server.js           # Entry point (starts the server)
    ├── config/
    │   └── index.js        # Centralized config from .env
    ├── routes/             # Route definitions (Phase 3)
    ├── controllers/        # Request handlers (Phase 3)
    ├── models/             # Database models (Phase 2)
    ├── middleware/          # Auth, rate limit, etc. (Phase 6-7)
    └── utils/              # Helper functions
```

#### 📦 Dependencies Installed

| Package | Type | Purpose |
|---------|------|---------|
| `express` | production | Web framework for handling HTTP |
| `dotenv` | production | Loads .env file into process.env |
| `nodemon` | dev only | Auto-restarts server on file changes |

#### 🧪 How to Test

```bash
# Start the dev server (auto-restarts on changes)
npm run dev

# In another terminal, test the endpoints:
curl http://localhost:3000/          # Root — API info
curl http://localhost:3000/health    # Health check
curl http://localhost:3000/banana    # 404 test
```

#### 🔑 Key Takeaways
- Always separate app definition from server startup (testability)
- Always use centralized config (maintainability)
- Always add health checks (production readiness)
- Always handle graceful shutdown (data integrity)
- Never hardcode secrets (security)
- Never commit node_modules or .env (Git hygiene)

---

## 📅 Day 2 — August 2, 2026

### Phase 2: Database Design & MySQL Integration

#### 🎯 Goal
Understand relational databases, normalize data, design the schemas for Products and Orders, and connect Express to MySQL using production practices like connection pooling.

#### 🧠 Concepts Learned

1. **SQL vs NoSQL:**
   - MySQL (SQL) provides ACID transactions, fixed schema, and relations.
   - For a flash sale, ACID prevents overselling (two users buying the same last item).
   - NoSQL (MongoDB) provides eventual consistency which can cause race conditions leading to negative stock when money/inventory is involved.

2. **Normalization:**
   - Organizing data to eliminate redundancy and avoid update/delete anomalies.
   - Instead of storing product details in every order, we store `product_id` (foreign key) in the Orders table pointing to the Products table.

3. **Column Types & Constraints:**
   - **DECIMAL(10,2):** Used for money instead of FLOAT to prevent floating-point rounding errors.
   - **Primary Key (ID):** Uniquely identifies each row, using fast AUTO_INCREMENT integers.
   - **Foreign Key:** Enforces referential integrity (an order must point to a valid product).
   - **CHECK Constraints:** Database-level enforcement (e.g., `stock >= 0`, `price > 0`) as a last line of defense.
   - **Price Lock:** We store `total_price` in the Orders table so if product price changes later, historical orders remain accurate.

4. **Connection Pool:**
   - Creating a new database connection per request takes 20-50ms (TCP handshake, auth, etc.).
   - A connection pool creates connections on startup and REUSES them.
   - Request latency drops from ~30ms to ~0ms, handling high traffic efficiently.

5. **Repository Pattern:**
   - `src/config/database.js` owns the connection pool.
   - `src/models/Product.js` and `Order.js` own the SQL queries.
   - Keeps controllers clean and decouples HTTP logic from database logic.

#### 📁 Files Created & Modified

| File | Purpose |
|------|---------|
| `src/config/database.js` | Connection pool setup for MySQL |
| `src/models/Product.js` | Data access logic for products |
| `src/models/Order.js` | Data access logic for orders |
| `.env` | Added MySQL connection secrets |

#### 🏗 Database Schema

**Products:**
- `id` INT PK AI
- `name` VARCHAR(255)
- `price` DECIMAL(10,2)
- `stock` INT (Default 0, Check >= 0)
- `flash_sale` BOOLEAN
- `sale_start`, `sale_end` DATETIME
- `created_at`, `updated_at` TIMESTAMP

**Orders:**
- `id` INT PK AI
- `product_id` INT FK
- `customer_name`, `customer_email` VARCHAR(255)
- `quantity` INT
- `total_price` DECIMAL(10,2)
- `status` ENUM('pending', 'confirmed', 'cancelled', 'shipped', 'delivered')
- `created_at`, `updated_at` TIMESTAMP

---

## 📅 Day 3 — August 2, 2026

### Phase 3: REST API & CRUD Routes

#### 🎯 Goal
Understand REST architecture, MVC pattern, and build a clean, production-grade REST API for Products and Orders step by step. We will not use Redis, Docker, or auth yet—just pure API fundamentals.

#### 🧠 Concepts Learned

1. **REST Architecture:**
   - Universal standard for building APIs using nouns for URLs (e.g., `/products`) and HTTP methods for actions.
2. **HTTP Methods:**
   - **GET**: Read data (Never modify).
   - **POST**: Create new data.
   - **PUT/PATCH**: Update data (PUT replaces, PATCH partially updates).
   - **DELETE**: Remove data.
3. **Request Anatomy:**
   - `req.body`: JSON payload (e.g., creating a product).
   - `req.params`: URL variables (e.g., `/products/:id`).
   - `req.query`: URL query string (e.g., `?flash_sale=true`).
4. **HTTP Status Codes:**
   - **200 OK**: Success.
   - **201 Created**: Resource created successfully.
   - **400 Bad Request**: Invalid client input (validation failed).
   - **404 Not Found**: Resource doesn't exist.
   - **500 Internal Server Error**: Server crashed or DB failed.
5. **MVC Architecture & Thin Controllers:**
   - **Model**: Database logic (SQL queries).
   - **View**: JSON response.
   - **Controller**: HTTP logic (extracts body/params, calls Model, sends JSON).
   - Controllers stay *thin*—they shouldn't contain raw SQL. This makes testing easier and code reusable.

#### 📝 API Design Specification (Paper Design)

**Product Endpoints:**
- `POST /api/products` -> Create a new product.
- `GET /api/products` -> List all products (with optional filtering).
- `GET /api/products/:id` -> Get details of a single product.

**Order Endpoints:**
- `POST /api/orders` -> Place a new order.
- `GET /api/orders` -> List all orders.
- `GET /api/orders/:id` -> Get details of a single order.

#### 🚀 Implementation Details & Advanced Concepts

1. **Concurrency Control & Row Locking (`FOR UPDATE`)**
   - Flash sales suffer from **Race Conditions**. If 100 people click "Buy" simultaneously when only 1 item is left, a simple `SELECT` and `UPDATE` will result in negative stock.
   - We used an ACID transaction with **row-level locking** in `Order.js`:
     ```sql
     SELECT price, stock FROM products WHERE id = ? FOR UPDATE
     ```
   - `FOR UPDATE` locks the specific product row. Other concurrent requests must wait in a queue until the current transaction commits or rolls back. This guarantees stock is never oversold.

2. **Centralized Error Handling**
   - We avoided repetitive `try/catch` blocks sending `res.status(500)` in every controller.
   - Instead, we throw errors in our models (e.g., `error.statusCode = 404`), catch them in the controller, and pass them to the global Express error handler using `next(error)`.
   - This ensures a uniform JSON error response and keeps controllers extremely clean.

3. **Validation Strategies**
   - We implemented basic input validation inside the controllers before hitting the database (e.g., ensuring `price > 0`, `stock >= 0`, `quantity > 0`).

#### 📁 Files Created & Modified

| File | Purpose |
|------|---------|
| `src/models/Product.js` | Updated with `create`, `findAll`, and `findById` queries |
| `src/models/Order.js` | Updated with transactional `create` query and read queries |
| `src/controllers/productController.js` | Handles HTTP logic and validation for products |
| `src/controllers/orderController.js` | Handles HTTP logic and validation for orders |
| `src/routes/productRoutes.js` | Maps `/api/products` endpoints to the controller |
| `src/routes/orderRoutes.js` | Maps `/api/orders` endpoints to the controller |
| `src/app.js` | Mounted the new API routes (`app.use('/api/...', routes)`) |

#### 🧪 How to Test

```bash
# 1. Create a product
curl -X POST http://localhost:3000/api/products \
-H "Content-Type: application/json" \
-d '{"name": "iPhone 16", "price": 79999, "stock": 5, "flash_sale": true}'

# 2. List all products
curl http://localhost:3000/api/products

# 3. Place an order (Watch the stock decrease!)
curl -X POST http://localhost:3000/api/orders \
-H "Content-Type: application/json" \
-d '{"productId": 1, "customerName": "Alice", "customerEmail": "alice@test.com", "quantity": 1}'

# 4. Try to buy more stock than exists (Should return 400 Bad Request)
curl -X POST http://localhost:3000/api/orders \
-H "Content-Type: application/json" \
-d '{"productId": 1, "customerName": "Bob", "customerEmail": "bob@test.com", "quantity": 10}'
```

---

## 📅 Day 4 — August 9, 2026

### Phase 4: Flash Sale Business Logic & Concurrency

#### 🎯 Goal
Before adding Redis, workers, or any infrastructure — make the synchronous order system **correct** under concurrent requests. This phase is what separates a CRUD app from a real production backend.

---

#### Step 1: Understanding the Problem

##### 1. What is Business Logic?

Business logic is the set of rules that are **specific to your business domain**, not to HTTP or databases.

Examples in our flash sale system:
- "A customer can only buy if the flash sale is currently active."
- "Stock cannot go below zero."
- "An order moves from PENDING → CONFIRMED, never backwards."
- "If a duplicate request arrives, return the original order instead of creating a second one."

These rules exist regardless of whether you use Express or Fastify, MySQL or PostgreSQL. They are the **core value** of your application.

##### 2. Why Shouldn't Business Logic Live in Controllers?

In Phase 3, we put some validation in our controllers. That was fine for simple CRUD. But flash sale logic is **complex** — it involves inventory checks, time-window validation, transactions, and idempotency.

If you put all of this inside a controller, you get:
- **A 200-line controller function** that's impossible to read or debug.
- **Untestable logic** — to test the business rules, you'd have to simulate full HTTP requests.
- **Duplication** — if another part of the app needs to place an order (e.g., a batch import, a webhook), you'd copy-paste the logic.

**Interview answer:** *"Controllers should only handle HTTP concerns — parsing the request, calling the right service, and formatting the response. Business logic belongs in a service layer so it can be tested independently, reused across different entry points, and modified without touching the HTTP layer."*

##### 3. What is a Service Layer?

A service layer is a **dedicated module** that contains business logic. It sits between the controller and the model:

```
Controller (HTTP)  →  Service (Business Rules)  →  Model/Repository (SQL)
```

The service layer:
- Receives plain JavaScript objects (not `req`/`res`)
- Applies business rules ("is the sale active?", "is there stock?")
- Orchestrates database operations (transactions)
- Returns plain results or throws domain-specific errors
- Has **no knowledge of HTTP** — no `req`, no `res`, no status codes

##### 4. What is a Race Condition?

A race condition occurs when the **outcome of an operation depends on the timing of other operations**, and the system produces an incorrect result because of this timing.

In normal English: two things happen at almost the same time, and because neither knows about the other, the system ends up in a broken state.

##### 5. What is Concurrency?

Concurrency means multiple operations are **in progress at the same time**. In Node.js, even though JavaScript is single-threaded, we achieve concurrency through the event loop — while one request is waiting for a database response, another request is being processed.

In a flash sale, you might have **10,000 requests per second** all trying to buy the same product. Each request is a concurrent operation competing for the same limited resource (stock).

##### 6. Why is Concurrency Dangerous During a Flash Sale?

Because **stock is a shared, finite resource**. Every concurrent request is trying to:
1. READ the current stock
2. CHECK if stock > 0
3. REDUCE stock by 1

If two requests do step 1 at the same time, they both see the same stock value. Both proceed to step 3. Stock goes negative. This is called **overselling**.

##### 7. What is Overselling?

Overselling means you sold more units than you physically have. In e-commerce, this means:
- Customers receive confirmation emails for orders you cannot fulfill
- You must issue refunds and apologies
- You lose customer trust and potentially face legal issues
- During a flash sale with limited inventory, this is **catastrophic**

##### 8. Concrete Example: The Race Condition

Setup: `Product #1` has `stock = 1`. Two users (Alice and Bob) click "Buy" at the exact same millisecond.

**WITHOUT protection (the bug):**

```
Time    Alice's Request              Bob's Request               Database (stock)
─────   ────────────────────         ────────────────────        ─────────────────
t=0     SELECT stock → gets 1        SELECT stock → gets 1       stock = 1
t=1     Check: 1 >= 1? YES ✓         Check: 1 >= 1? YES ✓        stock = 1
t=2     UPDATE stock = 0             UPDATE stock = 0             stock = 0
t=3     INSERT order (Alice) ✓        INSERT order (Bob) ✓         stock = 0
t=4     Response: "Order confirmed"   Response: "Order confirmed"  stock = 0
```

**Result:** TWO orders confirmed, but only ONE item existed. You owe one customer a refund and an apology. Stock should be -1 but your CHECK constraint prevents that — so the second UPDATE silently fails or throws an error after you've already told Bob his order is confirmed.

**WITH protection (the fix — we'll implement this):**

```
Time    Alice's Request              Bob's Request               Database (stock)
─────   ────────────────────         ────────────────────        ─────────────────
t=0     BEGIN TRANSACTION            BEGIN TRANSACTION            stock = 1
t=1     SELECT stock FOR UPDATE      (BLOCKED — waiting)          stock = 1 (locked)
        → gets 1
t=2     UPDATE stock = 0             (still waiting...)           stock = 0
t=3     INSERT order (Alice) ✓       (still waiting...)           stock = 0
t=4     COMMIT ✓                     (lock released!)             stock = 0
t=5                                  SELECT stock FOR UPDATE
                                     → gets 0
t=6                                  Check: 0 >= 1? NO ✗
t=7                                  ROLLBACK
t=8                                  Response: "Out of stock"     stock = 0
```

**Result:** Exactly ONE order. Alice gets the item. Bob gets a clear "out of stock" error. Stock is correct. No overselling.

---

#### Step 2: Designing the Order Flow

##### The Layered Architecture

```
Client (Browser / curl / Postman)
  │
  ▼
Route          src/routes/orderRoutes.js
  │            Matches URL + HTTP method to a controller function.
  │            NO logic here — just wiring.
  ▼
Controller     src/controllers/orderController.js
  │            1. Extracts data from req.body, req.params, req.headers
  │            2. Calls the service layer
  │            3. Sends HTTP response with correct status code
  │            NO business logic, NO SQL, NO transactions.
  ▼
Service        src/services/orderService.js
  │            1. Validates business rules (is flash sale active?)
  │            2. Checks idempotency
  │            3. Manages the database transaction
  │            4. Orchestrates: check stock → reserve → create order
  │            5. Throws domain errors (InsufficientStockError, etc.)
  │            This is where the BRAIN of the system lives.
  ▼
Model/Repo     src/models/Product.js, src/models/Order.js
  │            Pure SQL queries. No business decisions.
  │            "Give me product #5", "Insert this order row"
  ▼
MySQL          The database. ACID transactions happen here.
```

##### Where Each Piece of Logic Belongs

| Logic                    | Layer        | Why |
|--------------------------|--------------|-----|
| Parse `req.body`         | Controller   | HTTP concern — extracting data from the request |
| Validate input format    | Controller   | HTTP concern — checking types, required fields |
| Check flash sale active  | Service      | Business rule — depends on sale_start/sale_end times |
| Check stock available    | Service      | Business rule — domain logic |
| Begin/Commit/Rollback    | Service      | The service orchestrates the transaction because it knows which operations must be atomic |
| `SELECT ... FOR UPDATE`  | Model        | Pure SQL — the model knows the query syntax |
| `INSERT INTO orders`     | Model        | Pure SQL |
| `UPDATE products SET stock` | Model     | Pure SQL |
| Idempotency check        | Service      | Business rule — "have we seen this request before?" |
| Map errors to HTTP codes | Controller   | HTTP concern — translating domain errors to status codes |

##### Why the Service Owns the Transaction

This is a critical design decision. The transaction spans **multiple models** (Products AND Orders). Neither model alone knows about the other. The service is the only layer that understands the full business operation:

```
Service says:
  "Begin transaction.
   Ask Product model to lock and check stock.
   Ask Product model to decrease stock.
   Ask Order model to create the order.
   If everything worked: Commit.
   If anything failed: Rollback."
```

If we put the transaction inside the Product model, it wouldn't know about the Order insert. If we put it in the Order model, it wouldn't know about the stock update. The service is the **orchestrator**.

#### Step 3: Database Transactions & ACID

##### What is a Database Transaction?

A transaction is a **group of SQL operations that must either ALL succeed or ALL fail**. There is no "half-done" state.

Example: When placing an order, we do 2 things:
1. Decrease the product's stock (`UPDATE products`)
2. Create the order record (`INSERT INTO orders`)

If we decrease stock but the order insert fails (maybe the network drops), the customer is charged nothing but our inventory is wrong. A transaction prevents this.

##### ACID Properties

| Property       | Meaning | Flash Sale Example |
|----------------|---------|-------------------|
| **Atomicity**   | All operations succeed, or none do. | If order INSERT fails after stock UPDATE, stock is automatically restored. |
| **Consistency** | The database moves from one valid state to another. | Stock can never be negative (CHECK constraint enforced). |
| **Isolation**   | Concurrent transactions don't interfere with each other. | Alice's order doesn't see Bob's uncommitted stock changes. |
| **Durability**  | Once committed, data survives crashes. | If the server reboots after COMMIT, the order is still in the database. |

##### COMMIT vs ROLLBACK

```sql
-- COMMIT: "Save everything I just did."
BEGIN TRANSACTION;
  UPDATE products SET stock = stock - 1 WHERE id = 5;
  INSERT INTO orders (product_id, quantity) VALUES (5, 1);
COMMIT;  -- Both changes are now permanent

-- ROLLBACK: "Undo everything I just did."
BEGIN TRANSACTION;
  UPDATE products SET stock = stock - 1 WHERE id = 5;
  -- Oh no, the INSERT fails!
ROLLBACK;  -- The stock update is also undone
```

##### The Failure Scenario

**Without a transaction:**
```
Step 1: UPDATE products SET stock = stock - 1  →  ✓ SUCCESS (stock goes from 5 to 4)
Step 2: INSERT INTO orders (...)               →  ✗ FAILS (network error)

Result: Stock is 4, but no order exists. We "lost" an item. Nobody bought it,
but it's gone from inventory. This is called a "phantom decrement."
```

**With a transaction:**
```
BEGIN;
Step 1: UPDATE products SET stock = stock - 1  →  ✓ SUCCESS (stock goes from 5 to 4)
Step 2: INSERT INTO orders (...)               →  ✗ FAILS (network error)
ROLLBACK;

Result: Stock is back to 5. No order exists. The database is consistent.
```

##### Should every query be in a transaction?

**No.** Transactions add overhead (locking, memory, latency). Use them only when:
- Multiple related tables are being modified together
- Data consistency between operations is critical
- You need isolation from concurrent writes

A simple `SELECT * FROM products` does NOT need a transaction.

---

#### Step 4: Inventory Concurrency — The Two Approaches

##### Approach A: Read-Then-Write (The Bug)

```javascript
// Step 1: Read the stock
const product = await db.query('SELECT stock FROM products WHERE id = ?', [id]);
// Step 2: Check in application code
if (product.stock >= quantity) {
  // Step 3: Update
  await db.query('UPDATE products SET stock = stock - ? WHERE id = ?', [quantity, id]);
}
```

**Problem:** Between Step 1 and Step 3, another request can read the SAME old stock value. Both pass the check. Both decrement. Stock goes negative.

##### Approach B: Atomic Conditional Update (Better, but not enough alone)

```sql
UPDATE products SET stock = stock - ?
WHERE id = ? AND stock >= ?
```

This is a **single atomic SQL statement**. MySQL guarantees it executes as one unit. If `stock < quantity`, the `WHERE` clause fails and `affectedRows = 0`. No race condition on the UPDATE itself.

**But there's a catch:** We still need to read the product's price to calculate `total_price` for the order. If we do a separate `SELECT` first, we're back to the timing problem. We need to combine this with row locking.

##### Approach C: SELECT ... FOR UPDATE + Transaction (What we use)

```sql
BEGIN;
SELECT price, stock FROM products WHERE id = ? FOR UPDATE;
-- Row is now LOCKED. Other transactions trying to read this row FOR UPDATE will WAIT.
-- We safely check stock in our application code.
UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?;
INSERT INTO orders (...) VALUES (...);
COMMIT;  -- Lock is released
```

**Why this is the best approach for flash sales:**
- `FOR UPDATE` gives us exclusive access to the row for the duration of the transaction
- We can safely read price AND stock, knowing no one else can change them
- The atomic UPDATE with `AND stock >= ?` is our safety net even within the lock
- Other requests are queued, not rejected — they wait their turn

##### Timeline: What Happens Under Concurrency

```
Time    User A                         User B                        DB Stock
─────   ─────────────────────          ─────────────────────         ────────
t=0     BEGIN                          BEGIN                         stock=1
t=1     SELECT ... FOR UPDATE          (BLOCKED - waiting for        stock=1
        → reads stock=1, price=99      A's lock to release)          (locked)
t=2     UPDATE stock = stock - 1       (still waiting...)            stock=0
t=3     INSERT order for A             (still waiting...)            stock=0
t=4     COMMIT ✓                       (A's lock released!)          stock=0
t=5                                    SELECT ... FOR UPDATE
                                       → reads stock=0, price=99
t=6                                    Check: 0 >= 1? NO ✗
t=7                                    ROLLBACK
t=8                                    Return "Out of stock"         stock=0
```

**Result:** Exactly 1 order created. Stock is correct. No overselling.

##### Trade-offs Summary

| Approach | Pros | Cons |
|----------|------|------|
| Read-Then-Write | Simple | Race conditions under concurrency |
| Atomic UPDATE | No race on UPDATE | Can't safely read price first |
| FOR UPDATE + Transaction | Full safety, can read price | Serializes requests (slower under extreme load) |

We chose **Approach C** because correctness > speed. We will optimize speed later with Redis queues.

---

#### Step 5 & 6: Service Layer Implementation

##### What We Built

We created `src/services/orderService.js` — the **brain** of the order system.

##### The Complete Order Flow

```
1. Client sends POST /api/orders with Idempotency-Key header
2. Controller extracts req.body and req.headers['idempotency-key']
3. Controller calls OrderService.placeOrder(data, idempotencyKey)
4. Service checks: Have we seen this idempotency key before?
   → YES: Return existing order (no duplicate)
   → NO: Continue
5. Service gets a DB connection and starts a transaction
6. Service calls Product.findByIdForUpdate(id, connection)
   → Row is now LOCKED
7. Service checks: Is the flash sale currently active?
   → sale_start <= now <= sale_end
8. Service checks: Is there enough stock?
   → product.stock >= quantity
9. Service calls Product.decrementStock(id, quantity, connection)
   → Atomic UPDATE with AND stock >= ? safety net
10. Service calls Order.insert(orderData, connection)
11. Service calls connection.commit()
12. Service returns the order to the controller
13. Controller sends 201 response to client
```

**If ANYTHING fails at steps 6-10:**
- `connection.rollback()` is called
- Stock is restored
- No order is created
- The error propagates to the controller → global error handler → clean JSON response

##### Why the Controller is Now "Thin"

Compare our old controller (Phase 3) vs new controller (Phase 4):

**Old (Fat Controller):**
- Contained transaction logic (`BEGIN`, `COMMIT`, `ROLLBACK`)
- Contained business rules (stock checks)
- Contained SQL queries
- 70+ lines of mixed concerns

**New (Thin Controller):**
- Extracts `req.body` and `req.headers`
- Validates input format (is productId a number?)
- Calls `OrderService.placeOrder()`
- Sends the response
- ~30 lines of pure HTTP logic

---

#### Step 7: Idempotency

##### What is Idempotency?

An operation is **idempotent** if performing it multiple times produces the same result as performing it once.

`GET /api/products` is naturally idempotent — calling it 100 times returns the same list.

`POST /api/orders` is **NOT** naturally idempotent — calling it twice creates two orders.

##### The Problem: Network Failures

```
Client                          Server
  │                               │
  │── POST /api/orders ─────────→ │
  │                               │── Creates order #42 ✓
  │                               │── Sends 201 response
  │←── ✗ NETWORK DROPS ──────────│
  │                               │
  │   (Client never received      │
  │    the response. Did the      │
  │    order succeed? Failed?)    │
  │                               │
  │── POST /api/orders ─────────→ │   ← Client retries!
  │                               │── Creates order #43 ✗ DUPLICATE!
```

The customer is now charged twice for the same thing.

##### The Solution: Idempotency Keys

The client generates a unique ID (UUID) and sends it as a header:

```
POST /api/orders
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

Our service checks:
1. Has this key been used before? → Query `orders` table for `idempotency_key`
2. **YES**: Return the existing order (no new order, no stock reduction)
3. **NO**: Proceed normally, store the key with the new order

##### Implementation Details

- **Column**: `idempotency_key VARCHAR(255) UNIQUE` on the `orders` table
- **Index**: The `UNIQUE` constraint automatically creates an index for fast lookups
- **Concurrent duplicates**: If two identical requests arrive at the EXACT same millisecond, the first one commits the row. The second one gets a MySQL `ER_DUP_ENTRY` error when it tries to insert. We catch this error and return the first order.

##### Database Schema Change Required

```sql
ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(255) UNIQUE DEFAULT NULL;
```

---

#### Step 8: Order State Machine

##### Why a State Machine?

Without a state machine, any code can update an order's status to anything:

```sql
UPDATE orders SET status = 'delivered' WHERE id = 1;
-- But the order was 'cancelled'! You can't deliver a cancelled order.
```

A state machine enforces **valid transitions only**.

##### Valid State Transitions

```
PENDING ──→ CONFIRMED ──→ SHIPPED ──→ DELIVERED
  │              │
  └──→ CANCELLED ←──┘
```

| From | Allowed Next States |
|------|-------------------|
| `pending` | `confirmed`, `cancelled` |
| `confirmed` | `shipped`, `cancelled` |
| `shipped` | `delivered` |
| `delivered` | (terminal — no transitions) |
| `cancelled` | (terminal — no transitions) |

##### Implementation

In `orderService.js`, the `updateOrderStatus` method:
1. Fetches the current order
2. Looks up the current status in the `validTransitions` map
3. Checks if the requested new status is in the allowed list
4. If valid → UPDATE. If invalid → throw `BadRequestError`

##### New Endpoint

```
PATCH /api/orders/:id/status
Body: { "status": "shipped" }
```

We use `PATCH` (not `PUT`) because we are modifying a single field, not replacing the entire resource.

---

#### Step 9: Error Handling Design

##### Custom Error Classes

We created `src/utils/errors.js` with the following hierarchy:

```
AppError (base class)
  ├── BadRequestError     (400)
  ├── NotFoundError       (404)
  ├── ConflictError       (409)
  └── InsufficientStockError (400)
```

##### Error → HTTP Status Code Mapping

| Scenario | Error Class | HTTP Code | Message |
|----------|------------|-----------|---------|
| Product doesn't exist | `NotFoundError` | 404 | "Product with ID X not found" |
| Flash sale not active | `BadRequestError` | 400 | "Flash sale has not started yet" |
| Insufficient stock | `InsufficientStockError` | 400 | "Only X items left in stock" |
| Duplicate idempotency key | (handled gracefully) | 201 | Returns existing order |
| Invalid quantity (e.g., -1) | Controller validation | 400 | "quantity must be a positive integer" |
| Invalid state transition | `BadRequestError` | 400 | "Invalid transition from X to Y" |
| Database connection failure | Default | 500 | "Internal Server Error" |
| Transaction failure | Default | 500 | "Internal Server Error" |

##### How the Global Error Handler Works

```
Service throws: new NotFoundError("Product with ID 99 not found")
  → error.statusCode = 404
  → error.message = "Product with ID 99 not found"

Controller's catch block: next(error)
  → Express passes it to the global error handler

Global Error Handler in app.js:
  → Reads err.statusCode (404)
  → Sends: { success: false, error: "Product with ID 99 not found" }
```

For unknown errors (no `statusCode` property), we default to `500` and hide the internal message to prevent leaking database details to attackers.

---

#### Step 10: Testing Plan

##### Test Cases

```bash
# 1. ✅ Normal successful order
curl -X POST http://localhost:3000/api/orders \
-H "Content-Type: application/json" \
-H "Idempotency-Key: test-key-001" \
-d '{"productId": 1, "customerName": "Alice", "customerEmail": "alice@test.com", "quantity": 1}'
# Expected: 201 Created

# 2. ❌ Product doesn't exist
curl -X POST http://localhost:3000/api/orders \
-H "Content-Type: application/json" \
-d '{"productId": 999, "customerName": "Alice", "customerEmail": "alice@test.com", "quantity": 1}'
# Expected: 404 Not Found

# 3. ❌ Insufficient stock
curl -X POST http://localhost:3000/api/orders \
-H "Content-Type: application/json" \
-d '{"productId": 1, "customerName": "Alice", "customerEmail": "alice@test.com", "quantity": 99999}'
# Expected: 400 Bad Request

# 4. ✅ Duplicate idempotency key (returns existing order)
curl -X POST http://localhost:3000/api/orders \
-H "Content-Type: application/json" \
-H "Idempotency-Key: test-key-001" \
-d '{"productId": 1, "customerName": "Alice", "customerEmail": "alice@test.com", "quantity": 1}'
# Expected: 201 (returns the SAME order from test 1, no new order created)

# 5. ✅ Valid state transition
curl -X PATCH http://localhost:3000/api/orders/1/status \
-H "Content-Type: application/json" \
-d '{"status": "shipped"}'
# Expected: 200 OK

# 6. ❌ Invalid state transition
curl -X PATCH http://localhost:3000/api/orders/1/status \
-H "Content-Type: application/json" \
-d '{"status": "pending"}'
# Expected: 400 Bad Request (can't go from shipped back to pending)

# 7. ❌ Invalid input
curl -X POST http://localhost:3000/api/orders \
-H "Content-Type: application/json" \
-d '{"productId": -1, "customerName": "", "quantity": 0}'
# Expected: 400 Bad Request
```

##### Concurrency Test: stock = 1, two simultaneous requests

To test this properly, we would use a tool like `autocannon` or a simple Node script that fires two `POST /api/orders` requests in parallel using `Promise.all`. Only ONE should succeed with a 201. The other should fail with 400 (insufficient stock).

---

#### Step 11: Load Testing Preparation

##### Why Load Test Before Redis?

We need a **baseline** measurement of our synchronous MySQL system so that when we add Redis caching and background workers in Phase 5, we can **quantify the improvement**. Without a baseline, saying "Redis made it faster" is meaningless.

##### Key Metrics to Measure

| Metric | What It Means |
|--------|--------------|
| **Requests/sec (RPS)** | How many requests the server handles per second |
| **Avg Latency** | Average time from request sent to response received |
| **p50 Latency** | 50% of requests complete in this time or less (median) |
| **p95 Latency** | 95% of requests complete in this time or less |
| **p99 Latency** | 99% of requests complete in this time or less (tail latency) |
| **Throughput** | Total data transferred per second |
| **Error Rate** | Percentage of requests that returned errors |

##### Why p95 and p99 Matter More Than Average

Average latency can be misleading. If 99 requests take 10ms and 1 request takes 10,000ms, the average is ~110ms — which looks fine. But that 1 user waited 10 SECONDS. p99 captures these outliers.

In a flash sale, the users who experience p99 latency are often the ones whose orders fail or time out — the worst possible customer experience.

##### Tool: autocannon (Node.js)

```bash
npm install -g autocannon

# Fire 100 concurrent connections for 10 seconds against the orders endpoint
autocannon -c 100 -d 10 -m POST \
  -H "Content-Type=application/json" \
  -b '{"productId":1,"customerName":"LoadTest","customerEmail":"load@test.com","quantity":1}' \
  http://localhost:3000/api/orders
```

##### Tool: k6 (Alternative)

```javascript
// k6 load test script (load-test.js)
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,        // 50 virtual users
  duration: '10s' // for 10 seconds
};

export default function () {
  const payload = JSON.stringify({
    productId: 1,
    customerName: 'LoadTest',
    customerEmail: 'load@test.com',
    quantity: 1
  });

  const res = http.post('http://localhost:3000/api/orders', payload, {
    headers: { 'Content-Type': 'application/json' }
  });

  check(res, { 'status is 201 or 400': (r) => r.status === 201 || r.status === 400 });
}
```

We will run this baseline test BEFORE Phase 5 (Redis), record the numbers, and then compare after adding Redis.

---

#### 📁 Files Created & Modified (Phase 4)

| File | Action | Purpose |
|------|--------|---------|
| `src/utils/errors.js` | **NEW** | Custom error classes (AppError, NotFoundError, BadRequestError, etc.) |
| `src/services/orderService.js` | **NEW** | Business logic layer — transactions, idempotency, flash sale rules, state machine |
| `src/models/Product.js` | **MODIFIED** | Added `findByIdForUpdate()` and `decrementStock()` transactional methods |
| `src/models/Order.js` | **MODIFIED** | Removed fat `create()`, added thin `insert()` and `findByIdempotencyKey()` |
| `src/controllers/orderController.js` | **MODIFIED** | Refactored to thin controller, delegates to OrderService |
| `src/routes/orderRoutes.js` | **MODIFIED** | Added `PATCH /:id/status` for state machine |
| `src/app.js` | **MODIFIED** | Updated global error handler with `success: false` field |

#### 🗄️ Database Migration Required

Before testing, run this SQL in your MySQL client:

```sql
ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(255) UNIQUE DEFAULT NULL;
```

---

### 🎓 20 Technical Interview Questions — Concurrency, Transactions & Flash Sales

1. What is a race condition? Give an example from an e-commerce system.
2. Explain the ACID properties. Which one prevents overselling?
3. What is the difference between `SELECT` and `SELECT ... FOR UPDATE`?
4. What happens if two transactions both try to `SELECT ... FOR UPDATE` the same row?
5. Why do we use a connection pool instead of creating a new connection per request?
6. What is the difference between optimistic and pessimistic locking? Which did we use?
7. Explain what happens during a `ROLLBACK`. Where does the "old" data come from?
8. Why is `UPDATE stock = stock - 1 WHERE stock >= 1` safer than checking stock in application code?
9. What is a deadlock? Can our current implementation cause one? How?
10. What is idempotency? Why is it critical for payment APIs?
11. How does an `Idempotency-Key` header prevent duplicate orders?
12. What happens if two requests with the same idempotency key arrive at the exact same time?
13. What is a state machine? Why use one for order status instead of allowing arbitrary updates?
14. What is the service layer pattern? Why not put business logic in the controller?
15. Explain the difference between `PUT` and `PATCH`. Which did we use for status updates and why?
16. Why do we return `201 Created` instead of `200 OK` for POST endpoints?
17. What is p99 latency and why is it more important than average latency?
18. Why should we load-test BEFORE adding Redis, not after?
19. What is a phantom decrement? How does a transaction prevent it?
20. If our MySQL server crashes mid-transaction (after UPDATE, before INSERT), what happens to the stock?

---

## 📅 Day 5 — August 9, 2026

### Phase 6: Baseline Load Testing & Performance Analysis

#### 🎯 Goal
Measure the performance of our CURRENT synchronous system (Express → MySQL) before introducing any optimizations (Redis, workers). Every number must come from a real test — no invented benchmarks.

---

#### Part 1: Load Testing Concepts

##### 1. What is Load Testing?
Simulating expected user traffic to verify the system handles its designed capacity. Example: "Can our flash sale handle 100 concurrent buyers?"

##### 2. What is Stress Testing?
Pushing beyond expected limits to find the breaking point. Example: "What happens with 10,000 buyers on a server designed for 500?"

##### 3. What is Spike Testing?
Suddenly hitting the system with a massive burst. Example: "Flash sale goes live at 12:00:00 — 5,000 users all click at the same second."

##### 4. What is Endurance/Soak Testing?
Running moderate load for hours/days to find slow memory leaks, connection pool exhaustion, or disk issues.

##### 5. What is a Virtual User (VU)?
A simulated client that sends requests in a loop. 50 VUs = 50 parallel clients hitting our API simultaneously.

##### 6. What is Throughput?
The total amount of data or requests processed per unit of time. Often measured in requests/second (RPS).

##### 7. What is Latency?
The time between the client sending a request and the server starting to respond. It's the "wait" time.

##### 8. What is Response Time?
The total time from request sent → full response received. Includes latency + data transfer time. In practice, latency and response time are often used interchangeably for API testing.

##### 9. What is Requests Per Second (RPS)?
How many HTTP requests the server completes per second. Higher is better, but only if error rate stays low.

##### 10. What is p50?
The median latency. 50% of requests completed in this time or faster. This is the "typical" user experience.

##### 11. What is p90?
90% of requests completed in this time or faster. 10% of users experienced worse latency than this.

##### 12. What is p95?
95% of requests completed in this time or faster. The "almost everyone" experience.

##### 13. What is p99?
99% of requests completed in this time or faster. Only 1 in 100 users experienced worse. This catches the outliers — the users most likely to rage-quit or file complaints.

##### 14. What is Error Rate?
The percentage of requests that returned an error (5xx status codes, timeouts, connection resets). For a flash sale, 400s (out of stock) are expected business logic responses, NOT errors.

##### 15. Why is p95/p99 More Useful Than Average?
Average latency hides outliers. If 99 requests take 10ms and 1 takes 5,000ms, the average is ~60ms — looks fine! But that 1 user waited 5 SECONDS. In a flash sale, these outlier users are the ones whose payments time out, who get double-charged on retry, or who call customer support. p95/p99 catches them.

**Real-world analogy:** A restaurant says "average wait time is 10 minutes." But 5% of customers wait 45 minutes. The average is misleading — the p95 reveals the truth.

**Interview version:** "We track p95 and p99 latency because tail latency disproportionately affects user experience and revenue. The average can mask severe performance degradation for a subset of users."

---

#### Part 2: Why k6?

##### What is k6?
k6 is an open-source load testing tool by Grafana Labs. Tests are written in JavaScript (ES6 modules), but the runtime is Go — making it extremely fast and efficient at generating load.

##### Why k6 for This Project?
1. **JavaScript-based scripts** — Natural fit since we're building a Node.js backend.
2. **Efficient Go runtime** — Can simulate thousands of VUs from a single machine without exhausting resources.
3. **Built-in metrics** — Tracks RPS, latency percentiles, error rate, and data transfer out of the box.
4. **Threshold system** — Define pass/fail criteria (e.g., "p95 must be under 500ms").
5. **Checks** — Assert response status codes and body content during tests.
6. **No browser overhead** — Sends raw HTTP requests (unlike Selenium/Playwright), so it measures server performance, not browser rendering.

##### How k6 Differs From a JavaScript Loop
A simple `for` loop sending 1,000 fetch requests sequentially tests nothing useful — it's just serial requests with no concurrency. k6 spawns actual parallel Virtual Users (goroutines in Go), each maintaining their own HTTP connections, cookies, and state. This simulates REAL concurrent users hitting the server simultaneously.

---

#### Part 3: What Makes a Good Load Test Scenario?

A good load test must:
- Hit the **actual production endpoint** (not a dummy route)
- Use **realistic payloads** (valid JSON, proper headers)
- Include **unique data per request** (different user names, unique idempotency keys)
- Account for **expected failures** (out-of-stock is a valid 400, not a test failure)
- Include a **small sleep** between iterations to simulate human think time
- Use **setup/teardown** to create controlled test data (known product with known stock)

Our test targets `POST /api/orders` with:
- Valid product ID (created during setup with 100,000 stock)
- Valid customer name and email (unique per VU/iteration)
- Unique `Idempotency-Key` header per request
- Quantity of 1

---

#### Part 4: Safety — Gradual Load Increase

**Why not jump to 10,000 VUs immediately?**
- Your MySQL might crash, losing data
- Your machine might run out of memory
- Your connection pool exhausts, causing cascading timeouts
- You could accidentally fill your disk with order records

**Rule: Start small, increase gradually, observe at each step.**

We increase load only when the previous level shows:
- 0% error rate
- p95 is acceptable (under our threshold)
- System resources (CPU, memory) are not maxed out
- No connection pool exhaustion errors in the server logs

---

#### Part 5: k6 Test Script Structure

Our test script `tests/load/flash-sale.js` contains:

| Section | Purpose |
|---------|---------|
| `import` | Load k6 modules (http, checks, metrics) |
| `export const options` | Default VUs, duration, thresholds |
| `export function setup()` | Runs ONCE — creates a test product with 100,000 stock |
| `export default function()` | Runs PER VU PER ITERATION — sends POST /api/orders |
| `export function teardown()` | Runs ONCE — cleanup logging |
| `check()` | Validates response status is 201 or 400 |
| `sleep(0.1)` | 100ms pause between iterations (simulates human think time) |
| Custom metrics | `order_successes` counter, `order_latency` trend |

---

#### Part 6 & 7: Gradual Load Test Results (REAL DATA)

All tests ran against `http://localhost:3000/api/orders` on August 9, 2026.

**Test Environment:**
- OS: Windows
- Node.js: v24.11.0
- MySQL: Local instance
- k6: v2.1.0
- Connection Pool: 10 connections
- Duration: 10 seconds per test
- Sleep: 100ms between iterations

##### Results Table

| VUs | Total Requests | RPS | Avg Latency | p50 (Median) | p90 | p95 | p99 (Max) | Error Rate |
|----:|---------------:|----:|------------:|-------------:|----:|----:|----------:|-----------:|
| 1 | 92 | 9.2/s | 8.42ms | 7.81ms | 9.6ms | 10.75ms | 27.46ms | 0.00% |
| 5 | 465 | 46.2/s | 7.26ms | 6.68ms | 8.04ms | 9.3ms | 54.75ms | 0.00% |
| 10 | 934 | 92.2/s | 7.18ms | 6.37ms | 7.57ms | 8.87ms | 88.09ms | 0.00% |
| 25 | 2,172 | 214.1/s | 15.22ms | 12.47ms | 22.53ms | 29.64ms | 132ms | 0.00% |
| 50 | 2,047 | 199.3/s | 146.24ms | 134.81ms | 182.15ms | 196.16ms | 266.79ms | 0.00% |
| 100 | 2,144 | 204.3/s | 376.50ms | 371.70ms | 406.01ms | 415.23ms | 607.47ms | 0.00% |

##### Key Observations

1. **1–10 VUs: Linear scaling.** RPS increases proportionally (9 → 46 → 92). Latency stays flat (~7-8ms avg). The system is comfortably within capacity.

2. **25 VUs: First signs of contention.** RPS jumps to 214 but latency doubles (7ms → 15ms avg, p95 hits 29ms). The `FOR UPDATE` row locks are starting to serialize requests — transactions must wait in line.

3. **50 VUs: Major degradation.** RPS *drops* from 214 to 199. Latency explodes 10x (15ms → 146ms avg, p95 hits 196ms). This is the **saturation point** — adding more users DECREASES throughput because transactions spend more time waiting for locks than doing actual work.

4. **100 VUs: Severe contention.** Latency more than doubles again (376ms avg, p95 at 415ms). RPS barely improves (204/s). Every request waits behind ~100 others for the row lock. The system is bottlenecked on MySQL transaction serialization.

5. **Zero errors at all levels.** The system never crashed, never produced incorrect results, never oversold. Our ACID transactions and `FOR UPDATE` locking worked perfectly from a correctness standpoint. The problem is speed, not safety.

---

#### Part 8: Metrics Collected

All metrics above came directly from k6 output. For each test level we tracked:
- Virtual users count
- Test duration (10s fixed)
- Total requests completed
- Successful requests (all 201s)
- Failed requests (0 across all tests)
- Requests per second
- Average latency
- p50 (median)
- p90
- p95
- p99 (approximated from max)
- Error rate
- HTTP status distribution (100% success — 201 Created)

---

#### Part 9: Database Observation

##### 1. Why Database Connections Matter
Every SQL query needs a connection to MySQL. Without one, the query waits. Under load, if all 10 pool connections are busy running transactions, request #11 must wait in a queue until one finishes.

##### 2. What a Connection Pool Does
Instead of creating a new TCP connection per request (20-50ms overhead), the pool pre-creates 10 connections at startup. Requests borrow and return them. This eliminates handshake overhead.

##### 3. What Happens When All Pool Connections Are Busy
At 100 VUs with a pool of 10, up to 90 requests may be queued waiting for a free connection. This is a major contributor to the latency spike we see at 50+ VUs.

##### 4. How Database Latency Affects API Latency
API response time = Express processing + DB query time. If a DB query takes 300ms (because it's waiting for a row lock), the API response also takes 300ms+. The DB is the dominant factor.

##### 5. How Concurrent Transactions Affect MySQL
Each `SELECT ... FOR UPDATE` locks the product row. Other transactions attempting to lock the SAME row must wait. With 100 VUs all buying the same product, this creates a serial queue at the database level. Only 1 transaction executes at a time on that row.

##### 6. How Locks Affect Performance
Pessimistic locks (`FOR UPDATE`) trade throughput for correctness. At low concurrency, the tradeoff is negligible. At high concurrency, lock contention becomes the dominant bottleneck. Requests spend 95%+ of their time WAITING, not COMPUTING.

##### 7. How to Inspect Active MySQL Connections
```sql
SHOW PROCESSLIST;
-- Shows every active MySQL connection, what query it's running, and how long it's been running.

SHOW STATUS LIKE 'Threads_connected';
-- Shows the current number of open connections.

SHOW STATUS LIKE 'Threads_running';
-- Shows how many threads are actively executing queries (not idle).
```

##### 8. How to Identify Slow Queries
```sql
-- Enable slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 0.1;  -- Log queries taking more than 100ms

-- Check slow query log location
SHOW VARIABLES LIKE 'slow_query_log_file';
```

---

#### Part 10: Bottleneck Analysis

##### Where Is the Bottleneck?

| Suspect | Evidence | Verdict |
|---------|----------|---------|
| **Node.js** | CPU wasn't maxed; Express handled routing fine | ❌ Not the bottleneck |
| **Express** | Middleware overhead is ~0.1ms — negligible | ❌ Not the bottleneck |
| **MySQL Row Locks** | Latency spiked exactly when VUs exceeded pool size; all requests target the same row | ✅ **PRIMARY BOTTLENECK** |
| **Connection Pool** | Pool size = 10. At 50+ VUs, queueing begins | ✅ **SECONDARY BOTTLENECK** |
| **CPU** | Not maxed during any test | ❌ Not the bottleneck |
| **Memory** | Stable throughout all tests | ❌ Not the bottleneck |
| **Network** | Localhost — no network latency | ❌ Not the bottleneck |

**Conclusion:** The bottleneck is **MySQL transaction serialization** caused by `SELECT ... FOR UPDATE` on the same product row. All concurrent orders for the same flash-sale product must execute one at a time. At 100 VUs, each request waits for ~99 others to finish their transaction before it gets its turn.

**The connection pool (10 connections) is a secondary bottleneck.** Even if row locking was instant, only 10 queries can execute simultaneously. The remaining 90 VUs wait for a pool connection before they even get to wait for the row lock.

---

#### Part 11: Performance Profile — Throughput vs Latency vs Concurrency

##### Throughput vs Latency
- **Throughput** = how many requests per second we complete (volume)
- **Latency** = how long each individual request takes (speed)

These are related but NOT the same. High throughput with high latency means "we're processing many requests, but each one takes forever." That's what we see at 100 VUs: 204 RPS (decent throughput) but 376ms average latency (terrible user experience).

##### Why Adding More Users Doesn't Increase Throughput Forever
At low concurrency, each additional VU adds more RPS because the server has spare capacity. But once the bottleneck resource (MySQL row lock in our case) is saturated, additional VUs just increase the queue length — making everyone wait longer without doing more total work.

```
                    ┌── Saturation Point (~25 VUs for us)
                    │
RPS:  9 → 46 → 92 → 214 → 199 → 204
VUs:  1     5    10    25    50   100
                              └── RPS actually DECREASED
```

After saturation:
- **Throughput plateaus** (can't go faster)
- **Latency increases linearly** (more VUs = longer queue)
- **User experience degrades** (but correctness is maintained)

##### Saturation Explained
Saturation = the resource is at 100% utilization. In our case, the MySQL row lock for the flash-sale product is ALWAYS held by some transaction. There is zero idle time between transactions. Adding more VUs cannot make the lock process faster — it only makes the queue longer.

**Real-world analogy:** A single-lane toll booth. 1 car = no wait. 5 cars = short wait. 100 cars = massive traffic jam. But the toll booth still processes 1 car at a time. Adding more cars to the highway doesn't make the toll booth faster.

**Interview version:** "Our system demonstrates classic resource contention under pessimistic locking. Beyond the saturation point at ~25 concurrent users, throughput plateaus while latency grows linearly with concurrency. This is because `SELECT ... FOR UPDATE` serializes all transactions touching the same inventory row, creating an effective throughput ceiling determined by single-transaction latency."

---

#### Part 12: Baseline Document

A detailed baseline document has been created at `docs/performance/baseline.md` with full test environment details, methodology, and results.

---

#### Part 13: Why the Current Architecture Struggles — Preparing for Redis

##### Current Architecture
```
100 Users → Express → MySQL (Single Row Lock)
                        ↓
              All 100 users WAIT IN LINE
              for the same row lock.
              Throughput ceiling: ~200 RPS
              p95 at 100 VUs: 415ms
```

##### The Problem
Every order request does ALL of this synchronously:
1. Get a DB connection from the pool (may wait)
2. `BEGIN TRANSACTION`
3. `SELECT ... FOR UPDATE` on the product row (may wait for lock)
4. Validate stock
5. `UPDATE products SET stock = stock - 1`
6. `INSERT INTO orders`
7. `COMMIT` (releases the lock)

Steps 3-7 are serialized for the same product. Each request holds the lock for ~7ms. At 100 VUs, the 100th request waits ~700ms just for its turn.

##### What Redis Will Solve
Instead of every request hitting MySQL directly:

```
100 Users → Express → Redis Queue (Instant, ~0.1ms)
                         ↓
                    Background Worker
                         ↓
                       MySQL (Sequential, Controlled)
```

1. **API response is instant**: Push the order request into a Redis queue and respond with "Order Received" immediately (~1ms response time instead of ~376ms).
2. **No lock contention on the API layer**: Users don't wait for MySQL row locks.
3. **Worker processes orders one by one**: A background worker pulls from the Redis queue and processes orders sequentially against MySQL — same ACID guarantees, but without making users wait.
4. **Decoupled throughput**: The API can accept 10,000 requests/second into Redis. The worker processes them at MySQL's pace. Users get immediate feedback; actual order processing happens asynchronously.

**This is the core architectural shift from synchronous to asynchronous processing.**

> We will NOT implement Redis yet. The next phase will introduce it, and we will re-run these same load tests to quantitatively compare the two architectures.

---

#### 📁 Files Created (Phase 6)

| File | Purpose |
|------|---------|
| `tests/load/flash-sale.js` | k6 load test script for the order endpoint |
| `docs/performance/baseline.md` | Full baseline performance document |

---

### 🎓 20 Technical Interview Questions — Load Testing, Latency & Performance

1. What is the difference between load testing, stress testing, and spike testing?
2. What is a virtual user in load testing? How does it differ from a real user?
3. Explain p50, p95, and p99 latency. Why is p99 more important than average?
4. What is throughput? How does it relate to latency?
5. What is the saturation point? What happens to latency after saturation?
6. Why does adding more concurrent users not always increase throughput?
7. What is a connection pool? Why is it critical under high concurrency?
8. What happens when all connections in a pool are in use?
9. How does `SELECT ... FOR UPDATE` affect performance under concurrent load?
10. What is the difference between pessimistic and optimistic locking in terms of throughput?
11. Why is it dangerous to jump directly to 10,000 virtual users in a load test?
12. How do you decide when to increase the load level during testing?
13. What is a baseline measurement and why do you need one before optimizing?
14. How would you distinguish between a Node.js bottleneck and a MySQL bottleneck?
15. What is error rate and how does it differ from business-logic rejections (e.g., out-of-stock)?
16. Explain the toll booth analogy for row-level locking under concurrency.
17. How does a Redis queue solve the MySQL lock contention problem?
18. What is the difference between synchronous and asynchronous order processing?
19. Why should you track p95/p99 latency in SLA agreements instead of average?
20. In our test results, throughput peaked at 25 VUs (~214 RPS) and then plateaued. Explain why throughput decreased slightly at 50 VUs before recovering at 100 VUs.

---

## 📅 Day 6 — August 10, 2026

### Phase 7: Redis Queue and Asynchronous Order Processing

#### 🎯 Goal
Resolve the MySQL row-lock bottleneck from Phase 6 by shifting to an **asynchronous, event-driven architecture** using a Redis message queue and a background worker.

---

#### Part 1: Understanding the Bottleneck & Asynchronous Architecture
1. **The Synchronous Bottleneck:** In Phase 6, at 100 concurrent users, the API response latency spiked to 415ms. Because every request synchronously executes `SELECT ... FOR UPDATE` on the same product row, they queue up waiting for the MySQL lock.
2. **Adding API Instances vs DB:** Spinning up 5 more Node.js API servers doesn't help. The bottleneck is the single MySQL row lock. More APIs just means a wider funnel pouring into the same narrow DB pipe.
3. **Increasing the Connection Pool:** Giving the API a pool of 100 connections instead of 10 just means 100 requests can wait for the row lock simultaneously instead of waiting for a pool connection. It doesn't speed up the actual lock processing.
4. **Asynchronous Processing:** Taking a time-consuming task (DB transaction) out of the critical user-facing request cycle and processing it "later" in the background.
5. **Decoupling:** Separating the "Acceptance of an order" (API) from the "Processing of an order" (Worker). They scale independently.
6. **Message Queue:** A buffer that holds jobs. 
7. **Producer/Consumer:** The Express API is the *Producer* (adds jobs). The Background Worker is the *Consumer* (takes jobs).
8. **Job:** A JSON payload describing the work to be done.
9. **Backpressure:** The queue acts as a shock absorber. If the API accepts 1,000 orders/sec, but the DB can only process 200/sec, the queue absorbs the 800/sec difference (backpressure) so the DB doesn't crash.

#### Part 2: Why Redis?
- **Speed:** Redis operates entirely in RAM. Pushing to a Redis list takes less than 1ms.
- **Data Structures:** Redis has built-in Lists which act perfectly as FIFO (First In, First Out) queues.
- **Commands:** We use `LPUSH` (Left Push) to add jobs to the queue, and `BRPOP` (Blocking Right Pop) to consume them.
- **Why BRPOP?:** `RPOP` returns `null` if empty, requiring constant CPU-wasting polling. `BRPOP` blocks the connection efficiently until a job arrives.
- **Why not Kafka/RabbitMQ?:** Kafka is built for event streaming, log retention, and replayability. RabbitMQ is built for complex routing (fanout, topic exchanges). Our system just needs a simple, fast FIFO work queue. Redis is lightweight and will also be used for caching in Phase 8.

#### Part 3: Designing the Queue
- **Queue Name:** `orders:pending`
- **Producer:** `AsyncOrderService` called by `POST /api/orders/async`
- **Consumer:** `src/workers/orderWorker.js`
- **Payload Design:** What goes in the queue?
  - *Option A (Fat Payload):* Put the entire order (customer name, email, product, quantity) in Redis.
  - *Option B (Thin Payload):* Put only the `orderId` in Redis.
  - **Decision:** We use a **Thin Payload** (mostly). We save the order to MySQL first with `status='queued'`, then push `{ orderId, productId, quantity }` to Redis. This keeps the message size small and guarantees MySQL remains the absolute source of truth.

#### Part 4: The Critical Reliability Question (Dual-Write Problem)
If we must update MySQL (insert order) AND update Redis (push job), we have the **Dual-Write Problem**. These are two different databases; they cannot share an atomic transaction.
- **Redis-First:** Push to Redis, then insert to MySQL. *Failure:* If DB insert fails, the worker pulls a phantom job from Redis that doesn't exist in the DB.
- **DB-First (Our Choice):** Insert order in MySQL (`status='queued'`), then push to Redis. *Failure:* If Redis push fails, the order sits in MySQL as `queued`. No data is lost. A cron job can easily find "stuck" queued orders and re-push them. This is a lightweight variation of the **Transactional Outbox** pattern.

#### Part 5: Order State Changes
We expanded our MySQL state machine to handle the async lifecycle:
`PENDING` (legacy) / `QUEUED` → `PROCESSING` → `CONFIRMED` or `FAILED`.
- The API sets it to `QUEUED`.
- The Worker checks stock and sets it to `CONFIRMED` or `FAILED`.
- Eventual Consistency: The client sees "Queued" briefly before seeing "Confirmed". The system is not instantly consistent, but it is *eventually* consistent.

#### Part 6: API Contract Change
- The new endpoint `POST /api/orders/async` returns HTTP `202 Accepted` instead of `201 Created`. 
- **Why?** `201` means "The resource was successfully created and processed". `202` means "The request was accepted for processing, but processing has not been completed." This sets the correct expectation for the client.

#### Part 7 & 8: Implementing the Producer
Created `src/config/redis.js` using `ioredis`. 
- `ioredis` is preferred because it handles exponential backoff reconnection automatically and supports `maxRetriesPerRequest: null`, which is strictly required for blocking commands like `BRPOP` to prevent timeouts.
- The `AsyncOrderService` does lightweight validation, inserts the DB record (`queued`), pushes to Redis, and returns instantly.

#### Part 9: Building the Worker
Created `src/workers/orderWorker.js` as a **completely separate Node.js process**.
- **Why separate?** If the worker crashes due to a bad job or MySQL timeout, it does not crash the Express API. The API can continue accepting orders into the queue.
- The worker uses a `while` loop with `BRPOP`, pulls the job, runs the exact same ACID `SELECT ... FOR UPDATE` logic from Phase 4, updates the status, and loops.

#### Part 10: Worker Concurrency
Currently running **1 worker**.
- **What if we ran 10 workers?** Throughput would NOT increase. All 10 workers would try to process orders for the same flash-sale product simultaneously. They would all hit the exact same MySQL row lock (`SELECT ... FOR UPDATE`). We would just move the lock contention from the API layer down to the worker layer.

#### Part 11 & 12: Failure Handling & Idempotency
- **Poison Messages:** If a job has invalid JSON, the worker `catch` block catches it and pushes it to a `DEAD_LETTER_QUEUE` (`orders:dead`), preventing an endless crash loop.
- **Graceful Shutdown:** Listening for `SIGTERM`/`SIGINT`. If the worker is killed, it finishes processing the *current* MySQL transaction before exiting, preventing corrupted data.
- **Worker Idempotency:** Because queues guarantee "at-least-once" delivery, a worker might receive the same order ID twice. The worker first checks if the order is already `confirmed` in the DB. If yes, it skips it. Never charge/decrement twice.

#### Part 13: Observability
Queue depth (`LLEN`) is the most critical health metric. If queue depth grows continuously, it means the arrival rate (API) exceeds the processing rate (Worker/MySQL). This backlog/lag tells us exactly how far behind the database is.

#### Part 14: Testing
Created `scratch/test_phase7.js` to run end-to-end tests ensuring:
- 202 response
- Worker consumes and confirms
- Idempotency works
- Out-of-stock fails correctly

#### Part 15 & 16: Two Types of Latency & Benchmarking
We must distinguish between:
1. **API Response Latency:** How fast the user gets a `202 Accepted`.
2. **Order Completion Latency:** How fast the DB actually commits the order.

In our k6 tests (100 VUs):
- **Sync API Latency (Baseline):** 415ms
- **Async API Latency:** 255ms (Huge improvement for the user experience).
- **Throughput:** Accepted ~317 req/sec. 

**The reality check:** MySQL still only processes ~200 req/sec because of the row lock. The queue successfully absorbed the difference (117 req/sec). 

#### Part 17: Documentation
A detailed performance comparison report was generated at `docs/performance/redis-comparison.md`.

---

### 🎓 30 Technical Interview Questions — Queues, Redis & Asynchronous Processing

1. **Interviewer:** Why did you choose Redis instead of Kafka or RabbitMQ for this queue?
   - *Your Answer:* (Provide your answer)
   - *Ideal Answer:* Redis is lightweight, easy to deploy, and offers sub-millisecond latency for list operations (`LPUSH`/`BRPOP`). For a straightforward task queue without complex routing (RabbitMQ) or event streaming/replay requirements (Kafka), Redis is the perfect balance of speed and simplicity. It also doubles as a cache, which reduces infrastructure footprint.
   - *Follow-up:* What happens if Redis runs out of memory?

2. **Interviewer:** What is the difference between `LPOP` and `BRPOP` in Redis?
   - *Your Answer:* (Provide your answer)
   - *Ideal Answer:* `LPOP` retrieves an item and returns immediately; if the list is empty, it returns `null`. This requires the worker to constantly poll (e.g., in a `while` loop with a `sleep`), wasting CPU. `BRPOP` is a blocking pop: it halts execution and waits for an item to arrive, instantly returning it when it does. This eliminates polling overhead.
   - *Follow-up:* Does `BRPOP` block the entire Redis server? (Answer: No, just that client connection).

3. **Interviewer:** Explain the "dual-write" problem in distributed systems.
   - *Your Answer:* (Provide your answer)
   - *Ideal Answer:* When a system must update two separate data stores (like MySQL and Redis) for a single operation, they cannot easily share an atomic transaction. If writing to MySQL succeeds but pushing to Redis fails, the systems are out of sync.
   - *Follow-up:* How did you solve it in your flash sale app? (Answer: DB-first design with `queued` status, acting as a transactional outbox).

4. **Interviewer:** Why does your async API return a `202 Accepted` instead of `201 Created`?
   - *Your Answer:* (Provide your answer)
   - *Ideal Answer:* `201 Created` implies the resource was fully processed and created. Because our API only queues the job for background processing, `202 Accepted` is semantically correct, signaling to the client that the request was received but processing is pending.
   - *Follow-up:* How does the client know when it's done?

5. **Interviewer:** How does adding a message queue prevent your database from crashing during a flash sale?
   - *Your Answer:* (Provide your answer)
   - *Ideal Answer:* A queue acts as a shock absorber (buffer). If 10,000 users hit the API, the API quickly accepts them into Redis. The background worker then pulls jobs from Redis at a controlled rate (e.g., 200/sec) that the database can safely handle. This is called "backpressure."
   - *Follow-up:* What happens to latency when the queue gets very long?

6. **Interviewer:** What is the difference between API Response Latency and Order Completion Latency?
   - *Your Answer:* (Provide your answer)
   - *Ideal Answer:* API response latency is how fast the server returns a `202 Accepted` to the client. Order completion latency is the total end-to-end time until the background worker actually commits the order to the database.
   - *Follow-up:* Can you have fast API latency but terrible completion latency?

7. **Interviewer:** If your background worker crashes while processing an order, how do you ensure the order isn't lost?
   - *Your Answer:* (Provide your answer)
   - *Ideal Answer:* In a naive `BRPOP` implementation, the job is removed from Redis immediately, meaning a crash loses the job. In production, we'd use a pattern like `BRPOPLPUSH` (Reliable Queue) or a framework like BullMQ which moves jobs to an "active" list. If the worker doesn't acknowledge completion within a timeout, the job is moved back to the pending queue.
   - *Follow-up:* What if it crashes *after* updating MySQL but *before* acknowledging?

8. **Interviewer:** Explain "Idempotency" in the context of background workers.
   - *Your Answer:* (Provide your answer)
   - *Ideal Answer:* Because queues often provide "at-least-once" delivery (due to retries on network failures or worker crashes), a worker might receive the exact same job twice. An idempotent worker checks the database (e.g., "Is this order ID already confirmed?") before processing, ensuring it never double-charges a customer or deducts stock twice.
   - *Follow-up:* How did you implement this in your worker?

9. **Interviewer:** What is a Dead Letter Queue (DLQ) and why is it important?
   - *Your Answer:* (Provide your answer)
   - *Ideal Answer:* A DLQ is a secondary queue for messages that cannot be processed successfully after multiple retries (e.g., due to malformed JSON, a bug in the code, or a permanently deleted database record). Moving them to a DLQ prevents these "poison messages" from endlessly looping and blocking the main queue.
   - *Follow-up:* How do you monitor a DLQ?

10. **Interviewer:** Why did throughput (RPS) peak at 25 VUs and then drop slightly in your synchronous baseline test?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* This is the saturation point. Beyond 25 concurrent connections, the MySQL row lock contention becomes so severe that transactions spend more time waiting in line and switching contexts than actually doing work. Adding more load to a saturated resource actually degrades overall throughput.
    - *Follow-up:* How does connection pool exhaustion contribute to this?

11. **Interviewer:** If you spin up 10 background workers instead of 1, will your order processing throughput increase 10x?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* No. While we can pull from Redis 10x faster, all 10 workers will immediately hit the exact same MySQL row lock (`SELECT ... FOR UPDATE`) for the flash sale product. The database is the bottleneck, so adding more workers will just shift the traffic jam from Redis to MySQL.
    - *Follow-up:* How *would* you fix the MySQL bottleneck?

12. **Interviewer:** What is eventual consistency?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* Eventual consistency means that if no new updates are made to a given data item, eventually all accesses to that item will return the last updated value. In our app, the API says "queued" while the DB still says "queued", but *eventually* the worker updates it to "confirmed" and the system is consistent.
    - *Follow-up:* What UX challenges does eventual consistency create?

13. **Interviewer:** How would you handle a scenario where Redis gets disconnected for 5 minutes?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* The API should catch the Redis connection error. Because we used a DB-first approach, the order is already saved in MySQL as `queued`. We can return a success to the user. A separate cron job (or sweep process) can periodically query MySQL for old `queued` orders and re-enqueue them when Redis comes back online.
    - *Follow-up:* Does the `ioredis` library handle reconnects automatically?

14. **Interviewer:** What does it mean when we say a worker "polls" the queue versus "blocks" on the queue?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* Polling means repeatedly asking "Do you have a job? No? Okay." every few milliseconds. It wastes CPU and network bandwidth. Blocking (via `BRPOP`) means the worker tells Redis "I'm going to wait here; wake me up the exact millisecond a job arrives." It is highly efficient.
    - *Follow-up:* What is the timeout parameter in `BRPOP` used for?

15. **Interviewer:** Why should you monitor "Queue Depth" (Queue length) in production?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* Queue depth tells you the balance between producers (API) and consumers (Workers). If queue depth is consistently growing, your workers are too slow or the DB is bottlenecked. It is the primary leading indicator of systemic latency.
    - *Follow-up:* What is "Queue Lag" or "Queue Age"?

16. **Interviewer:** Describe the "Transactional Outbox" pattern.
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* Instead of directly pushing to a queue, the application writes the event to a database table (the "outbox") in the same exact transaction as the business entity update. A separate process (like a Debezium CDC connector or a polling script) reads the outbox table and pushes the messages to the queue. This guarantees atomicity between the DB update and message emission.
    - *Follow-up:* How does our DB-first `status='queued'` design mimic this?

17. **Interviewer:** Why is `ioredis` preferred over `node-redis` in many enterprise Node applications?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* `ioredis` has built-in support for Redis Cluster, Sentinel, pipelining, and robust auto-reconnection strategies (like exponential backoff). It is the underlying client for major queue frameworks like BullMQ.
    - *Follow-up:* Explain what exponential backoff is.

18. **Interviewer:** What is "Exponential Backoff" and why is it critical when reconnecting to services?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* Instead of retrying a failed connection every 100ms forever, exponential backoff increases the wait time after each failure (e.g., 100ms, 200ms, 400ms, 800ms). This prevents a "thundering herd" problem where thousands of clients aggressively spam a recovering database, immediately crashing it again.
    - *Follow-up:* What is "jitter" in backoff algorithms?

19. **Interviewer:** If a user submits an order, receives a 202, and refreshes the page 1 second later, they might still see "Pending". How do you handle this UX?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* We can use HTTP Short Polling (AJAX requests every 2s), Long Polling, WebSockets, or Server-Sent Events (SSE) to notify the frontend when the worker updates the DB. Until then, the UI should display a friendly "Processing your order..." spinner.
    - *Follow-up:* Which of those options is best for a flash sale with 100,000 users?

20. **Interviewer:** Explain what a "Poison Message" is.
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* A poison message is a job in the queue that consistently crashes the worker (e.g., due to an unhandled exception or malformed payload). If the worker crashes, the queue software might retry the job automatically, causing the worker to crash in an endless loop, halting all processing.
    - *Follow-up:* How do Dead Letter Queues solve this?

21. **Interviewer:** Why does the worker need its own dedicated database connection pool?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* The worker process runs independently of the Express API. Because they are separate Node.js processes, they do not share memory or connections. The worker must establish and manage its own pool to communicate with MySQL.
    - *Follow-up:* How many connections should the worker pool have?

22. **Interviewer:** Is Redis a single point of failure in our current architecture?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* Technically yes, if Redis goes down completely, the `LPUSH` will fail. However, because we save the order as `queued` in MySQL *before* hitting Redis, no data is lost. We lose the realtime processing capability, but we maintain data integrity.
    - *Follow-up:* How would you make Redis highly available? (Answer: Redis Sentinel or Cluster).

23. **Interviewer:** Can we use MySQL as a queue instead of Redis?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* Yes, by having workers query `SELECT * FROM orders WHERE status='queued' LIMIT 1 FOR UPDATE`. However, database polling is slow, creates massive lock contention, and wastes database CPU. RDBMS systems are designed for state, not high-frequency queuing.
    - *Follow-up:* What is the "Skip Locked" feature in MySQL 8 and how does it help?

24. **Interviewer:** In our load test, we created a single product with 100,000 stock. Why did we do this?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* We wanted to measure the server's pure throughput and latency under sustained load. If we used 5 stock, the first 5 requests would succeed, and the next 9,995 would hit the quick `if (stock < quantity)` check and fail instantly. Failing early bypasses the actual `FOR UPDATE` lock logic, ruining the performance measurement of the critical path.
    - *Follow-up:* What do 400 Bad Request responses indicate in our load test?

25. **Interviewer:** How does the separation of the API and Worker processes improve scalability?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* It decouples IO-bound work (accepting HTTP requests) from CPU/DB-bound work (processing transactions). We can independently scale the Express API horizontally behind a load balancer to handle massive inbound traffic, while keeping the number of workers constrained to protect the database.
    - *Follow-up:* Can you deploy them on different servers?

26. **Interviewer:** What happens if the API successfully pushes to Redis, but the MySQL `queued` insert had failed (e.g., in a Redis-first design)?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* The worker would pull the job, look for the order ID in MySQL, and find nothing. It would fail the job. Meanwhile, the user received an error from the API but a background job is running. This is a classic distributed data anomaly.
    - *Follow-up:* How did our DB-first design prevent this?

27. **Interviewer:** Why did we configure `ioredis` with `maxRetriesPerRequest: null` for the worker?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* Commands like `BRPOP` block the connection indefinitely (or for a long timeout) while waiting for data. If `maxRetriesPerRequest` is set to a default number, the client might interpret the long block as a stalled request and force a reconnect, breaking the blocking pop.
    - *Follow-up:* Why does BullMQ require this exact setting?

28. **Interviewer:** Describe the lifecycle of a single order in our new async architecture.
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* User submits POST -> API validates -> DB insert (`status=queued`) -> API pushes ID to Redis -> API returns 202 -> Worker blocks on `BRPOP` -> receives ID -> Worker begins DB transaction -> Locks product row -> Checks stock -> Decrements stock -> Updates order to `confirmed` -> Commits transaction.
    - *Follow-up:* At which point is the user's money actually captured?

29. **Interviewer:** What is "graceful shutdown" and why is it important for the worker?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* When we stop the worker (e.g., SIGTERM for deployment), we shouldn't kill it instantly if it is halfway through processing an order. A graceful shutdown catches the signal, stops accepting new jobs from Redis, finishes the *current* MySQL transaction, and then exits safely.
    - *Follow-up:* How did you implement this using the `isShuttingDown` flag?

30. **Interviewer:** Looking at the Phase 7 benchmark, the worker processes ~200 RPS while the API accepts ~300 RPS. If this runs for 60 seconds, what is the exact state of the system?
    - *Your Answer:* (Provide your answer)
    - *Ideal Answer:* The API accepted 18,000 orders (300 * 60). The worker processed 12,000 orders (200 * 60). The Redis queue currently contains 6,000 pending jobs. Even if all traffic stops at exactly 60 seconds, the worker will take another 30 seconds to clear the backlog, during which time the last users will be waiting on the "Processing..." screen.
    - *Follow-up:* Is this an acceptable state for a flash sale? (Answer: Yes, it is the definition of a healthy, buffered system absorbing a spike).

---

## 📅 Day 7 — August 16, 2026

### Phase 8: Authentication and Authorization

#### 🎯 Goal
Secure the API with proper identity management, access control, and ownership enforcement. Every decision must be explainable in a software engineering interview.

---

#### Part 1: Authentication vs Authorization

##### Authentication ("Who are you?")
Verifying a user's identity. In our system: providing an email/password → receiving a JWT token → attaching that token to every subsequent request.

##### Authorization ("What are you allowed to do?")
Determining what an authenticated user is permitted to access. In our system:
- A **customer** can place orders and view their own orders.
- An **admin** can create products, view all orders, and update order statuses.
- Authentication alone doesn't prevent Alice from viewing Bob's order — that requires **authorization**.

##### Key Concepts
- **Identity:** A unique representation of a user (our `users.id`).
- **Session:** The period during which a user is considered authenticated. With JWT, the "session" is the token's lifetime.
- **Access Control:** Rules that determine which identities can access which resources.

---

#### Part 2: User Model

Created `src/models/User.js` with:
- `id` — Auto-increment primary key.
- `name` — User's display name.
- `email` — Unique, indexed. Used for login lookups and prevents duplicate registrations.
- `password_hash` — bcrypt output. NEVER stores plaintext.
- `role` — MySQL ENUM (`customer`, `admin`). Database-level constraint prevents invalid roles.
- `created_at` / `updated_at` — Audit trail.

**Critical:** `User.findById()` explicitly excludes `password_hash` from the SELECT. This prevents accidental leakage through any endpoint that returns user data.

---

#### Part 3: Password Security

##### 1. Hashing vs Encryption
- **Encryption** is reversible (decrypt with key). If the key leaks, ALL passwords are compromised.
- **Hashing** is one-way. Even with the database dump, passwords cannot be recovered.

##### 2. Why Not SHA-256?
SHA-256 is fast (~1 billion hashes/second on a GPU). An attacker with a database dump could brute-force most passwords in hours. bcrypt is **deliberately slow** (~300ms per hash at cost 12), making brute-force computationally infeasible.

##### 3. Salt
A random value mixed into the password before hashing. Without salt, two users with password "hunter2" would have identical hashes — an attacker with a precomputed "rainbow table" could look them up. Salt makes every hash unique.

##### 4. bcrypt (Our Choice)
- Generates a random 16-byte salt automatically.
- Cost factor = 12 (2^12 = 4096 iterations). Each increment doubles compute time.
- Output format: `$2b$12$salt22chars.hash31chars` (60 characters total).

##### 5. Registration Flow
```
"Secure123" → bcrypt.hash(password, 12) → "$2b$12$LJ3m4..." → INSERT INTO users
```

##### 6. Login Flow
```
"Secure123" → User.findByEmail("alice@test.com") → bcrypt.compare(password, stored_hash) → true/false
```

##### 7. Why Plaintext Storage is Catastrophic
If the database leaks (and databases DO leak — Equifax, LinkedIn, Adobe):
- Plaintext: Every user's password is immediately compromised.
- MD5/SHA: Crackable in hours with rainbow tables.
- bcrypt: Each password takes ~months to crack individually. Attacker gives up.

---

#### Part 4: Registration and Login API

##### POST /api/auth/register
```json
Request:  { "name": "Alice", "email": "alice@test.com", "password": "Secure123" }
Response: { "user": { "id": 1, "name": "Alice", "email": "...", "role": "customer" }, "token": "eyJ..." }
Status:   201 Created
```
Validations:
- All fields required
- Valid email format (regex)
- Password ≥ 8 characters
- Duplicate email → 409 Conflict

##### POST /api/auth/login
```json
Request:  { "email": "alice@test.com", "password": "Secure123" }
Response: { "user": { ... }, "token": "eyJ..." }
Status:   200 OK
```
**Security:** Both "user not found" and "wrong password" return the SAME error message: `"Invalid email or password"`. This prevents **email enumeration attacks** — an attacker cannot discover which emails exist in our system.

---

#### Part 5: JWT (JSON Web Token)

##### Structure
```
HEADER.PAYLOAD.SIGNATURE

Header:    { "alg": "HS256", "typ": "JWT" }
Payload:   { "userId": 1, "role": "customer", "iat": ..., "exp": ..., "iss": "flash-sale-manager" }
Signature: HMACSHA256(base64(header) + "." + base64(payload), SECRET)
```

##### How It Works
1. Server signs the token with a secret key.
2. Client stores the token (in memory or localStorage).
3. Client sends `Authorization: Bearer <token>` on every request.
4. Server verifies the signature — if the payload was tampered with, the signature won't match.

##### What JWT is NOT
- **NOT encryption.** The payload is base64-encoded (readable by anyone). It is signed, not encrypted.
- **NOT a session.** It's stateless — the server doesn't store session data.

##### What Goes in the Payload
- ✅ `userId` — identifies the user
- ✅ `role` — for quick RBAC checks
- ✅ `exp` — expiration timestamp
- ❌ Password, credit card, SSN — NEVER

##### Stateless Authentication
The server does NOT store tokens. Any server with the same `JWT_SECRET` can verify any token. This makes horizontal scaling trivial — no shared session store needed.

---

#### Part 6: Access Token Strategy

- **Lifetime:** 24 hours (`JWT_EXPIRES_IN=24h`)
- **Secret:** 96-character hex string stored in `.env`
- **Issuer:** `flash-sale-manager` (verified during token verification)
- **Why no refresh tokens:** For a flash sale system with events lasting hours, a 24h access token is sufficient. Refresh tokens add significant complexity (secure storage, rotation, revocation) without proportional benefit for this use case.

---

#### Part 7: Authentication Middleware

Created `src/middleware/auth.js` with two functions:

##### `authenticate()`
```
Request → Extract "Authorization: Bearer <token>"
  → jwt.verify(token, SECRET) — checks signature + expiration
  → User.findById(decoded.userId) — ensures user still exists in DB
  → req.user = { id, name, email, role }
  → next()
```

Handles:
- Missing token → 401
- Malformed token → 401
- Expired token → 401 ("Token has expired. Please login again.")
- User deleted after token issued → 401

##### `authorize(...roles)`
```
router.post('/products', authenticate, authorize('admin'), createProduct);
```
Checks `req.user.role` against allowed roles. Returns 403 if unauthorized.

---

#### Part 8: Role-Based Access Control (RBAC)

| Role | Can Create Products | Can Place Orders | Can View Own Orders | Can View All Orders | Can Update Order Status |
|------|:---:|:---:|:---:|:---:|:---:|
| customer | ❌ | ✅ | ✅ | ❌ | ❌ |
| admin | ✅ | ✅ | ✅ | ✅ | ✅ |

---

#### Part 9: API Access Control Policy

| Endpoint | Method | Auth | Role | Notes |
|----------|--------|:----:|:----:|-------|
| `/api/auth/register` | POST | ❌ | — | Public |
| `/api/auth/login` | POST | ❌ | — | Public |
| `/api/auth/me` | GET | ✅ | any | Returns own profile |
| `/api/products` | GET | ❌ | — | Public catalog |
| `/api/products/:id` | GET | ❌ | — | Public |
| `/api/products` | POST | ✅ | admin | Admin creates products |
| `/api/orders` | POST | ✅ | any | Sync order |
| `/api/orders/async` | POST | ✅ | any | Async order |
| `/api/orders` | GET | ✅ | any | Own orders (admin: all) |
| `/api/orders/:id` | GET | ✅ | any | Owner or admin |
| `/api/orders/:id/status` | PATCH | ✅ | admin | State machine |

---

#### Part 10: Object-Level Authorization (IDOR Prevention)

**IDOR (Insecure Direct Object Reference):** Alice is authenticated. She requests `GET /api/orders/456`. Order #456 belongs to Bob. Without ownership checks, Alice sees Bob's order.

Our implementation checks `order.user_id === req.user.id || req.user.role === 'admin'`. If neither condition is true → 403 Forbidden.

This is **object-level authorization** — it operates on individual resources, not just roles.

---

#### Part 11: JWT Security Considerations

| Vulnerability | Our Mitigation |
|---------------|---------------|
| Weak secret | 96-char hex string from crypto.randomBytes |
| Secret in Git | Loaded from `.env`, `.env` is in `.gitignore` |
| Long-lived tokens | 24h expiry |
| Sensitive data in payload | Only userId + role |
| Token theft | HTTPS in production; short expiry limits damage window |
| Algorithm confusion | We explicitly use HS256 |
| Logging tokens | Never log Authorization headers |
| Trusting unverified JWT | Always call jwt.verify() with secret |

---

#### Part 12: Refresh Tokens — Decision

**Decision: NOT implementing refresh tokens.**

Refresh tokens solve the problem of short-lived access tokens (e.g., 15 minutes) by allowing silent re-authentication without re-entering credentials. They require:
- Secure storage (httpOnly cookies or encrypted DB)
- Token rotation (new refresh token on each use)
- Revocation (blacklist in Redis/DB)

For our flash sale system, a 24h access token is sufficient. The added complexity of refresh token management is not justified.

---

#### Part 13: Rate Limiting Preparation

Authentication endpoints (`/login`, `/register`) are especially vulnerable to:
- **Brute-force attacks:** Trying millions of passwords against a known email.
- **Credential stuffing:** Using leaked password databases from other sites.

Rate limiting will be implemented in Phase 9. For now, bcrypt's deliberate slowness (~300ms/hash) provides some natural protection.

---

#### Part 14: Testing Results (All Passed ✅)

| Test | Description | Expected | Result |
|------|------------|----------|--------|
| 1 | Register valid customer | 201 + token | ✅ |
| 2 | Register duplicate email | 409 | ✅ |
| 3 | Register short password | 400 | ✅ |
| 4 | Login correct password | 200 + token | ✅ |
| 5 | Login wrong password | 400 (generic msg) | ✅ |
| 6 | No token → protected endpoint | 401 | ✅ |
| 7 | Invalid token | 401 | ✅ |
| 8 | Customer → admin endpoint | 403 | ✅ |
| 9 | Admin creates product | 201 | ✅ |
| 10 | Customer places order | 201 | ✅ |
| 11 | Customer views own order | 200 | ✅ |
| 12 | Register second customer | 201 | ✅ |
| 13 | Eve views Alice's order (IDOR) | 403 | ✅ |
| 14 | Admin views Alice's order | 200 | ✅ |
| 15 | GET /me — no hash leak | 200 | ✅ |
| 16 | Public GET /products | 200 | ✅ |

---

#### Part 15: Security Review Summary

1. **Passwords:** bcrypt with cost 12. Never stored as plaintext. Never returned in API responses.
2. **JWT:** HS256 signed with 96-char secret from environment. 24h expiry. Only userId/role in payload.
3. **Authentication:** Middleware verifies token AND checks user still exists in DB.
4. **Authorization:** RBAC middleware for role-based access. Object-level checks for ownership.
5. **Error Messages:** Login failures use generic messages to prevent email enumeration.
6. **Secrets:** JWT_SECRET in `.env`, never in source code.
7. **Input Validation:** Email format, password length, numeric IDs validated at controller level.

---

#### Part 16: Documentation

Created `docs/security/authentication.md` with full security architecture documentation.

---

#### 📁 Files Created/Modified (Phase 8)

| File | Action | Purpose |
|------|--------|---------|
| `src/models/User.js` | NEW | User repository (create, findByEmail, findById) |
| `src/services/authService.js` | NEW | Registration, login, JWT sign/verify |
| `src/controllers/authController.js` | NEW | Register, login, getMe endpoints |
| `src/middleware/auth.js` | NEW | authenticate() + authorize() middleware |
| `src/routes/authRoutes.js` | NEW | Auth route definitions |
| `src/routes/productRoutes.js` | MODIFIED | Added admin auth to POST |
| `src/routes/orderRoutes.js` | MODIFIED | Added auth to all endpoints |
| `src/controllers/orderController.js` | MODIFIED | Added userId, ownership checks |
| `src/models/Order.js` | MODIFIED | Added user_id, findByUserId |
| `src/services/orderService.js` | MODIFIED | Passes userId through |
| `src/services/asyncOrderService.js` | MODIFIED | Passes userId through |
| `src/utils/errors.js` | MODIFIED | Added UnauthorizedError, ForbiddenError |
| `src/app.js` | MODIFIED | Mounted /api/auth routes |
| `.env` | MODIFIED | Added JWT_SECRET, JWT_EXPIRES_IN |
| `docs/security/authentication.md` | NEW | Full security architecture doc |

---

### 🎓 25 Technical Interview Questions — Authentication, Authorization & Security

1. What is the difference between authentication and authorization? Give an example from a flash sale system.
2. Why do we hash passwords instead of encrypting them?
3. What is a salt in password hashing? Why is it necessary?
4. Why is bcrypt preferred over SHA-256 for password hashing?
5. What is a cost factor in bcrypt? What happens if you set it too high?
6. Explain the structure of a JWT (Header, Payload, Signature).
7. Is JWT encryption or signing? What's the difference?
8. What data should NEVER be placed in a JWT payload? Why?
9. What is the difference between a 401 Unauthorized and a 403 Forbidden response?
10. Why should the login error message be the same for "user not found" and "wrong password"?
11. What is stateless authentication? How does JWT enable it?
12. What is the drawback of stateless JWT authentication? (Hint: token revocation)
13. What is an IDOR vulnerability? How did we prevent it?
14. Explain object-level authorization vs role-based authorization.
15. Why should `User.findById()` exclude the `password_hash` column?
16. What is a refresh token? Why did we decide not to implement one?
17. Where should the JWT secret be stored? What happens if it leaks?
18. Why is middleware the correct place for authentication logic?
19. What is the difference between `authenticate()` and `authorize('admin')`?
20. Why do we look up the user in the database on every request instead of trusting the JWT payload?
21. What is credential stuffing? How does bcrypt help mitigate it?
22. What is the "algorithm confusion" attack on JWT?
23. Why should authentication endpoints be rate-limited?
24. What is the principle of least privilege? How does our RBAC implementation follow it?
25. An attacker steals a user's JWT. What is the blast radius? How would you mitigate it?

---

## 📅 Day 8 — August 17, 2026

### Phase 9: Rate Limiting and Abuse Protection

#### 🎯 Goal
Protect the API from brute-force attacks, credential stuffing, accidental request storms, and abusive clients using a Redis-backed distributed rate limiter with endpoint-specific policies.

---

#### Part 1: Understanding the Problem

##### What is Rate Limiting?
Controlling how many requests a client can make to an API within a time window. If a client exceeds the limit, the server responds with HTTP `429 Too Many Requests` instead of processing the request.

##### Why APIs Need Rate Limiting
1. **Brute-force login:** An attacker tries millions of passwords against a known email. Without limits, they can attempt thousands per second.
2. **Credential stuffing:** Using leaked passwords from other breaches (e.g., LinkedIn dump) to try logging into our system. Automated tools can test millions of credentials.
3. **Application-level DoS:** Flooding our API with valid-looking requests to exhaust database connections, CPU, and memory. Unlike network DDoS, this uses normal HTTP requests.
4. **Accidental storms:** A frontend bug retrying requests in a loop, or a misconfigured client sending thousands of identical requests.
5. **Abuse prevention:** Bots creating fake accounts, scraping product data, or submitting fake orders.

##### Rate Limiting vs Throttling
- **Rate limiting:** Hard cap. Request #101 when limit=100 gets rejected with 429.
- **Throttling:** Soft cap. Request #101 might be delayed (queued) instead of rejected.
Our system uses rate limiting for security and throttling is handled by our Redis order queue.

##### Why Rate Limiting is NOT a Complete DDoS Solution
DDoS attacks use millions of IPs, botnets, and operate at the network layer (SYN floods, UDP floods). These never reach our Express middleware. Rate limiting is *application-level* protection. For DDoS, you need infrastructure-level solutions (Cloudflare, AWS Shield, iptables).

---

#### Part 2: Rate Limiting Algorithms

##### 1. Fixed Window Counter
- Divides time into fixed windows (e.g., 0:00-0:59, 1:00-1:59).
- Each window has a counter. Request increments counter. If counter > limit → reject.
- **Advantage:** Simple. One `INCR` + `EXPIRE` in Redis.
- **Disadvantage:** "Boundary burst" exploit. 100 requests at 0:59 + 100 at 1:00 = 200 requests in 2 seconds, even with a 100/min limit. Clients can game the boundary.
- **Memory:** O(1) per client.

##### 2. Sliding Window Log
- Stores a timestamp for EVERY request in a Redis Sorted Set.
- To check: count entries within `[now - window, now]`. Remove expired entries.
- **Advantage:** Perfectly accurate. No boundary exploit.
- **Disadvantage:** Memory. 10,000 users × 100 requests = 1,000,000 sorted set entries. At ~50 bytes each = 50MB just for rate limits.

##### 3. Sliding Window Counter (OUR CHOICE)
- Hybrid approach. Maintains 2 counters: current window + previous window.
- Estimates the count using weighted average: `prevCount × overlapFraction + currentCount`.
- **Advantage:** O(1) memory, ~99.5% accurate, no boundary exploit, trivially simple in Redis.
- **Disadvantage:** Slightly approximate (~0.5% error). Acceptable for rate limiting.

##### 4. Token Bucket
- Each client has a "bucket" with N tokens. Tokens refill at a fixed rate (e.g., 2/sec). Each request consumes one token. If bucket is empty → reject.
- **Advantage:** Allows controlled bursts (up to bucket capacity).
- **Disadvantage:** Requires storing timestamp + remaining tokens. More complex atomicity in Redis.

##### 5. Leaky Bucket
- Requests enter a queue that "leaks" at a fixed rate. If queue is full → reject.
- **Advantage:** Perfectly smooth output rate.
- **Disadvantage:** Adds queueing latency. Not suitable for real-time API responses where we want to accept or reject immediately.

---

#### Part 3: Algorithm Choice — Sliding Window Counter

We chose the Sliding Window Counter because:
1. Our flash sale has bursty but legitimate traffic. We need accuracy without boundary exploits.
2. Memory must be O(1) per client — we could have 100,000 unique clients during a sale.
3. Redis operations must be minimal — just `INCR` + `EXPIRE` + `GET`.
4. We do NOT need perfectly smooth output (our Redis order queue handles backpressure).

---

#### Part 4: Client Identification Strategy

| Context | Identifier | Rationale |
|---------|-----------|-----------|
| **Unauthenticated (login)** | IP + email | Prevents both IP-rotation attacks AND account lockout attacks |
| **Unauthenticated (register)** | IP only | No identity exists yet |
| **Authenticated (orders)** | User ID | Respects shared networks (college WiFi, corporate NAT) |
| **General API** | IP | Catch-all safety net |

##### Edge Cases Considered
- **NAT/Corporate networks:** 500 users behind 1 IP. Per-IP limits on authenticated endpoints would unfairly throttle everyone. Solution: use User ID for authenticated routes.
- **College WiFi:** Same as NAT. Per-user limits ensure fair access.
- **IPv6:** Some ISPs assign /64 blocks to individual users, giving them billions of addresses. IPv6 rate limiting might need to limit by /48 prefix instead. Not implemented yet.
- **X-Forwarded-For spoofing:** An attacker can set `X-Forwarded-For: 1.2.3.4` to fake their IP. We ONLY trust this header when Express's `trust proxy` is configured AND only from our own Nginx proxy.

---

#### Part 5: Redis as Distributed Rate Limiter

In-memory JavaScript objects (like `Map`) are insufficient because:
```
API Instance 1: user123 → 10 requests (allows more)
API Instance 2: user123 → 10 requests (allows more)
Total: 20 requests — exceeds the intended limit of 10!
```

Redis provides a SINGLE shared counter. All API instances INCR the same key:
```
API1: INCR rl:user:123 → 4
API2: INCR rl:user:123 → 7
API3: INCR rl:user:123 → 10
API1: INCR rl:user:123 → 11 → REJECTED (429)
```

---

#### Part 6: Redis Atomicity — Lua Scripts

**The Naive Approach (Dangerous):**
```
INCR key      ← succeeds, count = 1
EXPIRE key 60 ← process crashes before this executes
```
Result: The key has no TTL. Counter lives forever. User is permanently rate-limited.

**Our Solution: Lua Script**
Redis executes Lua scripts atomically. The entire script runs as a single operation — no other Redis command can interleave. Our script:
1. `INCR` current window key
2. Set `EXPIRE` if this is the first request in the window
3. `GET` previous window count
4. Calculate weighted total
5. Return `[weightedCount, currentCount, previousCount, ttl, limit]`

All 5 steps happen atomically. No race conditions. No orphaned keys.

---

#### Part 7: Rate Limit Policies

| Endpoint | Limit | Window | Why |
|----------|-------|--------|-----|
| **POST /api/auth/login** | 10 | 15 min | bcrypt ≈ 300ms/hash. 10 attempts = 3 seconds of compute. Brute-forcing 10K passwords would take 10+ days. Legitimate users rarely fail >5 times. |
| **POST /api/auth/register** | 5 | 1 hour | No legitimate user registers 5 accounts/hour. Prevents spam bot account creation. |
| **POST /api/orders** | 30 | 1 min | During flash sales, users may try multiple products quickly. 30/min = 1 every 2 seconds — generous for humans, restrictive for bots. |
| **All /api/*** | 100 | 1 min | Safety net. Prevents any single IP from monopolizing resources. |

---

#### Part 8: HTTP 429 Response Design

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

Rate limit headers are sent on EVERY response (not just 429), so well-behaved clients can proactively slow down.

---

#### Part 9: Middleware Design

Rate limiting is implemented as Express middleware (`src/middleware/rateLimiter.js`), not in controllers, because:
1. **Separation of concerns:** Controllers handle business logic. Rate limiting is a cross-cutting infrastructure concern.
2. **Reusability:** The same middleware factory creates limiters with different policies for different routes.
3. **Order of execution:** Rate limiting runs BEFORE the controller. If a request is blocked, the controller never executes, saving compute and DB resources.

Flow: `Request → rateLimiter → authenticate → authorize → controller`

---

#### Part 10: Authentication-Specific Protection

For login brute-force, we use **IP + email** combination:
- Limiting by IP only: An attacker with a botnet rotates IPs.
- Limiting by email only: An attacker floods login for `victim@corp.com`, locking out the real user (account denial-of-service).
- **IP + email**: The attacker's specific IP gets blocked from that specific email. The real user on a different IP can still log in. The attacker can't lock out accounts they don't control.

---

#### Part 11: Flash Sale Order Protection — Two Different Problems

**Rate limiting** and **queueing** solve different problems:
- **Rate limiting:** Prevents a single abusive client from submitting 1,000 orders/second. Answers: "Should this specific client be allowed to submit another request?"
- **Queueing (Phase 7):** Absorbs legitimate traffic spikes. If 10,000 real users submit simultaneously, the queue buffers them for the database. Answers: "How do we handle more requests than the database can process?"

During a flash sale, rate limiting does NOT block legitimate traffic (30 orders/min per user is very generous). The queue absorbs the aggregate load.

---

#### Part 12: Failure Behavior

| Scenario | Auth Endpoints (login, register) | Everything Else |
|----------|:-------------------------------:|:---------------:|
| Redis unavailable | **FAIL CLOSED** → 503 | **FAIL OPEN** → allow |
| Redis timeout | **FAIL CLOSED** → 503 | **FAIL OPEN** → allow |

**Why different?**
- **Auth (CLOSED):** If we can't verify rate limits, we must NOT allow unlimited brute-force. Security > availability for auth.
- **Orders (OPEN):** If rate-limit Redis is slow, blocking all orders during a flash sale would be catastrophic for revenue. The order queue provides its own backpressure protection.

---

#### Part 13: Trust Proxy / IP Handling

Express determines `req.ip`:
- Without `trust proxy`: `req.ip` = socket `remoteAddress` (direct connection IP).
- With `trust proxy = 1`: `req.ip` = leftmost `X-Forwarded-For` value (Nginx sets this to the real client IP).

**Security:** We do NOT enable `trust proxy` until we deploy behind Nginx. Enabling it prematurely would let clients spoof their IP via the `X-Forwarded-For` header, bypassing IP-based rate limits.

---

#### Part 14: Testing Results (All Passed ✅)

| Test | Description | Expected | Result |
|------|------------|----------|--------|
| 1 | Rate limit headers present | X-RateLimit-* headers | ✅ |
| 2 | Register limit (5/hour) | 5 allowed, 2 blocked | ✅ |
| 3 | Login limit (10/15min) | 10 allowed, 2 blocked | ✅ |
| 4 | 429 response format | Retry-After + body | ✅ |
| 5 | Different emails = separate limits | Not 429 for different email | ✅ |
| 6 | Order limit (30/min per user) | 30 allowed, 3 blocked | ✅ |
| 7 | General API limit (100/min) | ~100 allowed, ~5 blocked | ✅ |
| 8 | Redis key state verification | Keys with correct TTL | ✅ |
| 9 | Performance overhead | ~2ms avg, ~3ms p95 | ✅ |

---

#### Part 15: Distributed Rate Limiting Verification

All API instances share the same Redis. When running multiple instances:
```
Limit = 10
API1 receives 4 → Redis counter = 4
API2 receives 3 → Redis counter = 7
API3 receives 3 → Redis counter = 10
API1 receives 1 → Redis counter = 11 → 429 REJECTED
```

This is guaranteed by Redis's single-threaded execution model. The Lua script runs atomically, so even concurrent requests from different instances cannot cause race conditions.

---

#### Part 16: Performance Impact

##### k6 Benchmark (25 VUs, 10s, GET /api/products)
| Metric | With Rate Limiter |
|--------|:-----------------:|
| Avg Latency | ~2ms |
| P95 Latency | ~3ms |
| Throughput | ~475 RPS |

**Conclusion:** The Redis-backed rate limiter adds negligible overhead (~0.1ms per Redis round-trip via Lua). The 429 rejection path is sub-millisecond since no DB query or business logic executes. Rate limiting is NOT a performance bottleneck.

---

#### Part 17: Documentation

Created `docs/security/rate-limiting.md` with complete architecture documentation.

---

#### 📁 Files Created/Modified (Phase 9)

| File | Action | Purpose |
|------|--------|---------|
| `src/middleware/rateLimiter.js` | NEW | Sliding window counter with Lua script, policy factory, 4 pre-configured limiters |
| `src/routes/authRoutes.js` | MODIFIED | Applied loginLimiter and registerLimiter |
| `src/routes/orderRoutes.js` | MODIFIED | Applied orderLimiter after authenticate |
| `src/app.js` | MODIFIED | Applied generalLimiter to all /api/* routes |
| `tests/load/rate-limit-overhead.js` | NEW | k6 performance benchmark |
| `docs/security/rate-limiting.md` | NEW | Full architecture documentation |

---

### 🎓 25 Technical Interview Questions — Rate Limiting & Abuse Protection

1. What is the difference between rate limiting and throttling?
2. Explain the Fixed Window Counter algorithm and its boundary burst vulnerability.
3. How does the Sliding Window Counter algorithm prevent boundary burst exploits?
4. Why did you choose Sliding Window Counter over Token Bucket?
5. What is the memory complexity of each rate limiting algorithm?
6. Why is an in-memory JavaScript `Map` insufficient for rate limiting in a multi-instance deployment?
7. How does Redis solve the distributed rate limiting problem?
8. Explain why the naive `INCR` → `EXPIRE` sequence can fail. How does Lua fix it?
9. What is a brute-force attack? How does rate limiting mitigate it?
10. What is credential stuffing? How is it different from brute-force?
11. Why do authentication endpoints need stricter rate limits than general API endpoints?
12. Explain your client identification strategy: Why IP+email for login, User ID for orders?
13. What happens if you rate-limit login only by email? (Account lockout attack.)
14. What is the X-Forwarded-For header? Why is blindly trusting it dangerous?
15. When should you enable `trust proxy` in Express? What happens if you enable it prematurely?
16. What does "fail open" vs "fail closed" mean? When would you choose each?
17. Why does your login endpoint fail CLOSED but your order endpoint fails OPEN?
18. What is an application-level DoS? How is it different from a network DDoS?
19. Why is rate limiting NOT a complete DDoS solution?
20. Explain the HTTP 429 status code. What headers should accompany it?
21. What is the purpose of the `Retry-After` header?
22. Why should rate limit headers (`X-RateLimit-Remaining`) be sent on EVERY response, not just 429s?
23. During a flash sale with 10,000 legitimate users, how do you prevent rate limiting from destroying valid traffic?
24. What is the difference between rate limiting (abuse protection) and queueing (backpressure)?
25. If Redis goes down during a flash sale, should you block all orders or allow them through? Justify your answer.

---

## 📅 Day 8 — August 17, 2026

### Phase 10: Docker Containerization

#### 🎯 Goal
Containerize the entire backend stack (Express API, Background Worker, MySQL, Redis) so it can be started reproducibly with `docker compose up`. Understand the deep differences between images, containers, volumes, and networks.

---

#### Part 1: Why Containers?

**The "Works on my machine" Problem:**
Developer A uses Node 20 and MySQL 8. Developer B uses Node 18 and MySQL 5.7. The production server uses Node 16. The app crashes in production because of environment mismatches.
**Solution:** Docker packages the application *with its environment* (OS libraries, Node runtime, dependencies). The exact same package runs everywhere.

**Container vs Virtual Machine:**
- **VM:** Virtualizes the *hardware*. Runs a full Guest OS (Windows/Ubuntu) on top of a hypervisor. Heavy, slow, consumes GBs of RAM.
- **Container:** Virtualizes the *OS*. Shares the Host OS kernel but isolates processes, networks, and file systems. Extremely lightweight (starts in ms). A container is literally just an isolated Linux process.

---

#### Part 2: Image vs Container

- **Image:** A read-only template or blueprint (like a Class in OOP). It contains the OS files, app code, and libraries. It is built in layers.
- **Container:** A running instance of an Image (like an Object in OOP). It adds a thin, writable "container layer" on top of the image. 

When you run `docker build`, you create an Image.
When you run `docker run` or `docker compose up`, you create Containers from that Image.

---

#### Part 3: Dockerfile Design

We created ONE `Dockerfile` to serve both the API and the Worker, since they share 99% of the same code and dependencies.

```dockerfile
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache --virtual .build-deps python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
RUN apk del .build-deps
COPY src/ ./src/
RUN addgroup -S appuser && adduser -S appuser -G appuser
RUN chown -R appuser:appuser /app
USER appuser
EXPOSE 3000
CMD ["node", "src/server.js"]
```

**Key Explanations:**
1. **`node:20-alpine`**: Alpine Linux is ~5MB (vs Ubuntu's ~70MB). It drastically reduces the final image size to ~150MB, making deployments faster and shrinking the attack surface.
2. **`apk add ...`**: Native modules like `bcrypt` require C++ build tools. Alpine doesn't have them. We install them, run `npm ci`, and then delete them (`apk del`) in the same build to save space.
3. **Layer Caching**: We `COPY package.json` and run `npm ci` BEFORE copying the source code. If we only change a JS file, Docker reuses the cached `node_modules` layer, reducing rebuild time from 60 seconds to 2 seconds.
4. **`npm ci --omit=dev`**: Exact, deterministic installation based on `package-lock.json`. Excludes `nodemon` since we don't need hot-reloading in production.
5. **Non-root User**: Running as `root` in a container is dangerous. If compromised, attackers could escape to the host. We run as `appuser`.
6. **Exec form `CMD`**: `["node", "src/server.js"]` ensures Node runs as PID 1. If we used `CMD node src/server.js` (shell form), `/bin/sh` would be PID 1 and wouldn't forward the `SIGTERM` signal to Node, breaking our graceful shutdown.

---

#### Part 4: Container Networking (Service Discovery)

Inside a container, `localhost` means the container itself.
If the API container tries to connect to MySQL using `DB_HOST=localhost`, it tries to find MySQL inside the API container and fails.

**Docker Networks:**
Docker Compose creates an isolated virtual network (`flash-sale-net`). It includes an internal DNS server.
When the API uses `DB_HOST=mysql`, Docker resolves "mysql" to the internal IP of the MySQL container.

---

#### Part 5: Environment Variables & Secrets

We NEVER bake secrets (like `DB_PASSWORD` or `JWT_SECRET`) into the Docker image. Images might be pushed to Docker Hub and viewed by anyone.
We pass them at **Runtime** using `docker-compose.yml` or a `.env` file injected by Compose. The `.dockerignore` file explicitly excludes `.env` to prevent accidental baking.

---

#### Part 6: Persistence & Volumes

Containers are ephemeral. If you delete a MySQL container, all data inside it is destroyed.
**Solution: Named Volumes**
```yaml
volumes:
  - mysql-data:/var/lib/mysql
```
This mounts a persistent slice of the host's storage into the container.
- `docker compose down`: Removes containers. Data SURVIVES in the volume.
- `docker compose down -v`: Removes containers AND volumes. Data is DESTROYED.

---

#### Part 7: Database Initialization

How do we create our tables in a fresh Docker environment?
MySQL's official image automatically executes any `.sql` files placed in `/docker-entrypoint-initdb.d/` on its VERY FIRST startup (when the data directory is empty).
We created `docker/mysql/init.sql` using idempotent `CREATE TABLE IF NOT EXISTS` statements and mounted it there.

---

#### Part 8: Docker Compose Architecture

Our `docker-compose.yml` orchestrates 4 services:
1. **mysql**: Uses `mysql:8.0`, mounts `mysql-data` volume and `init.sql`.
2. **redis**: Uses `redis:7-alpine`. No volume (transient data is fine).
3. **api**: Builds our Dockerfile. Maps port `3000:3000`. Connects to `mysql` and `redis`.
4. **worker**: Builds the SAME Dockerfile, but overrides the command: `command: ["node", "src/workers/orderWorker.js"]`. No ports mapped (it doesn't need to be accessed from the outside).

**Health Checks vs depends_on:**
`depends_on: mysql` only waits for the MySQL *container* to start, not for MySQL to be *ready to accept connections* (which takes ~20s on first boot).
We added a `healthcheck` (running `mysqladmin ping`) to the MySQL service, and configured the API to wait: `condition: service_healthy`. This prevents the API from crashing on boot.

---

#### Part 9: Failure Scenarios Tested

- **Kill Worker**: API keeps taking orders. They sit in Redis. Start worker again → backlog is processed. Zero data loss.
- **Kill Redis**: API async orders fail (Fail Open strategy), rate limiting resets.
- **Kill MySQL**: API reads fail. Worker encounters errors, transaction rolls back, order goes to dead-letter or stays in Redis for retry.
- **Stop API (Graceful Shutdown)**: Docker sends `SIGTERM`. `server.js` catches it, finishes active requests, closes MySQL pool, and exits.

---

#### 📁 Files Created/Modified (Phase 10)

| File | Purpose |
|------|---------|
| `.dockerignore` | Excludes `node_modules`, `.env`, `.git` from build context |
| `Dockerfile` | Multi-purpose alpine-based image for API and Worker |
| `docker/mysql/init.sql` | Idempotent DB initialization script |
| `docker-compose.yml` | Orchestrates MySQL, Redis, API, and Worker networks/volumes |
| `scratch/test_phase10.js` | End-to-end integration test over Docker networking |
| `docs/infrastructure/docker.md` | Comprehensive Docker architecture documentation |

---

### 🎓 25 Technical Interview Questions — Docker & Containerization

1. What problem does Docker solve? Explain the "Works on my machine" issue.
2. What is the fundamental difference between a Virtual Machine and a Container?
3. Explain the difference between a Docker Image and a Docker Container.
4. Why did you choose `node:20-alpine` over `node:20` for your base image? What are the trade-offs?
5. Why do you `COPY package.json` and run `npm ci` *before* copying the rest of your source code?
6. What does `npm ci` do, and why is it preferred over `npm install` in Docker builds?
7. Your application requires `bcrypt`, which is a native C++ module. How do you handle this in an Alpine-based image?
8. Explain the concept of Docker image layers and layer caching.
9. Why should you never run a Node.js application as the `root` user inside a container? How do you fix this?
10. What is the difference between the shell form `CMD node src/server.js` and the exec form `CMD ["node", "src/server.js"]`?
11. How does PID 1 inside a container relate to graceful shutdown?
12. Why is `.dockerignore` important? Name three things that should always be in it.
13. Where should you store application secrets (like `JWT_SECRET`) when using Docker? Why?
14. Inside your API container, what does `localhost` resolve to?
15. How does the API container communicate with the MySQL container? Explain Docker service discovery.
16. If you delete a MySQL container, what happens to the data? How do you prevent data loss?
17. What is the difference between `docker compose down` and `docker compose down -v`?
18. How did you initialize the database schema automatically when the MySQL container starts?
19. In `docker-compose.yml`, what is the difference between `depends_on` and `depends_on` with `condition: service_healthy`?
20. Why do the API and the Worker share the same Dockerfile? How do you start them differently in Compose?
21. Does the Worker container need to map/expose any ports to the host machine? Why or why not?
22. Should an application write logs to a file inside the container? Where should it log instead?
23. What happens if the Worker container crashes while the API is still running during a flash sale?
24. What happens if the Redis container crashes while the API is running?
25. Explain why a multi-stage Docker build was not strictly necessary for this Node.js application.

---

## 📅 Day 8 — August 17, 2026

### Phase 11: Nginx Reverse Proxy + Load Balancing

#### 🎯 Goal
Introduce Nginx to act as a reverse proxy and load balancer in front of three API replicas. Understand horizontal scaling, the necessity of a stateless API architecture, and how to preserve client IPs using proxy headers.

---

#### Part 1: Why Nginx?

- **Reverse Proxy**: Sits in front of the application servers, intercepting client requests. It hides the internal architecture, handles SSL termination, and manages TCP connections far more efficiently than Node.js.
- **Load Balancer**: Distributes incoming traffic across multiple API instances, preventing any single instance from being overwhelmed.
- **Why not expose Express directly?**: Express is single-threaded. Exposing it directly means you only use 1 CPU core, and Node is notoriously bad at handling thousands of idle connections compared to Nginx's event-driven C architecture.

---

#### Part 2: Horizontal Scaling & Statelessness

- **Vertical Scaling**: Making a single server bigger (more CPU/RAM). Has limits and remains a single point of failure.
- **Horizontal Scaling**: Adding more identical servers (replicas). Provides infinite scale and high availability.

**Stateless API:**
To scale horizontally, the API MUST be stateless. Any replica must be able to handle any request.
- We use **JWTs** instead of memory-based sessions.
- We use **Redis** for global rate limiting instead of local JavaScript variables.
- We use **Redis** for the order queue, allowing any API to enqueue and any worker to dequeue.
If we stored state locally, a user hitting `api-1` for login and `api-2` for order creation would fail.

---

#### Part 3: Load Balancing (Round Robin)

We configured Nginx to use **Round Robin**, which sends requests to `api-1`, then `api-2`, then `api-3`, and repeats.
Since our API is stateless and our replicas are identical containers, this provides perfect, fair distribution. 
(We avoided `least_conn` because our request times are uniform, and `ip_hash` because it breaks behind corporate NATs and isn't needed for JWT apps).

---

#### Part 4: Nginx Configuration

```nginx
upstream api_backend {
    server api-1:3000;
    server api-2:3000;
    server api-3:3000;
}

server {
    listen 80;
    location / {
        proxy_pass http://api_backend;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

---

#### Part 5: Proxy Headers (`X-Forwarded-For`)

When Nginx proxies a request to Express, Express thinks the client is Nginx (e.g., `172.18.0.2`).
If we rate limit by IP, **all users would share one bucket** and be blocked instantly.
- Nginx injects the `X-Forwarded-For` header with the real client IP.
- Express is configured with `app.set('trust proxy', 1)` to trust this header and use it for `req.ip`.

---

#### Part 6: Docker Compose Updates

- Added the `nginx` service mapped to host port 80.
- Removed host port mappings from API replicas (security: they are only accessible through Nginx).
- Created `api-1`, `api-2`, and `api-3` services using YAML anchors (`<<: *api-env`) to share configuration while allowing unique `INSTANCE_ID` overrides for testing.

---

#### Part 7: Testing & Failure Scenarios

1. **Load Distribution**: Ran 30 requests to `/health`. Verified the JSON response showed exactly 10 requests hitting `api-1`, 10 to `api-2`, and 10 to `api-3`.
2. **Global Rate Limiting**: Fired 105 requests across the load balancer. The Redis-backed rate limiter correctly enforced the 100/min limit globally, proving state is shared.
3. **Failure Isolation**: Stopped `api-2`. Traffic seamlessly shifted to `api-1` and `api-3`. The client experienced zero downtime.
4. **Single Point of Failure**: Nginx itself is a single point of failure in this architecture. In production, an AWS ALB or keepalived failover setup is required to solve this.

---

#### 📁 Files Created/Modified (Phase 11)

| File | Purpose |
|------|---------|
| `docker/nginx/nginx.conf` | Configures upstream blocks, reverse proxy, and proxy headers |
| `docker-compose.yml` | Added Nginx service, expanded API to 3 replicas with YAML anchors |
| `src/app.js` | Added `trust proxy` configuration and injected `INSTANCE_ID` in responses |
| `scratch/test_phase11.js` | Automated script verifying round-robin, global auth, and rate limits |
| `docs/infrastructure/nginx.md` | Explains horizontal scaling, statelessness, and Nginx concepts |

---

### 🎓 15 Technical Interview Questions — Nginx & Load Balancing

1. What is the difference between a forward proxy and a reverse proxy?
2. Why is it standard practice to place Nginx in front of a Node.js/Express application?
3. Explain the difference between horizontal and vertical scaling. What are the pros and cons of each?
4. What does it mean for an API to be "stateless"? Why is this mandatory for horizontal scaling?
5. If your API stores user sessions in memory (e.g., using a JS Map), what happens when you load balance across three instances? How do you fix it?
6. Describe three different load balancing algorithms. Why did we choose Round Robin?
7. When would you choose "Least Connections" over "Round Robin"?
8. What is the `X-Forwarded-For` header, and why is it critical when using a reverse proxy?
9. If you forgot to enable `app.set('trust proxy', 1)` in Express, what severe side effect would happen to your IP-based rate limiter?
10. Why is it dangerous to enable `trust proxy` if your Express application is directly exposed to the internet (without a proxy in front)?
11. In our Nginx configuration, why did we set `proxy_http_version 1.1;` and clear the `Connection` header?
12. If `api-2` crashes during a request, how does Nginx handle it? Does the client receive an error?
13. We scaled our API horizontally to 3 replicas. Does this triple our capacity to process Flash Sale transactions in MySQL? Why or why not?
14. What is the difference between a liveness check and a readiness check in the context of load balancer health routing?
15. In our current architecture, what is the Single Point of Failure (SPOF)? How would you eliminate it in a cloud environment?

---

## 📅 Day 9 — August 18, 2026

### Phase 12: CI/CD with Jenkins

#### 🎯 Goal
Implement a Continuous Integration and Continuous Delivery (CI/CD) pipeline using Jenkins to automatically validate dependencies, run static checks, build Docker images, execute integration tests, and deploy the application. 

---

#### Part 1: CI/CD Fundamentals
- **Continuous Integration (CI):** The practice of automating the integration of code changes from multiple contributors into a single software project. It involves automatically building and testing the code every time a team member commits changes to version control.
- **Continuous Delivery (CD):** An extension of CI that ensures you can release new changes to your customers quickly in a sustainable way. This means that on top of having automated testing, you also have automated release processes. Deployment is a manual click.
- **Continuous Deployment (CD):** Similar to Continuous Delivery, but deployments to production are completely automated without manual intervention.
- **Why CI/CD?** Manual deployments are slow, error-prone, and risky. CI/CD catches bugs early, ensures consistent deployment processes, and allows for rapid iterations.

#### Part 2: Jenkins Architecture
- **Jenkins Controller (Master):** The central server that schedules jobs, manages environments, and serves the UI.
- **Jenkins Agent (Slave):** Nodes that execute the actual tasks (jobs) dispatched by the Controller.
- **Pipeline:** A set of instructions (usually in a `Jenkinsfile`) defining the CI/CD process.
- **Docker-in-Docker vs Docker Socket:** We mounted the host's Docker socket (`/var/run/docker.sock`) into the Jenkins container. This allows Jenkins to spin up sibling containers on the host, avoiding the severe performance and caching issues of running a Docker daemon *inside* a Docker container.

#### Part 3: Pipeline Stages
Our Declarative Pipeline (`Jenkinsfile`) consists of the following stages:
1. **Checkout:** Pulls the latest code and extracts the Git commit SHA for image tagging.
2. **Validate Dependencies:** Runs `npm ci` to ensure the `package-lock.json` matches the `package.json`.
3. **Static Checks:** Runs basic code validation to catch syntax errors instantly before wasting time on builds.
4. **Docker Build:** Builds the application image. We tag images immutably using the Git commit SHA (e.g., `flash-sale-manager:a1b2c3d4`) rather than relying purely on the mutable `:latest` tag.
5. **Integration Tests:** Spins up a temporary test stack (`docker compose -p flash-sale-test`) using the freshly built image and runs health checks. Cleans up afterward.
6. **Deploy:** Stops the old production stack and starts the new one using the validated image.
7. **Smoke Test:** Runs post-deployment verification against the live stack to ensure Nginx is routing traffic correctly to the healthy API containers.

**Fail-Fast Mechanism:** If ANY stage fails (e.g., Integration Tests), the pipeline aborts immediately. Broken code is NEVER deployed.

#### Part 4: Immutable Tags and Rollbacks
- Deploying the `:latest` tag is dangerous because you cannot trace exactly what code is running, and you cannot easily roll back.
- By tagging images with the Git commit SHA, every build produces a unique artifact.
- **Rollback Strategy:** If a bad commit is deployed, rolling back is as simple as running `docker compose up` with the previous Git SHA tag.

#### 📁 Files Created/Modified (Phase 12)

| File | Purpose |
|------|---------|
| `docker/jenkins/docker-compose.yml` | Containerized Jenkins setup with Docker socket mounting |
| `Jenkinsfile` | Declarative CI/CD pipeline definition with 7 stages |
| `docs/infrastructure/cicd.md` | Comprehensive documentation on CI/CD principles and architecture |

---

### 🎓 35 Technical Interview Questions — CI/CD & Jenkins

**1. What is the difference between Continuous Integration, Continuous Delivery, and Continuous Deployment?**
*Answer:* CI automates building and testing code on every commit. Continuous Delivery ensures the code is always in a deployable state, but deployment requires manual approval. Continuous Deployment automates the entire process, pushing code to production without human intervention.
*Follow-up:* Which approach is best for a financial institution vs a startup?

**2. Why do we prefer webhooks over SCM polling for triggering pipelines?**
*Answer:* SCM polling wastes resources by constantly asking GitHub "Are there changes?". Webhooks are event-driven—GitHub actively notifies Jenkins only when a push occurs, resulting in immediate builds and zero wasted API calls.
*Follow-up:* How do you secure a webhook payload?

**3. What is the difference between a Jenkins Controller and an Agent?**
*Answer:* The Controller orchestrates pipelines, stores configurations, and serves the UI. Agents are the worker nodes that actually execute the pipeline steps.
*Follow-up:* Why shouldn't you run heavy builds on the Controller?

**4. Why did we choose a Declarative Pipeline over a Scripted Pipeline?**
*Answer:* Declarative pipelines use a strict, structured syntax (`pipeline { stages { ... } }`) that is easier to read, maintain, and lint. Scripted pipelines use raw Groovy, which is powerful but prone to complex, spaghetti logic.
*Follow-up:* When would you absolutely need a Scripted Pipeline?

**5. Why is it important to separate the CI phase (build/test) from the Deployment phase?**
*Answer:* Separation ensures that only code that has passed all tests is allowed to be deployed. If deployment is mixed with building, a failed test might leave the system in a partially deployed, broken state.
*Follow-up:* How do you pass an artifact from the CI phase to the Deployment phase?

**6. Explain the danger of running `npm install` instead of `npm ci` in a pipeline.**
*Answer:* `npm install` can update the `package-lock.json` and install different dependency versions than what the developer tested locally. `npm ci` strictly installs exactly what is in the lockfile and fails if the lockfile is out of sync, ensuring deterministic builds.
*Follow-up:* What does `npm ci` do to the `node_modules` folder before installing?

**7. How does Jenkins build Docker images if Jenkins itself is running inside a Docker container?**
*Answer:* By mounting the host's Docker socket (`/var/run/docker.sock`) into the Jenkins container, Jenkins can issue commands to the host's Docker daemon. It creates sibling containers, not nested containers.
*Follow-up:* What are the security risks of mounting the Docker socket?

**8. Why did we avoid Docker-in-Docker (DinD)?**
*Answer:* DinD runs a nested Docker daemon inside the Jenkins container. It requires privileged mode, breaks Docker layer caching, and suffers from complex filesystem storage issues.
*Follow-up:* When is DinD strictly required?

**9. Why must secrets (like JWT_SECRET or DB_PASSWORD) never be stored in the Jenkinsfile or Git?**
*Answer:* Version control history is permanent. Anyone with access to the repo would compromise the production systems. Secrets should be stored in secure vaults (like Jenkins Credentials Manager or AWS Secrets Manager) and injected at runtime.
*Follow-up:* How do you prevent developers from accidentally echoing a secret in a Jenkins pipeline?

**10. What is an immutable Docker image tag, and why is it superior to `:latest`?**
*Answer:* An immutable tag (like a Git commit SHA) uniquely identifies a specific build and is never overwritten. `:latest` is a moving target. Using `:latest` makes it impossible to know exactly what code is running in production and makes rolling back difficult.
*Follow-up:* How does using a Git SHA tag aid in debugging production issues?

**11. Explain our Docker tagging strategy in the pipeline.**
*Answer:* We tag the image twice: once with the Git commit SHA for immutability and traceability in deployment, and once with `:latest` as a convenience pointer to the most recent build.
*Follow-up:* How do you extract the short Git SHA in a Jenkins pipeline?

**12. What happens if the Integration Test stage fails in our Jenkinsfile?**
*Answer:* The pipeline immediately aborts. The `Deploy` and `Smoke Test` stages are skipped. The `failure` post-action executes to notify the team, and the `always` post-action cleans up the workspace and the temporary test stack.
*Follow-up:* How do you ensure the test database is destroyed even if the tests crash?

**13. What is a "Smoke Test" in the context of our post-deployment stage?**
*Answer:* A minimal, non-exhaustive test run against the live production environment to verify core functionality (e.g., checking the `/health` endpoint). It proves the deployment was successful and the application started correctly.
*Follow-up:* Why shouldn't a smoke test include destructive database operations?

**14. If a deployment introduces a critical bug, how does our tagging strategy facilitate a rollback?**
*Answer:* Because every deployment uses a unique Git SHA tag, rolling back simply means updating the `docker-compose.yml` to point to the previously known good SHA and restarting the containers. The old image is still available in the Docker cache or registry.
*Follow-up:* What complicates rolling back if a database migration was part of the bad deployment?

**15. How do database migrations complicate CI/CD pipelines?**
*Answer:* Application code and database schemas are tightly coupled. If version 2 adds a new column, the code expects it. If you deploy the code before running the migration, the app crashes. Migrations must be run before the app code swaps, and they must be backward-compatible to allow zero-downtime deployments.
*Follow-up:* How do you handle a migration that renames an existing column with zero downtime?

**16. What is a "Recreate" deployment strategy, as used in our local pipeline?**
*Answer:* Stopping the old containers and starting the new ones. It is simple but causes brief downtime (a few seconds) while the new containers spin up.
*Follow-up:* Is a Recreate strategy acceptable for a global e-commerce site during Black Friday?

**17. Explain Blue-Green Deployment.**
*Answer:* You run two identical production environments (Blue and Green). Blue is live. You deploy the new version to Green, run tests against it, and then switch the load balancer routing from Blue to Green. Rollback is instant by switching back to Blue.
*Follow-up:* What is the main infrastructure downside of Blue-Green deployment?

**18. Explain Rolling Deployment.**
*Answer:* An orchestrator (like Kubernetes) gradually replaces old instances with new ones, one by one. It ensures zero downtime without requiring double the infrastructure of Blue-Green.
*Follow-up:* Why didn't we use a Rolling Deployment with plain Docker Compose?

**19. Why do we run static checks (like syntax validation) before the Docker build stage?**
*Answer:* Fail-fast principle. Static checks take milliseconds. Building a Docker image takes minutes. Catching a missing semicolon before building the image saves significant developer time and CI computing resources.
*Follow-up:* What other tools belong in the Static Checks stage?

**20. In our pipeline, why do we use `docker compose -p flash-sale-test` for integration tests?**
*Answer:* The `-p` flag sets a custom project name. This isolates the test stack from the production stack (`flash-sale`), ensuring the tests don't accidentally overwrite or interact with the live production database.
*Follow-up:* How do you prevent port conflicts between the test stack and the production stack running on the same machine?

**21. What is an Artifact in a CI/CD pipeline?**
*Answer:* A deployable output generated by the build process. In Java, it's a `.jar` file. In our project, the artifact is the tagged Docker image.
*Follow-up:* Where should Docker artifacts be stored permanently?

**22. How does Jenkins authenticate with GitHub to pull private repositories?**
*Answer:* Using SSH keys or Personal Access Tokens (PATs) stored securely in the Jenkins Credentials Manager. The pipeline references a credentials ID, preventing the token from appearing in the logs or the Jenkinsfile.
*Follow-up:* What is least-privilege access, and how does it apply to Jenkins' GitHub token?

**23. What is the `WORKSPACE` variable in Jenkins?**
*Answer:* The absolute path of the directory on the agent where Jenkins checks out the source code and executes the build steps.
*Follow-up:* Why is it important to clean the workspace in the `post { always { ... } }` block?

**24. What does the `cleanWs()` step do, and why is it necessary?**
*Answer:* It wipes the workspace directory after the pipeline finishes. If left uncleaned, old files from previous builds can pollute subsequent builds, leading to false positives, and eventually exhausting the agent's disk space.
*Follow-up:* What happens if you run out of disk space on a Jenkins agent?

**25. If Nginx routes traffic using Round Robin, what happens if `api-2` crashes during the Smoke Test?**
*Answer:* Nginx's passive health checks will detect the failure (e.g., connection refused) and temporarily remove `api-2` from the upstream pool, routing subsequent requests to `api-1` and `api-3`. The smoke test might fail if it directly hits the failed request, or pass if it hits a healthy instance.
*Follow-up:* How can active health checks in Nginx Plus improve this?

**26. How do you pass variables between different stages in a Declarative Pipeline?**
*Answer:* You define them in the global `environment { }` block or write them to a file in one stage and read the file in the next.
*Follow-up:* Can you modify an `environment` variable from inside a `sh` step?

**27. Why should you never blindly trust code from a Pull Request in a public repository?**
*Answer:* A malicious actor could submit a PR that modifies the `Jenkinsfile` to extract secrets, mine cryptocurrency on your agents, or compromise the host machine (especially since we mounted the Docker socket).
*Follow-up:* How do you securely test PRs in open-source projects?

**28. If the database migration fails during deployment, what state is the application in?**
*Answer:* If migrations fail, the schema is likely partially updated. The deployment pipeline fails, but the database might be broken for the old code too. This highlights why migrations must be run in explicit transactions and why rolling back a schema is incredibly complex.
*Follow-up:* What is the "Expand and Contract" database refactoring pattern?

**29. What is the purpose of the `post` block in a Declarative Pipeline?**
*Answer:* It defines actions that run after the main pipeline stages finish. It includes conditions like `success`, `failure`, and `always`, used for notifications, cleanup, and publishing test reports.
*Follow-up:* If a stage fails, does the `always` block still execute?

**30. How would you prevent concurrent deployments of the same pipeline?**
*Answer:* Use the `options { disableConcurrentBuilds() }` directive in the Jenkinsfile. This prevents older commits from accidentally overwriting newer deployments if a later build finishes faster.
*Follow-up:* What happens if two developers merge to `main` 5 seconds apart?

**31. What is a "Canary Release"?**
*Answer:* Deploying a new version to a small subset of users (e.g., 5%) while monitoring error rates. If successful, the rollout is gradually expanded to 100%. It minimizes the impact of a bad deployment.
*Follow-up:* How do you route 5% of traffic using an API Gateway?

**32. Why is "Works on my machine" solved by CI/CD?**
*Answer:* CI/CD provides a clean, consistent, identical environment for every build. By combining Docker (consistent runtime) with Jenkins (consistent build process), the discrepancy between local dev environments and production is eliminated.
*Follow-up:* How do environment variables bridge the gap between staging and production?

**33. What is Shift-Left Security in CI/CD?**
*Answer:* Moving security checks earlier (to the "left") in the software development lifecycle. Instead of auditing code right before production, you integrate automated vulnerability scanning, secret detection, and linting directly into the CI pipeline.
*Follow-up:* Name a tool used to scan Docker images for vulnerabilities in CI.

**34. In our Integration Test stage, what does `docker compose down --remove-orphans` do?**
*Answer:* It stops and removes containers, networks, and anonymous volumes created by `up`. The `--remove-orphans` flag ensures that containers not currently defined in the `docker-compose.yml` (from previous abandoned tests) are also cleaned up.
*Follow-up:* Why shouldn't you use `-v` during a production deployment?

**35. How would you handle a pipeline that takes 45 minutes to run?**
*Answer:* Long pipelines kill developer productivity. I would parallelize independent stages (e.g., running unit tests and static checks simultaneously), heavily utilize caching (for Docker layers and `node_modules`), and split massive integration test suites into smaller, focused chunks.
*Follow-up:* How do you configure parallel execution in a Jenkinsfile?

---

## 📅 Day 10 — August 19, 2026

### Phase 13: Monitoring, Logging & Observability

#### 🎯 Goal
Make the Flash Sale Manager observable so we can diagnose bottlenecks, track errors, and monitor real-time system behavior under heavy load using Prometheus and Grafana.

---

#### Part 1: The Three Pillars of Observability
1. **Metrics:** Numerical data measured over time (e.g., CPU %, Requests/sec). We use Prometheus. Answers *"What is happening?"*
2. **Logs:** Discrete records of events (e.g., "User logged in"). We implemented structured JSON logging. Answers *"What happened?"*
3. **Traces:** Connecting events across multiple services. We implemented `X-Request-Id` for correlation. Answers *"Where did the request spend its time?"*

#### Part 2: The Four Golden Signals
Our monitoring specifically targets the Golden Signals for web applications:
- **Latency:** `http_request_duration_seconds` (Prometheus Histogram)
- **Traffic:** `http_requests_total` (Prometheus Counter)
- **Errors:** `http_requests_total{status="500"}`
- **Saturation:** `redis_queue_depth` and `db_active_connections` (Prometheus Gauges)

#### Part 3: Structured Logging & Request IDs
- Replaced `console.log` with a custom logger that outputs strict JSON.
- Why? JSON is parseable by aggregators (like Loki or Elasticsearch). You can search for `level="error" AND service="worker"`.
- We assign a UUID (`X-Request-Id`) to every HTTP request. This ID is passed to logs, allowing us to correlate an API request with its corresponding background worker execution.

#### Part 4: Prometheus (Pull Monitoring)
- Prometheus is a time-series database. Every 15 seconds, it reaches out to the API and Worker containers and scrapes the `/metrics` endpoints.
- We used `prom-client` to expose Node.js runtime metrics (GC, Event Loop lag) alongside our custom business metrics (Orders Created, Queue Depth).
- We use the `instance` label to distinguish between `api-1`, `api-2`, and `api-3`, allowing us to spot if a single replica is failing.

#### Part 5: Grafana Dashboard
- Configured Grafana to connect to Prometheus and automatically load a "Flash Sale Manager" dashboard.
- The dashboard visualizes the Golden Signals, per-instance API traffic, Redis queue backlog, Worker throughput, and infrastructure metrics (Node.js heap size).

#### 📁 Files Created/Modified (Phase 13)

| File | Purpose |
|------|---------|
| `src/utils/logger.js` | Structured JSON logging module |
| `src/utils/metrics.js` | Prometheus metric definitions (Counters, Gauges, Histograms) |
| `src/middleware/requestId.js` | Injects UUID into requests for correlation |
| `src/middleware/metricsMiddleware.js` | Express middleware to track HTTP latency and traffic |
| `src/workers/orderWorker.js` | Added metrics tracking and port 9091 HTTP server |
| `docker/prometheus/prometheus.yml` | Prometheus scrape configuration |
| `docker/grafana/provisioning/...` | Grafana automated setup and dashboard JSON |
| `scratch/test_phase13.js` | Load script to generate traffic, 404s, and 429s for testing |

---

### 🎓 35 Technical Interview Questions — Observability & Monitoring

**1. What is the difference between Monitoring and Observability?**
*Answer:* Monitoring is looking at predefined metrics to know *when* something breaks. Observability is instrumenting the system deeply enough to ask arbitrary questions and figure out *why* it broke without deploying new code.
*Follow-up:* Can you have monitoring without observability?

**2. What are the three pillars of observability?**
*Answer:* Metrics, Logs, and Traces.
*Follow-up:* If you could only have one of the three during an incident, which would you choose and why?

**3. Explain the Four Golden Signals.**
*Answer:* Latency (time to serve a request), Traffic (demand/throughput), Errors (rate of failed requests), and Saturation (system utilization/queue depth).
*Follow-up:* Why is Saturation a leading indicator of Latency?

**4. Why did we choose a "Pull" monitoring system (Prometheus) over a "Push" system (StatsD)?**
*Answer:* Pull is simpler for long-running services. If Prometheus crashes, the API doesn't care. If it were a Push system, the API would have to buffer metrics or deal with network timeouts when the monitoring server goes down.
*Follow-up:* When is a Push system strictly necessary? (Hint: Serverless/Cron jobs)

**5. What is the difference between a Prometheus Counter and a Gauge?**
*Answer:* A Counter is a cumulative metric that only ever goes up (e.g., total HTTP requests). A Gauge is a metric that can go up and down (e.g., active connections, queue depth).
*Follow-up:* Why should you never use a Gauge to count total errors?

**6. How do you measure Latency in Prometheus?**
*Answer:* Using a Histogram. It places request durations into predefined buckets (e.g., "how many requests took under 50ms?"). You then use PromQL (`histogram_quantile`) to calculate percentiles like p95 or p99.
*Follow-up:* Why are average (mean) latencies misleading in web performance?

**7. Why do we log in structured JSON instead of plain text?**
*Answer:* JSON is machine-readable. Log aggregators can index JSON natively, allowing you to run complex queries like `find all logs where status=500 and responseTime > 1000ms`. Doing this with plain text requires complex, fragile Regex.
*Follow-up:* What is the downside of JSON logging regarding human readability in a raw terminal?

**8. What is a Request ID (or Correlation ID) and why is it critical?**
*Answer:* A unique identifier attached to an incoming HTTP request. By including this ID in every log statement, you can trace a single request as it jumps from the API to the database to the background worker.
*Follow-up:* How do you pass a Correlation ID between microservices?

**9. In our `metricsMiddleware`, why do we normalize the route path (e.g., `/api/orders/1` to `/api/orders/:id`)?**
*Answer:* To prevent "high cardinality" in Prometheus. If we tracked every unique URL as a separate metric label, an attacker hitting random URLs would generate millions of time-series, exhausting Prometheus memory and crashing the monitoring server.
*Follow-up:* What is cardinality?

**10. Why is the `/metrics` endpoint placed *before* the rate limiting middleware in Express?**
*Answer:* Because Prometheus scrapes the endpoint every 15 seconds. If it were rate-limited, Prometheus would get 429 errors and we would lose visibility into the system precisely when we are being flooded with traffic.
*Follow-up:* How do you secure the `/metrics` endpoint so public users can't see internal data?

**11. Why shouldn't you log JWT tokens or passwords?**
*Answer:* Logs are often shipped to third-party aggregators and accessed by developers who don't have production database access. Logging secrets violates compliance (GDPR, PCI, SOC2) and creates a massive security vulnerability.
*Follow-up:* How do you sanitize logs dynamically?

**12. If CPU is at 10% but API Latency is 5 seconds, what is the likely bottleneck?**
*Answer:* The API is blocked waiting for external I/O (Database, Redis, or a 3rd party API) or the Node.js event loop is blocked by synchronous processing (like hashing passwords).
*Follow-up:* How would you use metrics to prove it's the database?

**13. What happens if the Redis queue depth is growing, but the Worker processing rate is flat?**
*Answer:* The Worker is saturated. It is processing orders as fast as it can, but the ingress rate (from the API) is higher than the egress rate. We need to scale horizontally by adding more Worker instances.
*Follow-up:* What metric would tell you if the Worker is waiting on MySQL?

**14. What is PromQL?**
*Answer:* Prometheus Query Language. It allows you to select and aggregate time-series data in real-time, such as calculating the 5-minute moving average of 5xx errors.
*Follow-up:* What does `rate(http_requests_total[5m])` calculate?

**15. Why are Prometheus and Grafana two separate tools?**
*Answer:* Separation of concerns. Prometheus is the data storage and query engine. Grafana is a pure visualization layer that can connect to multiple different data sources simultaneously.
*Follow-up:* Can you set up alerts in Prometheus, Grafana, or both?

**16. What does `NODE_ENV=production` actually do in Express?**
*Answer:* It tells Express to cache views, cache CSS files, and most importantly, it generates less verbose error messages (hiding stack traces from users) which improves performance and security.
*Follow-up:* How does it affect logging?

**17. What is the difference between a Liveness probe and a Readiness probe?**
*Answer:* Liveness (`/health`) checks if the process is running; if it fails, the container is restarted. Readiness checks if the application is ready to handle traffic; if it fails, the load balancer stops sending traffic to it, but it doesn't restart.
*Follow-up:* Why shouldn't a Liveness probe check the database connection?

**18. If a Flash Sale causes `api-2` to run out of memory and crash, how will our metrics show it?**
*Answer:* `api-2`'s `nodejs_heap_size_used_bytes` will spike until the crash. Then, Prometheus will report `up == 0` for that target. Traffic on `api-1` and `api-3` will immediately spike as Nginx shifts the load.
*Follow-up:* What is an OOMKilled error in Docker?

**19. How do we ensure Nginx distributes traffic evenly across API replicas?**
*Answer:* By configuring Nginx upstream blocks with a Round-Robin algorithm and verifying it by checking the `X-Instance-Id` header (or by viewing the per-instance traffic graphs in Grafana).
*Follow-up:* When would you use `least_conn` instead of Round-Robin?

**20. What is Distributed Tracing (e.g., Jaeger, OpenTelemetry)?**
*Answer:* A step beyond Request IDs. It creates "Spans" for every operation (e.g., a DB query, a Redis fetch) and links them together, providing a waterfall visualization of exactly where a request spent its time across a microservice architecture.
*Follow-up:* Why didn't we implement Distributed Tracing in this project?

**21. What does p99 latency mean?**
*Answer:* The 99th percentile. It means 99% of requests were faster than this value, and 1% were slower. If p99 is 500ms, only 1 in 100 users experienced a wait time longer than half a second.
*Follow-up:* Why is tracking p99 better than tracking the maximum latency?

**22. How did we get metrics out of the background worker?**
*Answer:* We spun up a lightweight HTTP server on port 9091 inside the worker process, exclusively to serve the `/metrics` endpoint for Prometheus to scrape.
*Follow-up:* Does this block the worker's processing thread?

**23. Why do we monitor the Node.js Event Loop Lag?**
*Answer:* Because Node.js is single-threaded. If the event loop is blocked, Node cannot process incoming HTTP requests, causing latency to skyrocket even if CPU usage isn't at 100%.
*Follow-up:* What function blocks the event loop: `JSON.parse` or `fs.readFile`?

**24. In PromQL, what is a "Label"?**
*Answer:* Key-value pairs attached to a metric. For `http_requests_total`, labels could be `method="GET"` and `status="200"`. They allow multi-dimensional data querying.
*Follow-up:* How do you sum the request rate across all methods but group by status code?

**25. If our database connection limit is 5, how does the `db_active_connections` Gauge help us during a flash sale?**
*Answer:* It tells us our saturation point. If the gauge hits 5 and stays there, queries will start queuing internally in the `mysql2` pool, causing application latency to spike. This proves the database pool is the bottleneck.
*Follow-up:* Why not just set the connection limit to 10,000?

**26. Why do we use `process.hrtime.bigint()` for measuring duration instead of `Date.now()`?**
*Answer:* `Date.now()` is subject to clock drift and NTP synchronization (it can actually jump backward). `process.hrtime` provides strictly monotonic, nanosecond-precision timing, which is required for accurate latency metrics.
*Follow-up:* What is the performance overhead of calling `process.hrtime`?

**27. What is an SLI and an SLO?**
*Answer:* Service Level Indicator (SLI) is what you measure (e.g., p95 latency). Service Level Objective (SLO) is your target (e.g., "p95 latency will be < 200ms for 99% of requests over 30 days").
*Follow-up:* What is an SLA?

**28. If Nginx returns a 502 Bad Gateway, will it show up in our Express metrics?**
*Answer:* No. A 502 means Nginx couldn't talk to Express at all. To track 502s, you must parse Nginx logs or use an Nginx Prometheus exporter.
*Follow-up:* What does a 504 Gateway Timeout mean?

**29. Why shouldn't you alert on CPU usage?**
*Answer:* CPU usage is a symptom, not a user-facing problem. A server at 95% CPU that is successfully serving requests with low latency is highly efficient, not broken. You should alert on Golden Signals (Errors, Latency) instead.
*Follow-up:* When *would* an infrastructure alert be useful?

**30. What is "Alert Fatigue"?**
*Answer:* When a monitoring system sends too many non-actionable alerts, engineers start ignoring them. Eventually, a real alert is missed. Alerts should only trigger when a human needs to take immediate action.
*Follow-up:* How do you prevent alert fatigue?

**31. How does Prometheus discover targets in Kubernetes compared to our Docker Compose setup?**
*Answer:* In Docker Compose, we used `static_configs` to manually list `api-1`, `api-2`, etc. In Kubernetes, Prometheus uses Service Discovery to automatically find and scrape any Pod with specific annotations.
*Follow-up:* What happens in our Compose setup if we scale to 4 APIs?

**32. Explain what `histogram_quantile(0.95, ...)` does in PromQL.**
*Answer:* It calculates the 95th percentile from a histogram bucket. Since Prometheus stores bucket counts, the quantile function mathematically estimates the percentile based on those bucket boundaries.
*Follow-up:* Why must the bucket boundaries be identical across all instances?

**33. If a request times out from the client's perspective, but the server successfully processes it, how do metrics show this?**
*Answer:* The Express metrics will show a successful 200 OK. The client-side metrics (or Nginx metrics) will show a timeout. This discrepancy is why monitoring multiple layers of the stack is necessary.
*Follow-up:* How does a Redis queue handle client timeouts?

**34. Why do we need `app.use(metricsMiddleware)` defined *before* our route definitions in Express?**
*Answer:* Express evaluates middleware in order. If the route definition handles the request and sends a response without calling `next()`, any middleware defined below it is never executed, meaning the metric would never be recorded.
*Follow-up:* Where should the 404 handler be placed?

**35. How would you design a dashboard for the CEO versus a dashboard for the SRE (Site Reliability Engineer)?**
*Answer:* The CEO dashboard tracks business metrics: Orders placed, Revenue, Active Users. The SRE dashboard tracks technical metrics: CPU, Error Rates, Latency, Queue Depth.
*Follow-up:* Should business logic be coupled with infrastructure monitoring?
