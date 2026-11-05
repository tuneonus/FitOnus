# FitOnus Backend Audit — CareSure Architecture Comparison & Pattern Analysis

**Document Reference:** `FitOnus/backend/BACKEND_AUDIT/CARESURE_ARCHITECTURE_COMPARISON.md`  
**Status:** Complete & Verified Technical Audit  
**Date:** 2026-11-04  
**Auditor:** Senior Backend Architect  
**Classification:** Confidential Technical Assessment

---

## 1. High-Level Architectural Comparison

A structural comparison between the CareSure healthcare reference platform and the FitOnus backend base kit highlights fundamental differences in system topology, data consistency, and security boundaries:

| Architectural Dimension | CareSure Platform (Reference System) | FitOnus Backend (Existing Base Kit) | Architectural Assessment |
|---|---|---|---|
| **System Topology** | Distributed Microservices (Gateway + 3 Services + 7 Frontends). | **Modular Monolith** (`ADR 0001`): Single deployable Express 5 process. | **FitOnus is Superior:** Eliminates network failure modes, RPC overhead, and deployment complexity for early-to-mid stage scale. |
| **Database Architecture** | Shared PostgreSQL Cluster with 3 Isolated Logical Databases. | **Single PostgreSQL Database** with schema boundaries. | **FitOnus is Superior:** Enables true multi-table ACID transactions across modules; eliminates distributed data synchronization issues. |
| **Data Access Layer** | Raw SQL via `pg`; fragmented transaction helpers across services. | Raw SQL via `pg` with **`AsyncLocalStorage` Unit of Work** (`ADR 0002`). | **FitOnus is Superior:** Clean use-case transactions without threading database connection instances. |
| **Access Token Protocol** | Asymmetric RS256 JWTs with JWKS Discovery (`/.well-known/jwks.json`). | Symmetric HS256 JWTs pinned to `JWT_ISSUER` and `JWT_AUDIENCE`. | **FitOnus is Appropriate:** RS256 is only necessary when multiple external services verify tokens; HS256 provides lower verification overhead for a monolith. |
| **Session Revocation** | Redis Kill-List (`revoked:sid:*`); **Fails Open** when Redis is down (`R13`). | **Database-Backed Sessions** (`auth_sessions`); **Fails Closed** (`ADR 0003`). | **FitOnus is Far More Secure:** Immediate session termination; zero window of vulnerability during cache downtime. |
| **Token Transport** | Cookie-first issuance; response body never contains refresh tokens. | Standard JSON Response Body (`accessToken`, `refreshToken`, `expiresIn`). | **FitOnus is Far Better for Mobile:** Avoids native mobile cookie-jar complexities; allows secure storage in Expo SecureStore. |
| **Authorization Model** | Inconsistent RBAC (`allOf` in Identity vs `anyOf` in Order/Catalog with `ADMIN` bypass). | Code-defined permissions (`ROLE_PERMISSIONS`); **Zero role-name bypasses**. | **FitOnus is Far More Secure:** Prevents privilege escalation and unintended superuser access. |
| **State Machine Updates** | Unconditional updates (`UPDATE orders SET status = $1 WHERE id = $2`). | Optimistic Concurrency Control via `version` column (`WHERE id = $1 AND version = $v`). | **FitOnus is Superior:** Prevents lost updates under concurrent access. |
| **Mutations Idempotency** | Fragmented body-based idempotency keys on select use cases. | Standardized `Idempotency-Key` HTTP header with lease locking and replay. | **FitOnus is Superior:** Enterprise-grade mutation deduplication. |

---

## 2. Patterns Worth Adopting from CareSure into FitOnus

The following proven patterns identified during the CareSure audit should be integrated as FitOnus expands into domain features:

### 2.1 Transactional Outbox Pattern with `SKIP LOCKED` [V]
- **CareSure Evidence:** `catalog-service/src/workers/outbox-relay.worker.ts:42-76`.
- **FitOnus Application:** When FitOnus implements asynchronous workflows (e.g., generating AI daily insights, syncing wearable records, or firing push notifications), domain events should be written to an `outbox_events` table inside the business transaction. A background worker should poll using `FOR UPDATE SKIP LOCKED`, guaranteeing event delivery without distributed transactions.

