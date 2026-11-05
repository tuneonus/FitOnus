# FitOnus Backend Audit — Folder Structure & Codebase Organization

**Document Reference:** `FitOnus/backend/BACKEND_AUDIT/BACKEND_FOLDER_STRUCTURE.md`  
**Status:** Complete & Verified Technical Audit  
**Date:** 2026-11-04  
**Auditor:** Senior Backend Architect  
**Classification:** Confidential Technical Assessment

---

## 1. Complete File Tree of `FitOnus/backend`

The following tree represents the complete, verified directory structure of the backend codebase, excluding `node_modules` (not installed) and `.git`:

```text
backend/
├── compose.yaml                        # Local Docker Compose manifest (PostgreSQL 17)
├── Dockerfile                          # Production multi-stage Docker build
├── .dockerignore                       # Docker build exclusions
├── .env.example                        # Template environment variables with validation rules
├── eslint.config.js                    # ESLint 10 flat config with architectural boundary rules
├── .gitattributes                      # Git line-ending normalizations
├── .gitignore                          # Repository ignores (node_modules, dist, .env)
├── .nvmrc                              # Node version pinning (v22)
├── package.json                        # Project manifest, dependencies, scripts
├── package-lock.json                   # Deterministic dependency lockfile
├── .prettierignore                     # Prettier exclusions
├── .prettierrc.json                    # Prettier formatting standards
├── README.md                           # Starter documentation and local setup guide
├── tsconfig.build.json                 # Production TypeScript build configuration
├── tsconfig.json                       # Base TypeScript configuration
├── vitest.config.ts                    # Vitest configuration for unit tests
├── vitest.integration.config.ts        # Vitest configuration for integration tests
│
├── docs/                               # Architecture and developer documentation
│   ├── adr/                            # Architecture Decision Records
│   │   ├── 0001-modular-monolith.md    # ADR: Modular Monolith + Clean Architecture
│   │   ├── 0002-raw-sql-without-orm.md # ADR: Raw SQL via `pg` + Unit of Work
│   │   └── 0003-database-backed-sessions.md # ADR: DB Sessions + Token Rotation
│   ├── api.md                          # API design guidelines and conventions
│   ├── architecture.md                 # System layering and dependency rules
│   ├── authentication.md               # Detailed auth and session flow documentation
│   ├── database.md                     # PostgreSQL transactions, migrations, pooling
│   ├── deployment.md                   # Production deployment checklist and observability
│   ├── development.md                  # Local development workflows and testing guide
│   └── new-module-guide.md             # Standard operating procedure for adding new modules
│
├── migrations/                         # Forward-only SQL migrations (Checksum verified)
│   ├── 0001_create_users.sql           # Users table, profile columns, integrity constraints
│   ├── 0002_create_auth_sessions.sql   # Server-side refresh token session ledger
│   └── 0003_create_idempotency_keys.sql# Idempotency lock tokens and response cache
│
├── scripts/                            # Administrative and deployment CLI utilities
│   ├── cleanup.ts                      # Deletes expired idempotency keys and sessions
│   ├── migrate.ts                      # Standalone database migration runner
│   └── seed.ts                         # Local development database seeder
│
├── src/                                # Core application source code
│   ├── app.ts                          # Express application factory & middleware pipeline
│   ├── container.ts                    # Composition root wiring concrete dependencies
│   ├── server.ts                       # HTTP process boot, port listening, graceful shutdown
│   │
│   ├── config/                         # Environment & runtime configuration
│   │   └── env.ts                      # Zod-validated environment loading and security checks
│   │
│   ├── database/                       # Database kernel and data access primitives
│   │   ├── errors.ts                   # PostgreSQL error code mapping (23505, 23503, 40001)
│   │   ├── migration-runner.ts         # Checksummed migration runner with advisory locking
│   │   ├── pool.ts                     # `pg.Pool` factory with timeout configurations
│   │   ├── sql.ts                      # Raw SQL template tags and identifier sanitization
│   │   └── transaction.ts              # AsyncLocalStorage Unit of Work implementation
│   │
│   ├── middleware/                     # Express HTTP middleware pipeline
│   │   ├── authenticate.ts             # Bearer JWT extraction and Actor resolution
│   │   ├── authorize.ts                # Route-level permission guards
│   │   ├── error-handler.ts            # Centralized AppError to HTTP response mapping
│   │   ├── rate-limit.ts               # In-memory dual-layer rate limiting
│   │   ├── request-context.ts          # Correlation ID injection and Pino HTTP logging
│   │   └── validate.ts                 # Inbound Zod schema validation middleware
│   │
│   ├── modules/                        # Domain feature modules
│   │   ├── auth/                       # Authentication & Session Management Module
│   │   │   ├── application/            # Use cases, ports, and errors
│   │   │   │   ├── errors.ts           # Domain-specific auth error classes
│   │   │   │   ├── ports.ts            # Inbound/Outbound port interfaces
│   │   │   │   ├── session-issuer.ts   # Helper coordinating token pair issuance
│   │   │   │   └── use-cases/          # Business logic implementation
│   │   │   │       ├── change-password.use-case.ts
│   │   │   │       ├── list-sessions.use-case.ts
│   │   │   │       ├── login.use-case.ts
│   │   │   │       ├── logout.use-case.ts
│   │   │   │       ├── refresh-token.use-case.ts
│   │   │   │       ├── register.use-case.ts
│   │   │   │       └── revoke-session.use-case.ts
│   │   │   ├── domain/                 # Auth entities and validation
│   │   │   │   └── session.ts          # Session aggregate root and revocation rules
│   │   │   ├── index.ts                # Public module API and factory function
│   │   │   ├── infrastructure/         # External adapters and persistence
│   │   │   │   ├── jose-access-token-service.ts # Jose JWT implementation
│   │   │   │   └── pg-session-repository.ts     # PostgreSQL session repository
│   │   │   └── interface/              # HTTP delivery layer
│   │   │       ├── auth.controller.ts  # Express controller handling requests
│   │   │       ├── auth.routes.ts      # Route specs and rate limit binding
│   │   │       └── auth.schemas.ts     # Inbound and outbound Zod schemas
│   │   │
│   │   ├── health/                     # System Health & Probe Module
│   │   │   └── health.routes.ts        # /health/live and /health/ready endpoints
│   │   │
│   │   └── users/                      # User & Account Management Module
│   │       ├── application/            # Use cases, ports, and DTOs
│   │       │   ├── accounts.ts         # User account boundary interface
│   │       │   ├── ports.ts            # User repository port definitions
│   │       │   ├── user-view.ts        # Outbound projection schemas
│   │       │   └── use-cases/          # Business logic implementation
│   │       │       ├── create-user.use-case.ts
│   │       │       ├── disable-user.use-case.ts
│   │       │       ├── enable-user.use-case.ts
│   │       │       ├── get-user.use-case.ts
│   │       │       ├── list-users.use-case.ts
│   │       │       └── update-user.use-case.ts
│   │       ├── domain/                 # User domain model
│   │       │   └── user.ts             # User entity and status transition assertions
│   │       ├── index.ts                # Public module interface
│   │       ├── infrastructure/         # Persistence layer
│   │       │   └── pg-user-repository.ts # Raw SQL user persistence
│   │       └── interface/              # HTTP delivery layer
│   │           ├── users.controller.ts # Express request handler
│   │           ├── users.routes.ts     # Route definitions with permission guards
│   │           └── users.schemas.ts    # Request/Response Zod validation schemas
│   │
│   └── shared/                         # Shared cross-cutting kernel
│       ├── application/                # Shared application abstractions
│       │   └── unit-of-work.ts         # UnitOfWork interface definition
│       ├── auth/                       # Common authentication types
│       │   ├── actor.ts                # Actor model and assertPermission logic
│       │   └── permissions.ts          # Roles and permissions constant definitions
│       ├── errors/                     # Centralized domain and HTTP errors
│       │   └── app-error.ts            # AppError class and standard factory functions
│       ├── http/                       # Declarative HTTP routing framework
│       │   ├── openapi.ts              # Dynamic OpenAPI 3.1 JSON document builder
│       │   └── route.ts                # defineRoute builder, spec definitions, router compiler
│       ├── idempotency/                # Mutations deduplication engine
│       │   ├── idempotency.ts          # IdempotencyService orchestration logic
│       │   └── pg-idempotency-store.ts # PostgreSQL storage adapter for idempotency keys
│       ├── logging/                    # Logging utilities
│       │   └── logger.ts               # Pino logger initialization and redaction rules
│       ├── pagination/                 # Standard cursor and offset pagination
│       │   └── pagination.ts           # Pagination metadata and query parsing
│       ├── security/                   # Cryptographic utilities
│       │   ├── argon2-password-hasher.ts
│       │   ├── hmac-keyed-hasher.ts
│       │   ├── keyed-hasher.ts
│       │   ├── password-hasher.ts
│       │   ├── password-policy.ts
│       │   └── random.ts
│       └── types/                      # Ambient type augmentations
│           └── express.ts              # Augments Express Request with actor and context
│
└── tests/                              # Comprehensive test suite
    ├── helpers/                        # Testing harness and fakes
    │   ├── fakes.ts                    # In-memory repository fakes
    │   ├── global-setup.ts             # Vitest global environment initialization
    │   ├── test-app.ts                 # Supertest application factory
    │   └── test-database.ts            # Testcontainers PostgreSQL harness
    ├── integration/                    # Integration tests (Live DB & HTTP)
    │   ├── database/                   # Migrations & transaction rollbacks
    │   ├── http/                       # End-to-end API HTTP tests
    │   └── repositories/               # Repository SQL query tests
    └── unit/                           # Isolated unit tests
        ├── auth/                       # Use case and token unit tests
        ├── config/                     # Environment validation tests
        ├── database/                   # SQL and migration logic tests
        ├── http/                       # Routing and plumbing tests
        ├── shared/                     # Idempotency, security, and auth tests
        └── users/                      # User domain and use case tests
```

