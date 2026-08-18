# CI/CD Pipeline — Flash Sale Manager

## 1. CI/CD Fundamentals

### What is CI (Continuous Integration)?
Developers merge their code changes into a shared repository frequently (daily or more). Each merge triggers an **automated build and test** process. If tests fail, the team is notified immediately.

**Without CI:** Developer A works on a feature for 3 weeks. Developer B works on another. When they merge, there are 500 merge conflicts and incompatible changes. This is called "integration hell."

**With CI:** Every push triggers automated testing. Issues are caught within minutes, not weeks.

### What is CD (Continuous Delivery vs Continuous Deployment)?
- **Continuous Delivery:** Code is automatically tested and built into a deployable artifact. Deployment to production requires a **manual approval** (a human clicks "Deploy").
- **Continuous Deployment:** Code goes from push → test → build → production **automatically**, with no human intervention.

**Our pipeline uses Continuous Delivery** — the pipeline builds and tests automatically, but deployment happens as the final automated stage. In a real production environment, you'd add a manual approval gate before deployment.

### Why CI/CD?
1. **Prevents broken deployments.** Code that fails tests NEVER reaches production.
2. **Reduces human error.** Manual deploys involve copying files, running scripts, restarting services. One missed step = downtime.
3. **Provides confidence.** Every deployed version has passed the same automated checks.
4. **Enables rollback.** Every build produces a uniquely tagged Docker image. Rolling back = deploying the previous image.

---

## 2. Jenkins Architecture

