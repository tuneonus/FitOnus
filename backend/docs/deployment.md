# Deployment

## Build and run the image

```powershell
docker build -t generic-backend:local .
docker compose --profile app up --build      # db + one-off migrate container + api, all local
```

The image is multi-stage, runs as the unprivileged `node` user, contains only `dist/`, production
`node_modules`, `migrations/` and `package.json`, and never contains `.env` (excluded by `.dockerignore`).
Pin the base image by digest for reproducible builds.

## Release process

1. CI green on the commit (typecheck, lint, format, unit, integration, migration smoke, secret scan, image build).
2. Run migrations as a separate step with the **migrator** role: `node dist/scripts/migrate.js`.
   It is safe if two releases race (advisory lock), and aborts if history was edited.
3. Roll out the new image. Kubernetes or another orchestrator should use `/health/live` for liveness and
   `/health/ready` for readiness.
4. On shutdown (`SIGTERM`) the server marks itself not ready, stops accepting connections, finishes in-flight
   requests, closes the pool, and exits; after `SHUTDOWN_TIMEOUT_MS` it force-closes. Set the orchestrator's grace
   period above that value.

## Production checklist

- [ ] Secrets (`JWT_ACCESS_SECRET`, `HMAC_SECRET`, database password) come from a secret manager, are random
      (≥ 32 bytes) and distinct. The app refuses placeholders and identical secrets.
- [ ] `NODE_ENV=production`, `AUTH_PUBLIC_REGISTRATION` set explicitly, `CORS_ORIGINS` lists exact https origins.
- [ ] `DATABASE_SSL=verify-full` (the server warns when SSL is disabled in production).
- [ ] `TRUST_PROXY` equals the number of proxies in front of the app; otherwise IP-based rate limits are wrong.
- [ ] TLS terminates at the load balancer; HSTS is set there or via Helmet (on by default).
- [ ] Database roles split into migrator and runtime (see [database.md](database.md#least-privilege)).
- [ ] Backups with point-in-time recovery, and a restore drill done (see [database.md](database.md#backups-and-recovery)).
- [ ] `npm run db:cleanup` scheduled (e.g. hourly).
- [ ] Log shipping configured; alerts on 5xx rate, latency, readiness failures and pool exhaustion.
- [ ] Multiple replicas: replace the in-memory rate-limit stores with a shared store.

## Observability, later

Logs are JSON on stdout with `req.id`, path, status and `responseTime`, ready for any collector.

To add OpenTelemetry without restructuring: install `@opentelemetry/sdk-node` and the auto-instrumentations,
create `src/telemetry.ts` that starts the SDK, and load it first with `node --import ./dist/src/telemetry.js
dist/src/server.js`. HTTP, Express and `pg` spans are then automatic. Add the active trace id to pino's `mixin` to
correlate logs and traces. Metrics (request rate/latency, pool `totalCount/idleCount/waitingCount`) can be exported
the same way. None of this is installed by default on purpose.

## Optional extensions

| Need                              | Recommended approach                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Background jobs                   | `pg-boss` (PostgreSQL-backed, no new infrastructure), run in a separate `src/worker.ts` process, not in the HTTP process                                     |
| Reliable events to other systems  | Outbox table written in the business transaction + a worker relaying with `FOR UPDATE SKIP LOCKED`                                                           |
| Caching / distributed rate limits | Redis behind small ports (`Cache`, rate-limit store); always define invalidation before adding a cache                                                       |
| WebSockets                        | Authenticate the handshake with the same `authenticateAccessToken`, re-check sessions periodically, keep payloads minimal, scope rooms per user/tenant       |
| External integrations             | `src/integrations/<provider>/` adapters implementing a port owned by the module that needs it; timeouts, retries only for idempotent calls, a fake for tests |
| File uploads                      | Private object storage with short-lived presigned URLs, content-type sniffing and size limits; never public permanent URLs for user data                     |
| Multi-tenancy                     | `tenant_id` on every table + row-level security or a mandatory repository filter; decide before the first real module                                        |
