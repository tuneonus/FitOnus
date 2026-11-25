# syntax=docker/dockerfile:1
# Multi-stage production image for the FitOnus Node.js / Express 5 backend.
# Build context: backend/ (contains package.json, lockfile, src/, scripts/, migrations/).
# For strict build reproducibility in release pipelines, pin base images by digest:
#   node:22-bookworm-slim@sha256:<digest>

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
LABEL org.opencontainers.image.title="fitonus-backend" \
      org.opencontainers.image.description="FitOnus Express 5 API server and migration runner" \
      org.opencontainers.image.source="https://github.com/TuneOnus/FitOnus"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    UV_THREADPOOL_SIZE=64
WORKDIR /app
# Copy only runtime dependencies, compiled JS, package manifest, and forward-only SQL migrations.
# Runs as the unprivileged built-in "node" user (uid 1000).
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node migrations ./migrations
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# The HTTP process never executes migrations; run `node dist/scripts/migrate.js` as a separate release step.
CMD ["node", "dist/src/server.js"]