### Components
- **Controller (Master):** The Jenkins server that orchestrates pipelines, stores configuration, and provides the web UI. Runs at `http://localhost:8080`.
- **Agent (Slave):** A machine that executes the actual build steps. In our setup, the controller also acts as the agent (single-node).
- **Job:** A single unit of work (e.g., "build the flash sale app").
- **Pipeline:** A series of automated stages defined in a `Jenkinsfile`. 
- **Stage:** A logical grouping of steps (e.g., "Test", "Build", "Deploy").
- **Step:** A single command within a stage (e.g., `sh 'npm ci'`).
- **Workspace:** A directory on the agent where Jenkins checks out code and runs the build.
- **Build:** A single execution of a pipeline. Each build has a unique number (#1, #2, ...).

### How Jenkins Detects Changes
- **Polling (SCM Polling):** Jenkins checks GitHub every N minutes for new commits. Simple but wasteful — constant API calls even when nothing changed.
- **Webhooks:** GitHub POSTs to Jenkins when a push occurs. Instant, efficient. Requires Jenkins to be accessible from the internet (or use tools like ngrok for local dev).

**Our approach:** For local development, we use manual triggers or SCM polling. In production, webhooks are strongly preferred.

---

## 3. Pipeline Stages (Our Design)

```
┌──────────┐    ┌────────────┐    ┌────────────┐    ┌──────────────┐
│ Checkout │ → │ Validate   │ → │  Static    │ → │ Docker Build │
│          │    │ Deps       │    │  Checks    │    │              │
└──────────┘    └────────────┘    └────────────┘    └──────────────┘
                                                          │
    ┌────────────┐    ┌──────────┐    ┌──────────────┐    │
    │ Smoke Test │ ← │  Deploy  │ ← │ Integration  │ ←──┘
    │            │    │          │    │ Tests        │
    └────────────┘    └──────────┘    └──────────────┘
```

### Stage 1: Checkout
Pulls the latest code from the Git repository. Captures the commit SHA for image tagging.

### Stage 2: Dependency Validation
Runs `npm ci` to install dependencies. `npm ci` FAILS if `package-lock.json` is out of sync with `package.json`, catching stale lock files before they cause mysterious bugs.

### Stage 3: Static Checks
Verifies the application source code can be loaded without syntax errors. In a more mature project, this would include ESLint or TypeScript compilation.

### Stage 4: Docker Build
Builds the Docker image and tags it with the git commit SHA. This ensures every image is traceable to a specific commit.

### Stage 5: Integration Tests
Starts the FULL Docker Compose stack (MySQL, Redis, APIs, Worker, Nginx) and runs end-to-end tests against it. Verifies the system works as a whole, not just individual components.

### Stage 6: Deploy
Stops the old stack and starts the new one using the freshly built image. Uses a "recreate" deployment strategy (brief downtime acceptable for local dev).

### Stage 7: Smoke Test
Hits `/health` and `/api/products` through Nginx to verify the deployment is alive and functional.

---

## 4. Image Tagging Strategy

```
flash-sale-manager:a1b2c3d4   ← Git SHA (immutable, traceable)
flash-sale-manager:latest      ← Convenience only (NEVER used for deployment)
```

### Why Git SHA?
1. **Immutable:** Once tagged, the image never changes. `a1b2c3d4` always points to the same code.
2. **Traceable:** `git log a1b2c3d4` shows exactly what code is running.
3. **Rollback:** To roll back, deploy the previous SHA tag.

### Why NOT only `:latest`?
- `:latest` is mutable. Each build overwrites it.
- You can't roll back to "the previous latest."
- You can't tell which commit is running in production.

---

## 5. Secrets Management

### What should NEVER be in Git:
- Database passwords (`DB_PASSWORD`)
- JWT secrets (`JWT_SECRET`)
- API keys
- GitHub tokens

### Where secrets belong:
- **Jenkins Credentials Manager:** Stores secrets encrypted. Inject them into the pipeline as environment variables at runtime.
- **docker-compose.yml environment:** Secrets are passed to containers via env vars, not baked into the image.
- **`.env` file:** Used for local development only. Excluded from Git via `.gitignore` and from Docker images via `.dockerignore`.

---

## 6. Deployment Strategies

| Strategy | How it works | Downtime | Complexity | Our choice? |
|----------|-------------|----------|------------|-------------|
| **Recreate** | Stop old, start new | Brief (~5-10s) | Low | ✅ Yes |
| **Rolling** | Update one replica at a time | Zero | Medium | ❌ Requires K8s |
| **Blue-Green** | Run two full stacks, switch traffic | Zero | High | ❌ Doubles resources |
| **Canary** | Route 5% of traffic to new version | Zero | Very High | ❌ Requires service mesh |

We use **Recreate** because Docker Compose doesn't support rolling updates natively, and brief downtime is acceptable for our learning environment.

---

## 7. Database Migrations

When a new version adds a column or table, the database schema must be updated. This is called a **migration**.

### Important Rules:
1. **Forward-only migrations.** Never modify a deployed migration — create a new one.
2. **Backward-compatible changes.** Add columns with defaults, don't rename/drop columns in the same deploy.
3. **Separate from app deployment.** Run migrations BEFORE deploying the new code.
4. **Idempotent.** Migrations should use `IF NOT EXISTS` to be safely re-runnable.

Our current schema is managed via `docker/mysql/init.sql` with `CREATE TABLE IF NOT EXISTS`. For future changes, we'd add numbered migration files (e.g., `002-add-order-notes.sql`).

---

## 8. Pipeline Failure Behavior

```
Stage 1: ✅ Checkout     → Continue
Stage 2: ✅ Validate     → Continue
Stage 3: ❌ Static Check → STOP (no Docker build, no deploy)
Stage 4: ⏭️ SKIPPED
Stage 5: ⏭️ SKIPPED
Stage 6: ⏭️ SKIPPED
Stage 7: ⏭️ SKIPPED
```

**Critical Rule:** If ANY stage fails, ALL subsequent stages are skipped. Broken code NEVER reaches deployment. This is the core promise of CI/CD.

---

## 9. Rollback Strategy

```
v1 (SHA: a1b2c3d4) — Working ✅
v2 (SHA: e5f6g7h8) — Broken ❌

Rollback:
  docker compose down
  Set IMAGE_TAG=a1b2c3d4
  docker compose up -d
```

Since every build produces a uniquely tagged image, rollback is trivial — just deploy the previous SHA. The image still exists in the local Docker image cache.

---

## 10. Security Considerations

1. **Docker Socket:** Mounting `/var/run/docker.sock` gives Jenkins root-equivalent access to Docker. Acceptable for local dev, but in production, use a dedicated build agent.
2. **Jenkins Credentials:** Use the Jenkins Credentials Manager (not plaintext in Jenkinsfile) for GitHub tokens, Docker registry passwords, etc.
3. **Untrusted PRs:** Never run CI on pull requests from untrusted contributors without sandboxing — they could inject malicious `Jenkinsfile` stages.
4. **Image Scanning:** In production, add a stage to scan Docker images for vulnerabilities (e.g., Trivy, Snyk).
