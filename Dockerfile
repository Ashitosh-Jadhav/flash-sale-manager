# ============================================
# Dockerfile — Flash Sale Manager (API + Worker)
# ============================================
# This single Dockerfile builds ONE image that can run as EITHER
# the API server or the background worker, depending on the CMD
# provided at runtime (in docker-compose.yml).
#
# WHY one image, two containers:
# - API and worker share the same Node.js codebase and dependencies.
# - Building separate images would duplicate 95% of the content.
# - docker-compose overrides the CMD to start different processes.
#
# IMAGE CHOICE: node:20-alpine
# - node:20 = LTS (Long Term Support), stable for production.
# - alpine = minimal Linux distro (~5MB vs ~900MB for Debian).
# - Result: Our image is ~150MB instead of ~1GB.
# - Trade-off: alpine uses musl libc instead of glibc. Some native
#   modules (like bcrypt) need compilation. We handle this below.

# ============================================
# Stage: Build + Runtime
# ============================================
# WHY NOT multi-stage: Our app is pure Node.js. There's no compiled
# binary to extract. Multi-stage builds shine for Go/Rust/C++ where
# the build toolchain is massive. For Node.js, the runtime IS the
# build tool. A multi-stage build would save only the devDependencies
# (~2MB nodemon) — not worth the complexity.

FROM node:20-alpine

# ============================================
# WORKDIR — Set the working directory inside the container
# ============================================
# All subsequent COPY, RUN, and CMD commands execute relative to this path.
# If it doesn't exist, Docker creates it automatically.
# Think of it like: cd /app (but persistent across Dockerfile instructions).
WORKDIR /app

# ============================================
# Install OS-level dependencies for bcrypt
# ============================================
# WHY: bcrypt is a native Node.js module (C++ compiled with node-gyp).
# Alpine Linux doesn't include build tools by default.
# We need: python3, make, g++ to compile bcrypt during npm install.
#
# --no-cache: Don't store the package index on disk (keeps image small).
# --virtual .build-deps: Groups these packages under a label so we can
# remove them all at once after npm install completes.
RUN apk add --no-cache --virtual .build-deps python3 make g++

# ============================================
# COPY package files FIRST (Docker layer caching)
# ============================================
# WHY copy package.json BEFORE the source code?
# Docker caches each layer. If package.json hasn't changed,
# Docker reuses the cached npm install layer — saving minutes.
# If we COPY . first, ANY source code change would invalidate
# the npm install cache and reinstall all dependencies.
COPY package.json package-lock.json ./

# ============================================
# Install dependencies
# ============================================
# npm ci (Clean Install):
# - Installs EXACTLY the versions in package-lock.json (deterministic).
# - Faster than npm install in CI/Docker environments.
# - Deletes node_modules first for a clean slate.
# --omit=dev: Skips devDependencies (nodemon). We don't need
# file-watching or hot-reload inside a container.
RUN npm ci --omit=dev

# Remove build dependencies after native modules are compiled
# This reduces the final image size by ~50MB.
RUN apk del .build-deps

# ============================================
# COPY application source code
# ============================================
# This copies everything NOT excluded by .dockerignore.
# Since we already installed node_modules above, this layer
# only contains our actual source code (~50KB).
COPY src/ ./src/

# ============================================
# Create non-root user
# ============================================
# WHY: Running as root inside a container is a security risk.
# If an attacker exploits a vulnerability in our app, they get
# root access to the container (and potentially the host via
# container escapes). A non-root user limits the blast radius.
#
# addgroup + adduser: Create a system group and user named 'appuser'.
# -S = system user (no password, no home directory).
# chown: Transfer ownership of /app to appuser.
RUN addgroup -S appuser && adduser -S appuser -G appuser
RUN chown -R appuser:appuser /app
USER appuser

# ============================================
# EXPOSE — Document the port (informational only)
# ============================================
# EXPOSE does NOT publish the port. It's documentation that says
# "this container expects traffic on port 3000."
# The actual port mapping happens in docker-compose.yml (ports: "3000:3000").
EXPOSE 3000

# ============================================
# CMD — Default startup command
# ============================================
# CMD specifies the default command when the container starts.
# docker-compose can OVERRIDE this to start the worker instead.
#
# Exec form ["node", ...] is used instead of shell form "node ..."
# because exec form:
# 1. Runs node as PID 1 (receives SIGTERM directly for graceful shutdown).
# 2. Shell form wraps in /bin/sh, which may not forward signals.
#
# PID 1 and signals:
# When Docker sends SIGTERM to stop a container, it sends it to PID 1.
# If PID 1 is /bin/sh (shell form), sh doesn't forward the signal to node.
# Node never receives SIGTERM → no graceful shutdown → Docker force-kills
# after 10 seconds with SIGKILL → in-flight orders are lost.
CMD ["node", "src/server.js"]
