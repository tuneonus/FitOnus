# FitOnus Backend Audit — Database Schema, Transactions & Data Access Analysis

**Document Reference:** `FitOnus/backend/BACKEND_AUDIT/DATABASE_SCHEMA_ANALYSIS.md`  
**Status:** Complete & Verified Technical Audit  
**Date:** 2026-11-04  
**Auditor:** Senior Backend Architect  
**Classification:** Confidential Technical Assessment

---

## 1. Database Engine & Connection Pool Architecture

The existing FitOnus backend is configured to run on **PostgreSQL 15+** (tested and verified with PostgreSQL 17 in `compose.yaml`).

### 1.1 Connection Pool Configuration (`src/database/pool.ts`) [V]
The connection pool is instantiated using the native `pg.Pool` client:
- **`DATABASE_URL`:** PostgreSQL connection URI validated by Zod at startup.
- **`DATABASE_POOL_MAX`:** Maximum pool size (default: 10 connections, configurable 1–100).
- **`DATABASE_CONNECTION_TIMEOUT_MS`:** Connection acquisition timeout (default: 5,000ms).
- **`DATABASE_IDLE_TIMEOUT_MS`:** Idle connection eviction timeout (default: 30,000ms).
- **`DATABASE_STATEMENT_TIMEOUT_MS`:** Enforces statement execution timeout at the database level (`SET statement_timeout = 10000`) on newly acquired clients, preventing runaway queries from exhausting pool workers.
- **`DATABASE_SSL`:** Configurable as `disable`, `require`, or `verify-full`. The server issues an explicit warning if `DATABASE_SSL === 'disable'` in production environments.

---

## 2. Transaction Management & Unit of Work (`AsyncLocalStorage`)

A major engineering strength of the existing base kit is its **Unit of Work** implementation (`src/database/transaction.ts`), which eliminates the need to thread database transaction clients through controller and use case parameters [V].

```
[HTTP Request / Controller]
             │
             ▼
    [Use Case Execution]
             │
             ▼
[uow.execute(async () => { ... })]
  ├── Acquires dedicated client from pg.Pool
  ├── Executes "BEGIN"
  ├── Stores client in Node.js AsyncLocalStorage context
  │       │
  │       ▼ (Any Repository Call within this scope)
  │   [repo.findUserById()] ──► Retrieves active client from AsyncLocalStorage
  │   [repo.updateProfile()] ──► Executes on the SAME transactional client
  │       │
  ├── If execution succeeds: Executes "COMMIT"
  └── If exception is thrown: Executes "ROLLBACK" and releases client to pool
```

### 2.1 Transaction Error Mapping (`src/database/errors.ts`) [V]
PostgreSQL database engine errors are intercepted and translated into standardized domain `AppError` instances before reaching Express controllers:
- `23505` (Unique Violation) -> Translated to `AppError('conflict', 'CONFLICT', '...')`.
- `23503` (Foreign Key Violation) -> Translated to `AppError('unprocessable', 'FOREIGN_KEY_VIOLATION', '...')`.
- `40001` (Serialization Failure) / `40P01` (Deadlock Detected) -> Translated to `AppError('conflict', 'CONCURRENCY_CONFLICT', '...')`.

---

## 3. Migration Strategy & Integrity Verification

Database migrations are managed through a custom, zero-dependency migration runner (`src/database/migration-runner.ts`) [V]:

```
[Migration Execution: npm run db:migrate]
               │
               ▼
[Acquires Transactional Advisory Lock]
pg_advisory_xact_lock(hashtext('generic-backend-migrations'))
  (Blocks concurrent migration runs across multiple server instances)
               │
               ▼
[Reads schema_migrations Table]
  (Creates table if not exists: name, checksum, applied_at)
               │
               ▼
[Integrity Verification: SHA-256 Checksum]
  (Compares stored checksum with disk file; aborts if past migrations were edited)
               │
               ▼
[Applies Pending SQL Files in Lexicographical Order]
  (Executes each *.sql file inside its own transaction; records checksum)
```

- **Advisory Locking:** Guarantees that if two container replicas boot simultaneously, only one applies migrations while the other waits safely.
- **Checksum Verification:** Guarantees that historical migration files are never modified after being applied.
- **Limitation:** The runner is forward-only; rollback operations require forward-fixing migration scripts.

---

## 4. Complete Schema & Table Analysis

The existing database contains **exactly three tables** across three migrations (`migrations/0001` through `migrations/0003`):

### 4.1 `users` Table (`migrations/0001_create_users.sql`) [V]

```sql
CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  display_name  text        NOT NULL,
  password_hash text        NOT NULL,
  role          text        NOT NULL DEFAULT 'member',
  status        text        NOT NULL DEFAULT 'active',
  version       integer     NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz,

  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT users_display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 100),
  CONSTRAINT users_role_valid CHECK (role IN ('admin', 'member')),
  CONSTRAINT users_status_valid CHECK (status IN ('active', 'disabled')),
  CONSTRAINT users_disabled_at_consistent CHECK ((status = 'disabled') = (disabled_at IS NOT NULL)),
  CONSTRAINT users_version_positive CHECK (version > 0)
);

CREATE INDEX users_created_at_idx ON users (created_at DESC, id);
CREATE INDEX users_status_idx ON users (status);
```