---

## 2. Detailed Functional Breakdown of Core Directories

### 2.1 `src/shared/http/` — Declarative Route Spec Framework [V]
The `route.ts` and `openapi.ts` files establish a unified routing abstraction. Instead of standard Express callback chains, routes are declared via `defineRoute`:
- **Explicit Access Declarations:** Every route must declare `{ kind: 'public' }`, `{ kind: 'authenticated' }`, or `{ kind: 'permission', permission: '...' }`. Undefined access is blocked at compilation.
- **Strict Response Filtering:** The handler's output is parsed through `spec.response.schema`, guaranteeing that undeclared internal attributes never leak to API responses.
- **Automated OpenAPI 3.1 Document:** `buildOpenApiDocument()` reflects directly over all declared route groups, ensuring API documentation is 100% synchronized with actual code.

### 2.2 `src/database/` — Data Access & Transaction Primitives [V]
- **`transaction.ts`:** Implements `PgUnitOfWork` backed by Node.js `AsyncLocalStorage`. Use cases can call `uow.execute(async () => { ... })` to wrap multiple repository operations inside a single PostgreSQL transaction without manually passing database client instances through domain logic.
- **`sql.ts`:** Implements safe SQL template literals with parameter binding to prevent SQL injection.
- **`migration-runner.ts`:** Executes forward-only migrations under PostgreSQL transaction-level advisory locks (`pg_advisory_xact_lock`), preventing race conditions when multiple instances start simultaneously. Validates SHA-256 checksums to detect altered migration histories.

### 2.3 `src/modules/` — Feature Encapsulation [V]
- **Modular Autonomy:** Each feature module contains its own application use cases, ports, domain rules, repositories, controllers, and schemas.
- **Strict Public API (`index.ts`):** Other modules can only access functionality exposed through a module's `index.ts`. No internal deep imports are permitted.

---

## 3. Structural Cleanliness & Engineering Assessment

The codebase demonstrates exceptional architectural discipline:
1. **Separation of Concerns:** 100% adherence to Clean Architecture. Framework dependencies (Express, `pg`, Zod) are restricted to the interface and infrastructure layers.
2. **Co-located Testing:** Integration and unit tests mirror the source code structure, facilitating test discovery and maintenance.
3. **Absence of Domain Bloat:** The starter is completely free of boilerplate clutter or dead code, providing an optimal architectural canvas for building the FitOnus fitness and AI subsystems.

