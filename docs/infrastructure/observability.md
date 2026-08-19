# Monitoring, Logging & Observability

This document details the observability stack implemented in Phase 13 for the Flash Sale Manager.

---

## 1. Monitoring vs. Observability
- **Monitoring** is an action. You monitor a system to know *when* something goes wrong (e.g., "CPU is at 100%"). It tells you that the system is broken.
- **Observability** is a property of the system. An observable system generates enough data so you can figure out *why* it broke without deploying new code.

## 2. The Three Pillars of Observability
Our system implements all three pillars:
1. **Metrics (Prometheus):** Aggregated numerical data over time (e.g., "Requests per second"). Answers: *What is happening?*
2. **Logs (Structured JSON):** Discrete events that happened (e.g., "Order 42 processed"). Answers: *What happened?*
3. **Traces (Request IDs):** Connecting events across boundaries. We use HTTP `X-Request-Id` to track a user's action from Nginx → API → Redis → Worker. Answers: *Where did this request spend its time?*

---

## 3. The Four Golden Signals
We monitor the four golden signals recommended by Google SREs:
1. **Latency:** How long it takes to service a request. Tracked via `http_request_duration_seconds` (Prometheus Histogram).
2. **Traffic:** How much demand is being placed on the system. Tracked via `http_requests_total`.
3. **Errors:** The rate of requests that fail. Tracked via `http_requests_total{status="500"}`.
4. **Saturation:** How "full" the system is. Tracked via `redis_queue_depth` and `db_active_connections`.

---

## 4. Structured Logging
Instead of `console.log("Order confirmed")`, we log structured JSON:
```json
{
  "timestamp": "2026-08-19T10:00:00Z",
  "level": "info",
  "service": "worker",
  "message": "Order confirmed",
  "orderId": 42,
  "durationMs": 150
}
```
**Why?** Because machines (like Elasticsearch, Loki, or Splunk) can easily index, search, and graph JSON. We intentionally **do not** log JWTs, passwords, or PII to maintain security and compliance.

---

## 5. Architecture: Prometheus & Grafana
- **Prometheus** (Port 9090): A pull-based time-series database. Every 15 seconds, it scrapes `GET /metrics` on `api-1`, `api-2`, `api-3`, and the `worker`.
- **Grafana** (Port 3001): A visualization tool. It connects to Prometheus (data source) and renders dashboards using PromQL queries.

### Why Pull vs. Push?
Prometheus *pulls* data from the apps. If Prometheus crashes, the API doesn't care. If the API pushed data to Prometheus, it would need retry logic, connection pooling, and error handling just for metrics.

---

## 6. Request Correlation
Every incoming HTTP request receives an `X-Request-Id` (a UUID). This ID is injected into the Express request object and logged with every JSON log entry. 
If a user reports an error, you can search the logs for that specific Request ID and see their exact journey through the system.

---

## 7. Metrics Endpoint vs Health Checks
- `GET /health` (Liveness/Readiness): Returns a simple 200 OK. Nginx uses this to decide if it should route traffic to this container. It says, *"I am alive."*
- `GET /metrics` (Observability): Returns thousands of lines of data (CPU usage, event loop lag, request counters). It says, *"Here is how I am feeling."*

---

## 8. Identifying Bottlenecks During a Flash Sale
When running a load test, you check the signals in order:
1. Look at **Traffic (Req/sec)**: Are we receiving the expected load?
2. Look at **Latency (p95)**: Is the API slowing down? If yes, look at Saturation.
3. Look at **Saturation (Queue Depth / DB Connections)**: 
   - If the Redis queue is huge but DB connections are low, the worker is the bottleneck.
   - If the API latency is high but CPU is low, the event loop is blocked (likely synchronous crypto or heavy JSON parsing).
   - If DB active connections are maxed out, the database is the bottleneck.
