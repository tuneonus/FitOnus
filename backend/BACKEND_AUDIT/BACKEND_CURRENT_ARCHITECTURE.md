# FitOnus Backend Audit — Current Architecture & Technology Stack

**Document Reference:** `FitOnus/backend/BACKEND_AUDIT/BACKEND_CURRENT_ARCHITECTURE.md`  
**Status:** Complete & Verified Technical Audit  
**Date:** 2026-11-04  
**Auditor:** Senior Backend Architect  
**Classification:** Confidential Technical Assessment

---

## 1. Executive Architectural Overview

The existing backend kit located at `/media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend` is a **modular monolith** engineered using **Clean Architecture** principles.

The codebase is currently structured as an architectural base kit (named `generic-backend` in `package.json`). It implements a core foundation for identity, authentication, session security, database transactions, request validation, and API documentation, but contains **zero fitness, workout, nutrition, health-metric, or AI domain features**.

```
+---------------------------------------------------------------------------------------+
|                                Client Applications                                    |
|                      (FitOnus React Native / Expo Mobile App)                         |
+-------------------------------------------+-------------------------------------------+
                                            | HTTPS REST / Bearer JWT
                                            v
+---------------------------------------------------------------------------------------+
|                    Express 5.3 Modular Monolith (src/server.ts)                       |
|  - Request Context & Correlation ID (pino-http, x-request-id)                         |
|  - Security Perimeter (Helmet 8.3, CORS with strict origin validation)                |
|  - In-Memory Rate Limiting (Global IP, Login IP+Email, Register, Refresh)             |
|  - Route Definition & Access Enforcement (Public / Authenticated / Permission)        |
+-------------------------------------------+-------------------------------------------+
                                            |
        +-----------------------------------+-----------------------------------+
        |                                   |                                   |
        v                                   v                                   v
+-----------------------+   +-----------------------+   +-------------------------------+
|     Health Module     |   |      Auth Module      |   |         Users Module          |
|  (src/modules/health) |   |   (src/modules/auth)  |   |      (src/modules/users)      |
|  - /health/live       |   |  - Register, Login    |   |  - Users CRUD & Profile       |
|  - /health/ready      |   |  - Refresh, Logout    |   |  - Status Management          |
|    (Postgres Ping)    |   |  - Sessions, Password |   |  - Optimistic Concurrency     |
+-----------------------+   +-----------+-----------+   +---------------+---------------+
                                        |                               |
                                        +---------------+---------------+
                                                        |
                                                        v
+---------------------------------------------------------------------------------------+
|                               Shared Application Kernel                               |
|  - Unit of Work (AsyncLocalStorage PgUnitOfWork: atomic transactions per use case)     |
|  - Security Services (Argon2id password hasher, HMAC-SHA256 keyed token hasher)       |
|  - Idempotency Engine (IdempotencyService backed by PostgreSQL idempotency_keys)      |
|  - Authorization (Code-defined roles & permissions, assertSelfOrPermission)           |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                                  PostgreSQL 17 Database                               |
|       Tables: users, auth_sessions, idempotency_keys (3 Forward-only Migrations)       |
+---------------------------------------------------------------------------------------+
```

---

## 2. Technology Stack & Dependency Inventory

All dependencies and exact versions have been statically verified from `package.json` and `package-lock.json` [V]:

