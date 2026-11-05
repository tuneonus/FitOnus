# generic-backend

A reusable backend starter for API-based products (SaaS, e-commerce, booking, inventory, admin tools).
It is a **modular monolith** with **Clean Architecture** boundaries, built on Express 5, PostgreSQL (raw `pg`),
Zod, `jose` and Argon2id. It ships a complete authentication foundation and a generic Users module that
demonstrate every pattern a new feature module should follow.

> Status: a starter, not a finished product. It is tested and secure-by-default, but every deployment still
> needs its own review (see [docs/deployment.md](docs/deployment.md)).

## What you get

- **Auth**: e-mail + password login, Argon2id, 15-minute HS256 access JWTs (issuer/audience/algorithm pinned),
  opaque rotating refresh tokens stored only as keyed hashes, replay detection, logout / logout-all / per-session
  revocation, password change, database-backed session checks on every request (fail closed).
- **Authorization**: permission-based, deny by default, no role-name bypass, ownership rules in use cases.
- **Users module**: create (idempotent), get me, get by id, list with pagination/search/filter/sort, update
  profile with optimistic concurrency, disable/enable with compare-and-set.
- **Data integrity**: SQL constraints, unit-of-work transactions owned by use cases, forward-only checksummed
  migrations under an advisory lock, a dedicated migration command.
- **API conventions**: `/api/v1`, success/error envelopes, stable error codes, request ids, 404/405 handling,
  body limits, OpenAPI 3.1 generated from the same route specs that enforce access.
- **Operations**: structured JSON logs with redaction, liveness/readiness probes, graceful shutdown,
  multi-stage non-root Docker image, Compose for local PostgreSQL, GitHub Actions CI.

## Quick start (Windows PowerShell)

Prerequisites: Node.js 22 LTS (≥ 22.22), Docker Desktop (for local PostgreSQL and integration tests).

```powershell
cd E:\Web\generic-backend
npm ci
Copy-Item .env.example .env          # then edit .env: set real local passwords/secrets
docker compose up -d db              # PostgreSQL 17 on 127.0.0.1:5432 with a persistent volume
npm run db:migrate                   # apply SQL migrations
npm run db:seed                      # optional: creates SEED_ADMIN_EMAIL as admin
npm run dev                          # http://127.0.0.1:3000  (watch mode)
```

Smoke test:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health/ready
$login = Invoke-RestMethod -Method Post http://127.0.0.1:3000/api/v1/auth/login `
  -ContentType 'application/json' -Body '{"email":"admin@example.com","password":"<SEED_ADMIN_PASSWORD>"}'
Invoke-RestMethod http://127.0.0.1:3000/api/v1/users/me -Headers @{ Authorization = "Bearer $($login.data.accessToken)" }
```

macOS/Linux use the same npm scripts (`cp .env.example .env`).

## npm scripts

| Script                                        | Purpose                                                           |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `dev`                                         | Run `src/server.ts` with watch mode, loading `.env` if present    |
| `build` / `start`                             | Compile to `dist/` / run the compiled server                      |
| `typecheck`, `lint`, `format`, `format:check` | Static checks (lint also enforces architecture boundaries)        |
| `test`                                        | Unit tests (no database)                                          |
| `test:int`                                    | Integration + HTTP tests against real PostgreSQL (Testcontainers) |
| `db:migrate`, `db:migrate:status`             | Apply / list migrations                                           |
| `db:seed`                                     | Development seed; refuses production and non-local databases      |
| `db:cleanup`                                  | Delete expired idempotency keys and long-dead sessions            |
| `check`                                       | typecheck + lint + format check + unit tests + build              |

## Project layout

```
src/
  app.ts                 Express app factory (no listen) — middleware order lives here
  server.ts              Process entry: config, pool, listen, graceful shutdown
  container.ts           Composition root: the only place that wires concrete classes
  config/env.ts          Zod-validated configuration + production safety checks
  database/              Pool, transactions (unit of work), migration runner, SQL helpers, error mapping
  middleware/            Request context/logging, authenticate, authorize, validate, rate limits, errors
  modules/
    auth/                domain → application → infrastructure → interface, public index.ts
    users/               same four layers, public index.ts
    health/              liveness/readiness routes
  shared/                Framework-free kernel: errors, permissions/actor, security ports, idempotency,
                         pagination, HTTP route builder + OpenAPI
migrations/              Forward-only SQL (NNNN_name.sql)
scripts/                 migrate, seed, cleanup
tests/                   unit/, integration/ (database + HTTP), helpers/
docs/                    Architecture, auth, database, development, deployment, new-module guide, ADRs
```

## Documentation

- [Architecture](docs/architecture.md): layers, dependency rules, request lifecycle, trade-offs
- [Authentication & authorization](docs/authentication.md)
- [Database](docs/database.md): transactions, migrations, constraints, concurrency, backups
- [API conventions](docs/api.md)
- [Development & testing](docs/development.md)
- [Deployment](docs/deployment.md)
- [Adding a module](docs/new-module-guide.md)
- [Architecture decision records](docs/adr/)