### 2.2 Background Job Engine + 15-Minute Self-Healing Reconciliation Sweeps [V]
- **CareSure Evidence:** `order-service/src/server.ts` (Refill, OCR, and billing sweeps).
- **FitOnus Application:** When integrating with external fitness APIs (Health Connect, Apple HealthKit) or scheduling daily AI coaching prompts, job queues can stall. FitOnus should adopt CareSure's strategy: schedule exact-time queue jobs (via `pg-boss`), backed by an idempotent 15-minute reconciliation sweep that detects and re-enqueues stalled tasks.

### 2.3 Transactional Status Audit Logs [V]
- **CareSure Evidence:** `order_status_logs` written in the exact same SQL transaction as order updates.
- **FitOnus Application:** As workouts, fasting periods, or subscription states transition through lifecycles, state transition history tables should be written within the same transaction to provide a 100% reliable audit trail.

---

## 3. Patterns Requiring Adaptation

### 3.1 Media Upload Pipeline (Progress & Meal Photos)
- **CareSure Design:** Uploads were buffered in server memory (Multer 10 MB buffer) and proxied through the API Gateway to S3.
- **FitOnus Adaptation:** FitOnus users will upload meal photos (for nutrition AI logging) and progress photos. Memory buffering would quickly exhaust Node.js heap memory. FitOnus must adapt this by implementing **direct-to-S3 presigned PUT URLs**. The API returns a signed URL; the mobile client uploads directly to S3; the client then calls a completion endpoint with file metadata.

### 3.2 Real-Time WebSocket Infrastructure
- **CareSure Design:** Handshake-only auth; unscoped staff broadcast rooms (`role_user`); no Redis adapter across gateway replicas.
- **FitOnus Adaptation:** If real-time features are required (e.g., live workout telemetry, active rest timers), WebSockets must authenticate during handshake AND periodically re-validate sessions, with rooms strictly scoped to the individual user (`user:<userId>`).

---

## 4. Anti-Patterns to Strictly Avoid (CareSure Flaws)

| CareSure Anti-Pattern | Evidence in CareSure | Why FitOnus Must Avoid It |
|---|---|---|
| **Dual-Trust Middleware (`internalOrAdminAuth`)** | 61 identity routes admitted any staff token or service key (`G1–G15`). | Machine-to-machine integrations must never share authentication guards with human user sessions. |
| **Unverified Financial / Balance Credits** | `POST /customers/wallet/topup` allowed users to credit their own balances (`R1`). | Any gamified point, coin, or credit system in FitOnus must be cryptographically verified or earned through validated activities. |
| **Post-Commit Uncompensated Side Effects** | Wallet debits and coupon usages occurred via HTTP after order commit (`create-order.usecase.ts:155`). | All side effects impacting user state must be part of the atomic transaction or coordinated via transactional outbox. |
| **Secrets in Database Tables** | Third-party API keys stored in the `settings` table beside plaintext encryption keys (`R6`). | All FitOnus credentials (OpenAI keys, database passwords, JWT secrets) must reside in environment variables or cloud secret managers. |
| **Monolithic In-Process Background Workers** | BullMQ workers, OCR processing, and 1-minute intervals ran inside web API server processes. | FitOnus must separate background workers into a dedicated worker process (`src/worker.ts`) to avoid starving HTTP event loops. |
| **Unescaped Content Interpolation** | Notification templates rendered via `dangerouslySetInnerHTML` (`R9`). | Any AI-generated advice or notification must be sanitized and rendered securely without raw HTML execution. |

---

## 5. Existing FitOnus Components to Strictly Preserve

The following core components in `FitOnus/backend` are exceptionally well-engineered and must be **preserved intact**:
1. **`src/shared/http/route.ts` & `openapi.ts`:** Declarative route specifications with compile-time access enforcement and auto-generated OpenAPI 3.1 documentation.
2. **`src/database/transaction.ts`:** `AsyncLocalStorage` Unit of Work transaction manager.
3. **`src/database/migration-runner.ts`:** Checksummed, advisory-locked forward migration runner.
4. **`src/modules/auth/` & `auth_sessions`:** Argon2id hashing, database-backed session validation, and CAS single-use refresh token rotation.
5. **`src/shared/idempotency/`:** Lease-based idempotent mutation engine.

