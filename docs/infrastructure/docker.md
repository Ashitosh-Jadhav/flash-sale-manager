# Flash Sale Manager — Docker Containerization

## 1. Why Docker?

Before Docker, developers faced the "Works on my machine" problem:
- Developer A has Node 20, MySQL 8, Redis 7. The app works perfectly.
- Developer B has Node 18, MySQL 5.7. The app crashes because MySQL 5.7 doesn't support a specific feature.
- Production runs Node 16 and fails entirely.

**Docker solves this by packaging the application WITH its environment.** It ensures that the exact same Node.js version, OS libraries, and dependencies run consistently on every developer's machine and in production.

### Containers vs Virtual Machines
- **Virtual Machine (VM):** Virtualizes the hardware. Runs a full Guest OS (Windows/Linux) on top of a Host OS. Heavy, slow to start, consumes GBs of RAM just for the OS.
- **Container:** Virtualizes the OS. Shares the Host OS kernel but isolates processes, network, and file systems. Lightweight, starts in milliseconds, consumes minimal memory.
- **Process:** A container is simply an isolated Linux process running on your machine.

## 2. Image vs Container

**Analogy:**
- **Image:** A blueprint or a class in OOP. It is **immutable** (cannot be changed). It contains the OS files, application code, and dependencies.
- **Container:** A house built from the blueprint or an object instance. It is a running instance of an image. It has a writable layer where temporary files can be created.

When we run `docker build`, we bake our code into a static Image. When we run `docker compose up`, Docker creates running Containers from those Images.

## 3. Dockerfile Design

Our API and Worker share a single Dockerfile (`Dockerfile`) because they share the same codebase and dependencies. We use `docker-compose.yml` to override the startup command (`CMD`) for the worker.

### Key Decisions:
- **`FROM node:20-alpine`**: We use Alpine Linux because it is tiny (~5MB). This reduces our final image size from ~1GB to ~150MB, minimizing attack surface and deployment time.
- **`RUN apk add ...`**: Alpine doesn't have build tools (gcc, make) by default. We temporarily install them to compile `bcrypt` (a native C++ module), then delete them in the same layer to save space.
- **Layer Caching**: We `COPY package.json` and run `npm ci` BEFORE copying the source code. If we only change a JS file, Docker reuses the cached `node_modules` layer, reducing build times from minutes to seconds.
- **Non-root User**: We create and use `appuser`. Running as root inside a container is a security risk; if the app is compromised, a non-root user limits the attacker's blast radius.
- **Exec-form CMD**: We use `CMD ["node", "src/server.js"]` instead of `CMD node src/server.js`. The exec form makes Node run as PID 1, meaning it receives `SIGTERM` signals directly from Docker for graceful shutdown.

## 4. Container Networking

Inside a container, `localhost` refers to the container itself, NOT your laptop or other containers.
If the API container tries to connect to `DB_HOST=localhost`, it connects to itself and fails.

**Docker Networks (Service Discovery)**
Docker Compose creates an isolated virtual network (`flash-sale-net`). It provides built-in DNS.
- When the API connects to `mysql`, Docker's DNS resolves it to the internal IP of the MySQL container.
- When the Worker connects to `redis`, it resolves to the Redis container.

## 5. Environment Variables

- **Build-time**: Variables baked into the image (e.g., `ENV NODE_ENV=production` in Dockerfile).
- **Runtime**: Variables passed when starting the container (via docker-compose or `.env`).

We NEVER bake secrets (like `DB_PASSWORD` or `JWT_SECRET`) into the image. Images can be pushed to public registries (like Docker Hub) and inspected by anyone. Secrets must only exist at runtime.

## 6. Persistence & Volumes

If we delete a MySQL container, all database data is lost by default.
To solve this, we map a **Named Volume** (`mysql-data`) to `/var/lib/mysql` inside the container.
- `docker compose down`: Removes containers. Data SURVIVES in the volume.
- `docker compose down -v`: Removes containers AND volumes. Data is DESTROYED.

## 7. Database Initialization

MySQL's official Docker image executes `.sql` scripts placed in `/docker-entrypoint-initdb.d/` on its FIRST startup (when the data volume is empty). We map `docker/mysql/init.sql` to this directory to automatically create the `users`, `products`, and `orders` tables. The scripts are written with `IF NOT EXISTS` to be idempotent.

## 8. Health Checks & Dependency Ordering

`depends_on` only ensures a container is started, not that the service inside is ready. MySQL can take 20 seconds to boot. If the API starts immediately, it will crash.
We added `healthcheck` to MySQL (`mysqladmin ping`) and Redis (`redis-cli ping`). The API and Worker are configured with `depends_on: mysql: condition: service_healthy`, meaning Docker waits for the ping to succeed before launching the API.

## 9. Failure Scenarios Tested

1. **Worker Crashes/Restarts**: API still functions. Orders are queued in Redis. When the worker restarts, it resumes pulling from the queue (zero data loss).
2. **Redis Crashes**: API orders fail (Fail Open strategy allows General API, but async orders require Redis). Rate limiting resets. Once Redis restarts, new orders succeed.
3. **MySQL Crashes**: API reads fail. Worker processes fail to lock rows and either abort or retry.
4. **Graceful Shutdown**: When `docker compose stop api` is run, Docker sends `SIGTERM`. Our `server.js` catches it, stops accepting new HTTP connections, finishes existing ones, and cleanly closes the DB pool before exiting.

## 10. Commands Used

- `docker compose build --no-cache`: Force rebuild images from scratch.
- `docker compose up -d`: Start the stack in the background (detached).
- `docker compose ps`: List running containers.
- `docker compose logs -f api`: Follow the logs of the API container.
- `docker compose stop worker`: Stop the worker gracefully.
- `docker compose down`: Stop and remove containers and network.
- `docker compose down -v`: DESTROY everything including the database volume.
