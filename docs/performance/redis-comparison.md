# Redis Asynchronous Architecture vs Synchronous Architecture

This document compares the performance of the Phase 6 synchronous architecture (Express → MySQL) with the Phase 7 asynchronous architecture (Express → Redis → Worker → MySQL).

## 1. Architectural Changes

### Original Architecture (Synchronous)
```
Client
  ↓ (HTTP)
Express API (waits for MySQL)
  ↓ (SQL, acquires row lock)
MySQL (slow)
  ↓ (Returns row lock)
Express API
  ↓ (201 Created)
Client
```
**Problem:** The API holds the HTTP connection open while waiting for the MySQL row lock. At high concurrency, requests wait behind each other, exhausting the DB connection pool and skyrocketing response latency.

### New Architecture (Asynchronous)
```
Client
  ↓ (HTTP)
Express API (creates 'queued' record, pushes to Redis)
  ↓ (Returns 202 Accepted immediately)
Client

(Meanwhile, in the background)
Redis Queue
  ↓ (BRPOP)
Worker Process
  ↓ (SQL, acquires row lock)
MySQL (processes at its own pace)
  ↓ (Updates status to 'confirmed')
Worker Loop repeats
```
**Solution:** The API offloads the slow work to a queue and immediately responds to the user. The bottleneck (MySQL) still exists, but it no longer blocks the API from accepting new requests.

## 2. Load Test Results Comparison (k6)

Both tests ran for 10s using the same methodology, same machine, and same k6 script parameters.

### Throughput (Requests Per Second)

| VUs | Sync Architecture (Baseline) | Async Architecture (Redis) |
|----:|-----------------------------:|---------------------------:|
| 25  | **214 RPS**                  | 191 RPS                    |
| 50  | 199 RPS                      | **309 RPS**                |
| 100 | 204 RPS                      | **317 RPS**                |

**Observation:** At low concurrency (25 VUs), the synchronous approach was slightly faster because the overhead of Redis and inter-process communication wasn't offset by lock contention. At high concurrency (50-100 VUs), the async API is roughly **50% faster** at accepting requests.

### API Latency (p95)

| VUs | Sync Architecture (Baseline) | Async Architecture (Redis) |
|----:|-----------------------------:|---------------------------:|
| 25  | **29ms**                     | 58ms                       |
| 50  | 196ms                        | **112ms**                  |
| 100 | 415ms                        | **255ms**                  |

**Observation:** At 100 VUs, the API response time dropped from 415ms to 255ms. Users get the "Order Accepted" screen much faster.

## 3. Two Types of Latency

We must distinguish between two metrics:

### 1. API Response Latency (Measured above)
How long the user waits to see the "Processing Order..." screen.
- **Sync:** High under load.
- **Async:** Low under load (just inserting a quick 'queued' row and Redis `LPUSH`).

### 2. End-to-End Order Completion Latency
How long until the order is actually `confirmed` in MySQL and stock is decremented.
- **Sync:** Equal to API response latency.
- **Async:** Equal to API response latency + **Queue Wait Time** + Worker Processing Time.

**Crucial Point:** Adding Redis **did not make MySQL faster**. MySQL can still only process ~200 orders per second due to the row-level `FOR UPDATE` lock.
At 100 VUs, the API accepts ~317 requests per second, but the worker can only process ~200 per second. The remaining 117 requests per second accumulate in the Redis queue. If this burst lasts for 10 seconds, the queue will have ~1,170 jobs in it, and the last person in line will wait ~5 seconds for their order to actually confirm.

## 4. Why Did We Do This?

If MySQL is still the bottleneck, why add Redis?

1. **User Experience:** The user gets an immediate response (202 Accepted) and a loading spinner on the frontend, rather than a frozen browser waiting for a stalled HTTP connection.
2. **Preventing Timeouts:** Browsers, load balancers (Nginx), and CDNs will drop HTTP connections if they take too long (e.g., 30s timeout). By returning a 202 Accepted immediately, we prevent network-level timeouts during massive spikes.
3. **Database Protection:** The worker protects MySQL. Even if 10,000 users hit the API, the queue absorbs the shock. The worker processes them at a controlled pace, preventing database crashes and connection pool exhaustion.
4. **Resilience:** If MySQL crashes, the API can still accept orders (they wait in Redis). When MySQL comes back, the worker resumes. (This requires a Redis-first architecture, but even our DB-first architecture is more resilient to DB slowdowns).

## 5. Queue Design & Failure Handling

- **DB-First Design:** We insert a `status='queued'` row in MySQL *before* pushing to Redis. This prevents "phantom jobs" in Redis if the DB fails, ensuring MySQL remains the source of truth.
- **Idempotency:** The worker checks if an order is already `confirmed` before processing, preventing double-processing if a job is delivered twice.
- **Dead Letter Queue (DLQ):** Poison messages (unparseable JSON) are routed to a DLQ instead of crashing the worker.
- **Worker Concurrency:** We are currently running 1 worker process. Adding more workers would *not* increase throughput significantly, because all workers would contend for the same MySQL row lock (the primary bottleneck). To fix *that*, we would need to shard the database or move inventory management entirely into Redis (Phase 8).