#### Architectural Assessment:
- **Case-Insensitive Email Integrity:** Enforces normalization (`lower(btrim(email))`) directly in the database CHECK constraint, ensuring uniqueness without relying solely on application logic.
- **Optimistic Concurrency:** The `version` column supports optimistic concurrency control. Updates execute `UPDATE users SET ..., version = version + 1 WHERE id = $1 AND version = $expected_version`. If zero rows are affected, a concurrency conflict is thrown.
- **Status Consistency:** The check constraint `(status = 'disabled') = (disabled_at IS NOT NULL)` guarantees that timestamps and status flags cannot diverge.

---

### 4.2 `auth_sessions` Table (`migrations/0002_create_auth_sessions.sql`) [V]

```sql
CREATE TABLE auth_sessions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_token_hash text        NOT NULL,
  rotation_count     integer     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_used_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  revoke_reason      text,
  user_agent         text,
  ip_address         text,

  CONSTRAINT auth_sessions_refresh_token_hash_key UNIQUE (refresh_token_hash),
  CONSTRAINT auth_sessions_revocation_consistent CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL)),
  CONSTRAINT auth_sessions_revoke_reason_valid CHECK (
    revoke_reason IS NULL
    OR revoke_reason IN ('logout', 'logout_all', 'token_reuse', 'password_change', 'user_revoked', 'account_disabled')
  ),
  CONSTRAINT auth_sessions_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT auth_sessions_rotation_count_non_negative CHECK (rotation_count >= 0),
  CONSTRAINT auth_sessions_user_agent_length CHECK (user_agent IS NULL OR char_length(user_agent) <= 512),
  CONSTRAINT auth_sessions_ip_length CHECK (ip_address IS NULL OR char_length(ip_address) <= 64)
);

CREATE INDEX auth_sessions_user_active_idx ON auth_sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_expires_at_idx ON auth_sessions (expires_at);
```

#### Architectural Assessment:
- **Keyed Hash Storage:** Raw refresh tokens are never stored. The database stores only the HMAC-SHA256 hash of the token, preventing token compromise even in the event of database exfiltration.
- **Partial Indexing:** `auth_sessions_user_active_idx` indexes only active sessions (`WHERE revoked_at IS NULL`), keeping the index compact and lightning-fast for session validation queries.
- **Revocation Integrity:** The CHECK constraint enforces that whenever `revoked_at` is set, a valid `revoke_reason` must be provided.

---

### 4.3 `idempotency_keys` Table (`migrations/0003_create_idempotency_keys.sql`) [V]

```sql
CREATE TABLE idempotency_keys (
  scope           text        NOT NULL,
  operation       text        NOT NULL,
  idempotency_key text        NOT NULL,
  fingerprint     text        NOT NULL,
  status          text        NOT NULL,
  lock_token      uuid        NOT NULL,
  locked_until    timestamptz NOT NULL,
  response        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  expires_at      timestamptz NOT NULL,

  PRIMARY KEY (scope, operation, idempotency_key),
  CONSTRAINT idempotency_keys_status_valid CHECK (status IN ('in_progress', 'completed')),
  CONSTRAINT idempotency_keys_key_length CHECK (char_length(idempotency_key) BETWEEN 8 AND 255),
  CONSTRAINT idempotency_keys_completion_consistent CHECK (
    (status = 'completed') = (response IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys (expires_at);
```

#### Architectural Assessment:
- **Lease-Based Mutation Locking:** When an idempotent request arrives, an entry is inserted with `status = 'in_progress'` and a 60-second lease (`locked_until`). Concurrent retries are rejected or wait until the lease expires or the request completes.
- **Cached Response Replay:** Once completed, the full HTTP response (`jsonb`) is cached. Retried requests with identical payloads immediately replay the cached response with the HTTP header `Idempotent-Replayed: true`.

---

## 5. FitOnus Missing Domain Schemas (Gap Analysis)

The current database contains **0% of the schemas required for FitOnus as a fitness product** [V]. To fulfill the FitOnus product specifications (as detailed in `FitOnus/docs/`), the following schemas are missing:

| Missing Subsystem | Required Tables to Implement |
|---|---|
| **User Profile & Goals** | `user_profiles` (age, height, gender, weight, activity_level, fitness_goals, target_calories). |
| **Workout Subsystem** | `exercises`, `exercise_categories`, `workout_routines`, `workout_plans`, `workout_logs`, `workout_set_logs`, `personal_records`. |
| **Nutrition Subsystem** | `food_items`, `food_nutrients`, `meal_logs`, `meal_food_items`, `daily_nutrition_targets`, `water_logs`. |
| **Health Metrics** | `daily_health_summaries` (steps, active_calories, resting_hr, distance), `sleep_sessions`, `sleep_stages`, `weight_logs`, `body_measurements`. |
| **AI Coach Subsystem** | `ai_conversations`, `ai_messages`, `ai_user_memories`, `ai_embeddings` (requires `pgvector` extension for semantic search). |
| **Notifications & Reminders** | `notification_tokens` (FCM/Expo device push tokens), `user_reminders`, `notification_logs`. |
| **Subscriptions & Monetization**| `subscriptions`, `subscription_tiers`, `invoices`, `payment_transactions`. |