| Component / Library | Exact Version | Type | Architectural Role & Implementation Details |
|---|---|---|---|
| **Node.js** | `>=22.22.0` | Runtime | Node.js 22 LTS (Bookworm); ESM modules (`"type": "module"` in `package.json`). |
| **Express** | `5.3.0` | Dependency | Express 5.x routing engine; native promise handling in middleware and route handlers. |
| **PostgreSQL (`pg`)** | `8.23.1` | Dependency | Raw PostgreSQL client pool (`pg.Pool`); zero ORM overhead; explicit parameterized queries. |
| **Zod** | `4.6.7` | Dependency | Schema validation for environment variables, inbound HTTP requests, and outbound response envelopes. |
| **Jose** | `6.2.13` | Dependency | Lightweight, standard-compliant JWT signing and verification; HS256 algorithm with pinned issuer and audience. |
| **Argon2** | `0.45.1` | Dependency | State-of-the-art password hashing using the Argon2id variant; memory/time-cost tuning via Node C++ bindings. |
| **Pino** | `10.4.0` | Dependency | Ultra-fast JSON structured logger; redaction of sensitive credentials; correlation IDs via `pino-http`. |
| **Pino-HTTP** | `11.0.0` | Dependency | HTTP request/response logging middleware injecting `req.id` and timing metrics. |
| **Helmet** | `8.3.0` | Dependency | Standard HTTP security headers (HSTS, CSP, X-Frame-Options, Sniff protection). |
| **CORS** | `2.8.6` | Dependency | Strict browser origin filtering; rejects wildcards (`*`); validates HTTPS origins in production. |
| **Express-Rate-Limit**| `8.7.1` | Dependency | Dual-layer in-memory rate limiting; draft-8 standard rate limit headers. |
| **Vitest** | `5.0.5` | DevDependency | Unit test runner and assertion framework with native TypeScript / ESM support. |
| **Testcontainers** | `12.2.1` | DevDependency | Spawns real, isolated PostgreSQL 17 Docker containers during integration tests. |
| **TypeScript** | `6.0.3` | DevDependency | Strict type checking (`noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`). |
| **ESLint** | `10.13.0` | DevDependency | Code quality and architectural layer boundary linting (`eslint.config.js`). |

---

## 3. Clean Architecture Layering & Dependency Flow

The codebase enforces strict **Clean Architecture / Hexagonal** boundaries (`ADR 0001`, `docs/architecture.md`):

```
+---------------------------------------------------------------------------------------+
|                                   INTERFACE LAYER                                     |
|  Files: *.controller.ts, *.routes.ts, *.schemas.ts                                    |
|  - Express HTTP route handling and parameter extraction                               |
|  - Inbound Zod validation (`validateRequest`) and outbound schema parsing             |
|  - Converts HTTP requests into application command inputs and maps use case outputs   |
+-------------------------------------------+-------------------------------------------+
                                            │
                                            ▼
+---------------------------------------------------------------------------------------+
|                                 APPLICATION LAYER                                     |
|  Files: src/modules/*/application/use-cases/*.ts, ports.ts, errors.ts                 |
|  - Implements specific business use cases (e.g., LoginUseCase, UpdateUserUseCase)     |
|  - Interacts exclusively with inbound and outbound Port interfaces                    |
|  - Manages transactional boundaries via Unit of Work (PgUnitOfWork)                   |
|  - Enforces resource ownership checks (e.g., assertSelfOrPermission)                  |
+-------------------------------------------+-------------------------------------------+
                                            │
                                            ▼
+---------------------------------------------------------------------------------------+
|                                   DOMAIN LAYER                                        |
|  Files: src/modules/*/domain/*.ts                                                     |
|  - Enterprise business logic and entities (e.g., User, Session)                       |
|  - Pure TypeScript with ZERO external framework dependencies                          |
|  - Invariant enforcement and state machine rules (assertStatusTransition)             |
+---------------------------------------------------------------------------------------+
                                            ▲
                                            │ implements Ports
+-------------------------------------------+-------------------------------------------+
|                                INFRASTRUCTURE LAYER                                   |
|  Files: src/modules/*/infrastructure/*.ts                                             |
|  - Implements Outbound Ports (e.g., PgUserRepository, PgSessionRepository)            |
|  - Raw PostgreSQL SQL queries using parameterized statements                          |
|  - External adapters: JoseAccessTokenService, Argon2PasswordHasher, HmacKeyedHasher   |
+---------------------------------------------------------------------------------------+
```

