# ════════════════════════════════════════════════════════════════════════════
# Moon Code Dockerfile — multi-stage build for minimal production image
# ════════════════════════════════════════════════════════════════════════════
# Build:  docker build -t mooncode:1.0.0 -f docker/Dockerfile .
# Run:    docker run -p 4173:4173 -v $(pwd)/workspace:/app/workspace mooncode:1.0.0
# ════════════════════════════════════════════════════════════════════════════

# ─── Stage 1: Base ──────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app
# Install git (needed for the checkpoint/undo feature) and tini (PID 1 signal handling).
RUN apk add --no-cache git tini
ENTRYPOINT ["/sbin/tini", "--"]

# ─── Stage 2: Production ────────────────────────────────────────────────────
FROM base AS production
WORKDIR /app

# Copy the application source.
COPY package.json ./
COPY apps/ ./apps/
COPY packages/ ./packages/
COPY docs/ ./docs/
COPY .env.example ./

# Create directories for runtime data (will be mounted as volumes in prod).
RUN mkdir -p /app/workspace /app/.mooncode

# Environment defaults (overridable at runtime).
ENV NODE_ENV=production \
    MOONCODE_HOST=0.0.0.0 \
    MOONCODE_ALLOW_REMOTE=1 \
    MOONCODE_PORT=4173 \
    MOONCODE_WORKSPACE=/app/workspace \
    MOONCODE_DATA=/app/.mooncode

# Expose the HTTP port.
EXPOSE 4173

# Health check: hit /api/health every 30s.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4173/api/health || exit 1

# Run as a non-root user for defense in depth.
RUN addgroup -S mooncode && adduser -S mooncode -G mooncode \
  && chown -R mooncode:mooncode /app
USER mooncode

# Start the server.
CMD ["node", "apps/server/src/server.js"]

# ─── Stage 3: Development (with hot reload + test runner) ───────────────────
FROM base AS development
WORKDIR /app

# Install dev dependencies for linting/testing.
# (In a real monorepo, you'd copy package-lock.json and run npm ci here.)
COPY package.json ./
COPY apps/ ./apps/
COPY packages/ ./packages/
COPY tests/ ./tests/
COPY docs/ ./docs/

RUN mkdir -p /app/workspace /app/.mooncode

ENV NODE_ENV=development \
    MOONCODE_HOST=0.0.0.0 \
    MOONCODE_PORT=4173

EXPOSE 4173

# In dev, run as root so the container can write to mounted volumes easily.
# (Production uses the non-root user above.)
CMD ["node", "--watch", "apps/server/src/server.js"]
