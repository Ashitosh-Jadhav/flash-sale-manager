# Nginx Reverse Proxy & Horizontal Scaling

## 1. Why Do We Need Nginx?

### Concepts
- **Nginx**: A high-performance web server, reverse proxy, and load balancer written in C.
- **Reverse Proxy**: A server that sits *in front* of backend servers and intercepts client requests. (A *forward proxy* like a VPN sits in front of *clients* and intercepts outbound requests).
- **Load Balancer**: A device/software that distributes network traffic across multiple servers.

### Why not expose Express directly?
1. **Single-threaded Limitation**: Node.js runs on a single thread. One Express instance can only utilize 1 CPU core. If your server has 16 cores, exposing Express directly leaves 15 cores idle.
2. **Performance**: Nginx is asynchronous, event-driven, and designed to handle 10,000+ concurrent connections efficiently. Node.js is better suited for application logic, not raw connection management or static file serving.
3. **Security & Obfuscation**: Clients only interact with Nginx. The internal architecture (IPs, ports, number of servers) remains hidden.
4. **Availability**: If an Express instance crashes, Nginx instantly stops routing traffic to it, ensuring clients never see a connection error.

## 2. Horizontal vs Vertical Scaling

- **Vertical Scaling (Scaling Up)**: Adding more CPU/RAM to a single server.
  - *Pros*: Simple, no code changes.
  - *Cons*: Hardware limits, expensive, single point of failure (if the server dies, the app dies).
- **Horizontal Scaling (Scaling Out)**: Adding more servers (replicas).
  - *Pros*: Infinite scaling, redundancy, cheaper hardware.
  - *Cons*: Architecture complexity. The application MUST be stateless.

During a flash sale, traffic can spike 100x. Vertical scaling is too slow and expensive to accommodate this. Horizontal scaling allows us to spin up 50 containers right before the sale and destroy them afterward.

## 3. The Stateless API

For horizontal scaling to work, the API must be **Stateless**.
Stateless means the API instance does not remember anything from previous requests. Any replica (`api-1`, `api-2`, `api-3`) can handle a request.

**Our Architecture is Stateless:**
- **Authentication**: We use JWTs. The token contains the identity. Any replica can verify the signature using the shared secret. If we used in-memory sessions (e.g., `express-session`), a user logged into `api-1` would be "unauthenticated" if routed to `api-2`.
- **Rate Limiting**: We store counters in Redis, not in JavaScript memory. If 3 replicas check limits, they all query the same Redis bucket.
- **State**: Orders and stock are in MySQL. The queue is in Redis.

## 4. Load Balancing Algorithms

Nginx supports several ways to distribute traffic:
1. **Round Robin (Default)**: Sequential distribution (api-1 → api-2 → api-3 → api-1). 
   - *Why we use it*: Our API is stateless, and our replicas are identical Docker containers. Equal distribution is perfectly fair.
2. **Least Connections**: Sends requests to the server with the fewest active connections.
   - *Use case*: When requests have vastly different processing times.
3. **IP Hash**: The client's IP determines which server they hit.
   - *Use case*: "Sticky sessions" for stateful legacy apps. We don't need this.
4. **Weighted**: `server api-1 weight=3; server api-2 weight=1;`
   - *Use case*: When servers have different hardware capacities.

## 5. Proxy Headers (`X-Forwarded-For`)

When Nginx proxies a request, Express thinks the request came from Nginx's internal Docker IP (e.g., `172.18.0.2`).
If Express uses `req.ip` for rate limiting, **every client will share the same rate-limit bucket**, and the system will block everyone after 100 requests.

**The Fix:**
1. Nginx must attach the client's real IP: `proxy_set_header X-Forwarded-For $remote_addr;`
2. Express must be told to trust Nginx: `app.set('trust proxy', 1);`

*Security Warning*: Never enable `trust proxy` if your app is directly exposed to the internet, or clients can spoof the `X-Forwarded-For` header and bypass IP bans.

## 6. Docker Compose Architecture

We run **one** Nginx container and **three** identical API containers.
- All three use the exact same Docker image (built once).
- Nginx listens on port 80. The APIs do NOT expose ports to the host machine.
- Nginx configuration uses Docker's internal DNS (`api-1:3000`) to route traffic.

## 7. Performance & Bottlenecks

Horizontal scaling the API increases **HTTP handling capacity**, but it does NOT automatically make the entire system faster.
- **API Scaling**: Handles more concurrent incoming requests (e.g., parsing JSON, validating JWTs).
- **Redis**: The queue and rate limiter must be fast enough to handle the combined load of all APIs.
- **Worker Scaling**: Handles more queue consumption.
- **MySQL**: The ultimate bottleneck. If 10 workers try to lock the same product row, MySQL row-lock contention limits throughput regardless of how many API replicas exist.

*Conclusion*: We scaled the API horizontally to handle connection floods, while relying on the asynchronous Redis Queue to protect MySQL from transaction contention.

## 8. Nginx Failure Modes

- **If API-2 dies**: Nginx detects connection failures and routes around it. Clients experience zero downtime.
- **If Nginx dies**: Nginx is a single point of failure in our local architecture. In production AWS, you would use an ALB (Application Load Balancer) which handles its own high availability.
