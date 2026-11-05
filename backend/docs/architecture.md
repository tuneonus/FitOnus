# Architecture

## Why a modular monolith

One deployable process and one PostgreSQL database, split internally into feature modules with enforced
boundaries. This keeps the things that make distributed systems expensive off the table (network calls between
services, distributed transactions, eventual consistency between your own data, per-service deployments) until a
real need appears. Because each module only talks to others through a small public API, extracting one into a
service later is a contained change rather than a rewrite. See [ADR 0001](adr/0001-modular-monolith.md).

## The four layers inside a module

```
interface      →  application      →  domain
(HTTP)            (use cases, ports)   (entities, rules)
     ↘                 ↑
      infrastructure (implements ports: PostgreSQL, jose, argon2)
```

| Layer              | Contains                                                                                                            | Must not contain                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **domain**         | Entities, value rules (`normalizeEmail`), invariants (`assertStatusTransition`), domain errors                      | Express, `pg`, Zod, logging, I/O            |
| **application**    | Use cases, repository/service **ports**, authorization & ownership checks, transaction boundaries, DTO/view mapping | Express `req`/`res`, SQL, concrete adapters |
| **infrastructure** | `Pg*Repository` (SQL + row mapping + DB error translation), token service                                           | HTTP concerns, business decisions           |
| **interface**      | Zod request/response schemas, thin controllers, route specs                                                         | Business rules, SQL                         |

`index.ts` is the module's composition root and its **only** public surface. It wires infrastructure into use
cases into controllers and exports the route group plus any in-process API (e.g. `users.accounts`).

### Why dependency direction matters

Business rules are the part of the system that should change only when the business changes. If a use case
imported `pg` or Express, swapping the driver, adding a CLI or a queue consumer, or unit-testing the rule would
all require touching it. With ports, the use case is tested with in-memory fakes in milliseconds
(`tests/unit/users/use-cases.test.ts`), and the same use case is reused by HTTP routes and scripts.

### How boundaries are enforced

`eslint.config.js` generates `no-restricted-imports` rules per module and layer:

- domain may not import outer layers, `database/`, `middleware/`, `config/`, or framework packages (incl. Zod);
- application may not import infrastructure/interface, `database/`, HTTP helpers, framework packages, or the
  concrete adapters in `shared/` (`argon2-password-hasher`, `hmac-keyed-hasher`, `pg-idempotency-store`);
- infrastructure may not import interface or middleware;
- a module may import another module **only** via `<module>/index.js`;
- `shared/`, `database/`, `middleware/`, `config/` may never import a feature module.

`npm run lint` fails on any violation (verified with deliberate probe imports during development).

## Request lifecycle (Users example)

```
POST /api/v1/users  Authorization: Bearer …  Idempotency-Key: …
 │ request-context   request id (reuses a safe X-Request-Id), req.log, one log line with duration
 │ helmet, cors      security headers; CORS allowlist from CORS_ORIGINS
 │ express.json      body limit (BODY_LIMIT); malformed JSON → 400 INVALID_JSON; too big → 413
 │ global limiter    per-IP budget
 │ route spec        access: { kind: 'permission', permission: 'users:create' }
 │  ├ authenticate   verify JWT → load session + account from PostgreSQL → req.actor (401/403)
 │  ├ authorize      requirePermission('users:create') → 403 FORBIDDEN
 │  └ validate       Zod parses headers + body → req.validated (400 VALIDATION_FAILED with details)
 │ controller        getValidated(req, createUserRequest) → CreateUserUseCase.execute(actor, body, key)
 │ use case          permission + role-assignment check → normalise (domain) → password policy
 │                   → hash (outside tx) → idempotency claim → uow.run(insert + complete)
 │ repository        INSERT … RETURNING; unique violation → 409 EMAIL_ALREADY_EXISTS
 │ PostgreSQL        constraints are the last line of defence
 │ respond           response schema strips undeclared fields → { success, data, message }
 └ error handler     AppError kind → status; unknown errors → 500 INTERNAL_ERROR (logged, never leaked)
```

## Error propagation

Layers throw `AppError(kind, code, message, details?)`. Only `middleware/error-handler.ts` knows HTTP status
codes. Repositories translate the database errors they understand (e.g. `users_email_key` → `EMAIL_ALREADY_EXISTS`);
anything else falls through to `mapDatabaseError` (deadlock → 409 `CONFLICT`, timeouts → 503) or becomes a 500 whose
stack is logged once with the request id. Controllers never catch.

## Module-to-module communication

Synchronous, in-process, through the public API. Auth needs account data, so it declares a `UserAccountsPort`
in its own application layer; `container.ts` passes `users.accounts`, which satisfies that port structurally.
Auth never reads the `users` table. If both modules write in one use case, the caller wraps the calls in
`uow.run(...)` and every repository joins the same transaction automatically.

When a module must react to another asynchronously (send an e-mail after signup), add an outbox table written in
the same transaction plus a worker; see [deployment.md](deployment.md#optional-extensions).

## Trade-offs we chose deliberately

| Choice                                        | Benefit                                                                            | Cost                                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Raw SQL instead of an ORM                     | Every query is visible, reviewable and tunable; no hidden N+1 or lazy loading      | Row mapping is hand-written; schema and types can drift (mitigated by repository integration tests) |
| AsyncLocalStorage unit of work                | Repositories cannot accidentally escape a transaction; no `tx` parameter threading | Implicit context; fire-and-forget work inside `run()` would outlive the transaction (don't)         |
| DB lookup of session + account per request    | Revocation, disabling and role changes are immediate; fails closed                 | Two indexed queries per authenticated request; add a short cache only with explicit invalidation    |
| Route specs drive enforcement **and** OpenAPI | Docs cannot disagree with enforced access rules                                    | A small in-house abstraction to learn (`shared/http/route.ts`)                                      |
| Roles/permissions in code                     | Reviewed in PRs, typed, no admin UI needed to stay safe                            | Changing grants requires a deploy (move to tables when product needs runtime RBAC)                  |
| In-memory rate-limit stores                   | Zero infrastructure                                                                | Budgets are per instance; use a shared store with multiple replicas                                 |