### 3.1 Architectural Boundary Rules [V]
Enforced statically via ESLint rules in `eslint.config.js:84-142`:
1. **Domain Isolation:** `domain/` files cannot import from `application/`, `infrastructure/`, `interface/`, Express, or third-party I/O libraries.
2. **Application Decoupling:** `application/` can import from `domain/` and `shared/`, but cannot import from `infrastructure/` or Express.
3. **Module Encapsulation:** Modules (`auth`, `users`) can only import from other modules through that module's top-level `index.ts`. Direct cross-module internal imports (e.g., `modules/auth` importing `modules/users/infrastructure/pg-user-repository.js`) are forbidden.

---

## 4. Application Lifecycle & Composition Root

### 4.1 Composition Root (`src/container.ts`) [V]
`src/container.ts` is the **only place in the entire backend** that imports concrete infrastructure classes. It wires concrete dependencies and passes them into module factories:
```typescript
const database = new Database(pool);
const uow = new PgUnitOfWork(database);
const passwordHasher = new Argon2PasswordHasher();
const keyedHasher = new HmacKeyedHasher(config.security.hmacSecret);
const idempotency = new IdempotencyService(new PgIdempotencyStore(database), keyedHasher, config.idempotency);
const rateLimiters = createRateLimiters(config.rateLimit);

const users = createUsersModule({ basePath: '/api/v1/users', db: database, uow, passwordHasher, idempotency });
const auth = createAuthModule({ basePath: '/api/v1/auth', db: database, uow, passwordHasher, keyedHasher, accounts: users.accounts, config: config.auth, limiters: rateLimiters });
const health = createHealthRoutes({ checkReady: () => database.ping(2000), isShuttingDown: lifecycle.isShuttingDown });
```

### 4.2 Graceful Shutdown & Process Lifecycle (`src/server.ts`) [V]
- Listens for `SIGTERM` and `SIGINT` OS signals.
- Marks the application as not ready (`container.lifecycle.beginShutdown()`), causing `/health/ready` to immediately return HTTP 503 so load balancers stop sending traffic.
- Closes the HTTP server, allowing in-flight requests to complete up to `SHUTDOWN_TIMEOUT_MS` (default 10s).
- Forcefully closes idle keep-alive connections (`server.closeIdleConnections()`).
- Drains and closes the PostgreSQL connection pool (`pool.end()`).
- Catches uncaught exceptions and unhandled promise rejections, logging them via Pino before initiating graceful termination.

---

## 5. Architectural Assessment: Base Kit Strengths & Gaps

| Architectural Dimension | Current Base Kit Evaluation | FitOnus Production Readiness |
|---|---|---|
| **Design Pattern** | **Exceptional.** Clean Architecture with strict ESLint-enforced boundaries and Composition Root. | Ready to host new feature modules without architectural restructuring. |
| **Language & Runtime** | **Modern.** Node.js 22 LTS, native ESM, TypeScript 6, Express 5. | Fully aligned with modern backend engineering standards. |
| **Database Transactions** | **Robust.** `AsyncLocalStorage` Unit of Work enables atomic use-case transactions without passing database clients through controllers. | Ready for complex multi-table transactional fitness workflows. |
| **Authentication Foundation** | **High Security.** Argon2id + HS256 JWT + database-backed sessions with CAS rotation and reuse detection. | Production-grade for email/password; missing mobile social login and OTP. |
| **API Contract & Validation** | **High Quality.** Zod schemas drive both runtime validation and dynamic OpenAPI 3.1 generation. | Ready; enforces zero field leakage on API responses. |
| **Domain Scope** | **Completely Absent.** Contains only basic Users and Auth. No workout, nutrition, health, or AI features exist. | Requires full domain implementation. |
| **Worker Infrastructure** | **Absent.** Background workers are recommended (`pg-boss` in `docs/deployment.md`) but not implemented. | Required for asynchronous AI coaching, health sync, and reminders. |

