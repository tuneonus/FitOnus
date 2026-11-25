# Phase 19: GenAI Ops — Docker, CI/CD, and Production Operations

Operational guide for building, verifying, configuring, and safely operating FitOnus across **Express 5 (`backend/`)**, **FastAPI AI (`ai-backend/`)**, **Next.js Admin (`admin/`)**, and **Expo Mobile (`mobile/`)** using low-cost managed infrastructure (Render, Neon PostgreSQL, Vercel, Cloudflare R2, and Expo EAS).

> **Scope & Safety Status:** Infrastructure and documentation artifacts only. No cloud resources were provisioned, no live migrations were executed, and no paid Gemini API calls were made. Updates to shared documentation indexes (`Resources/docs/INDEX.md`, `Resources/docs/ai-learning/existing-ai-engineering/00-learning-index.md`) are deferred while parallel Phase 13 and Phase 15 sessions are active.

---

## 1. Infrastructure Audit Summary

| Area | Pre-Phase 19 Gap | Phase 19 Resolution |
| --- | --- | --- |
| **PostgreSQL Extension Parity** | `backend/compose.yaml` and `.github/workflows/ci.yml` used `postgres:17-alpine`, which lacks `pgvector` required by migration `0029_create_vector_extension_and_knowledge_base.sql`. | Switched Compose and CI PostgreSQL services to `pgvector/pgvector:pg17` and wired `TEST_DATABASE_ADMIN_URL` in CI integration tests. |
| **Multi-Service Local Compose** | Only `backend/compose.yaml` existed (`name: generic-backend`) with no `ai-backend` orchestration or optional Neon preservation. | Added root [`compose.yaml`](../../../compose.yaml) with profiles (`local-db`, `local-migrate`, `ai`, `app`) and updated [`backend/compose.yaml`](../../../backend/compose.yaml) with resource limits and security hardening. |
| **Dockerfiles** | Uncached `npm ci` / `pip install`, `pip` retained in runtime venv, missing `STOPSIGNAL`, OCI labels, and `.env*` exception in `backend/.dockerignore`. | Added BuildKit cache mounts, stripped `pip`/`setuptools`/`wheel` from runtime `ai-backend`, tightened `.dockerignore`, preserved non-root users (`node` / `10001`), and enforced `STOPSIGNAL SIGTERM`. |
| **Environment Templates** | `admin/.env.example` did not exist; `backend/.env.example` failed `loadConfig()` due to partially populated `R2_*` keys and lacked `R2_PRIVATE_*` / `SHUTDOWN_TIMEOUT_MS`; `ai-backend/.env.example` lacked `NODE_API_URL` and Phase 10–12 flags. | Created [`admin/.env.example`](../../../admin/.env.example), updated `admin/.gitignore`, and synchronized [`backend/.env.example`](../../../backend/.env.example), [`ai-backend/.env.example`](../../../ai-backend/.env.example), and [`mobile/.env.example`](../../../mobile/.env.example). |
| **CI/CD & Security Gates** | `ci.yml` lacked path triggers, admin `tsc`/lint checks, mobile lint checks, Compose validation, container smoke tests, and Trivy scans; `ai-backend.yml` lacked `pip-audit`, explicit `GEMINI_API_KEY: ""`, and eval artifact uploads. | Updated [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) and [`.github/workflows/ai-backend.yml`](../../../.github/workflows/ai-backend.yml) with path filtering, offline eval gating, dependency/secret/container scanning, and `permissions: contents: read`. |

---

## 2. Production Docker Images

### 2.1 Node.js API (`backend/Dockerfile`)

- **Base image:** `node:22-bookworm-slim` (multi-stage: `deps` → `build` → `prod-deps` → `runtime`). Debian slim is used instead of Alpine so native modules (`sharp`, `argon2`, `libheif-js`) use prebuilt glibc binaries without build compilers in the image.
- **Reproducibility:** Pin base images by digest (`node:22-bookworm-slim@sha256:<digest>`) before production release promotions.
- **Caching & Size:** Uses BuildKit `--mount=type=cache,target=/root/.npm` during `npm ci`, ships only `dist/`, production `node_modules/`, `package.json`, and `migrations/` (for one-off migration execution).
- **Security:** Runs as built-in unprivileged user `node` (`uid 1000`); `.dockerignore` excludes `.env*`, `tests/`, `backups/`, and `*.sql` outside `migrations/`.
- **Lifecycle:** `STOPSIGNAL SIGTERM` + `/health/live` `HEALTHCHECK`.

```bash
# Build from repository root
docker build -t fitonus-backend:local -f backend/Dockerfile backend

# Verify non-root user and fail-closed startup (expects exit code 1 + JSON error on stderr)
docker run --rm --entrypoint id fitonus-backend:local -u
docker run --rm -e NODE_ENV=production fitonus-backend:local
```

### 2.2 Python AI Backend (`ai-backend/Dockerfile`)

- **Base image:** `python:3.12-slim-bookworm` (multi-stage: `build` → `runtime`).
- **Dependencies:** Installs exact versions from `ai-backend/requirements.txt` into `/opt/venv` with BuildKit pip cache mount, installs `onusfit_ai` (`--no-deps`), and removes `pip`/`setuptools`/`wheel` from `/opt/venv` to minimize image size and CVE surface.
- **Security:** Runs as non-root system user `app` (`10001:10001`, `--no-create-home`, `/usr/sbin/nologin`); `ONUSFIT_AI_ENV=production` is baked in so missing secrets abort startup immediately.
- **Concurrency Note:** Runs a single Uvicorn worker (`exec uvicorn ... --timeout-keep-alive 65 --no-server-header`) intentionally because the JWT `jti` replay cache and Gemini model cooldown tracker are stored in process memory.

```bash
# Build from repository root
docker build -t onusfit-ai-backend:local -f ai-backend/Dockerfile ai-backend

# Verify non-root user and liveness probe (never calls Gemini)
docker run --rm --entrypoint id onusfit-ai-backend:local -u
docker run -d --name ai-smoke -p 10000:10000 \
  -e AI_SERVICE_JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(24))')" \
  -e GEMINI_API_KEY="smoke-test-unused-key" \
  onusfit-ai-backend:local
curl -fsS http://127.0.0.1:10000/health/live
docker stop --time 10 ai-smoke && docker rm ai-smoke
```

---

## 3. Local Development with Docker Compose

Root [`compose.yaml`](../../../compose.yaml) supports both **Neon cloud PostgreSQL** and **optional local PostgreSQL 17 + `pgvector`**:

### Mode A: Neon Cloud DB + Local Containers (Recommended for Neon Parity)

Keep `DATABASE_URL` in `backend/.env` pointed at your Neon DEV branch (`sslmode=require`, `DATABASE_SSL=require`) and ensure `AI_BACKEND_SERVICE_SECRET` in `backend/.env` matches `AI_SERVICE_JWT_SECRET` in `ai-backend/.env`:

```bash
cp backend/.env.example backend/.env        # populate DEV secrets + Neon DATABASE_URL
cp ai-backend/.env.example ai-backend/.env  # populate shared JWT secret + GEMINI_API_KEY
docker compose --profile app up --build
```

`compose.yaml` wires container DNS (`AI_BACKEND_URL=http://ai-backend:10000`, `NODE_API_URL=http://api:3000`) automatically without modifying host `.env` URLs, and skips starting a local Postgres container.

### Mode B: Optional Local PostgreSQL 17 (`pgvector/pgvector:pg17`)

For completely offline local development:

```bash
# 1. Start local pgvector database only (host-run Node/Python connects to 127.0.0.1:5432)
docker compose --profile local-db up -d

# 2. Or run migrations + full containerized stack (set DATABASE_URL=postgres://app:<pw>@db:5432/app_dev and DATABASE_SSL=disable in backend/.env)
docker compose --profile local-migrate run --rm migrate
docker compose --profile app up --build
```

### Mode C: Backend-Only Compose (`backend/compose.yaml`)

Preserved for existing `backend/docs/development.md` workflows (`docker compose up -d db` inside `backend/`), upgraded to `pgvector/pgvector:pg17`, `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges:true`, resource limits (`512m` / `1.0` CPU), and `stop_grace_period: 20s`.

---

## 4. Environment Management & Secrets

| Component | Template | Secret Boundary & Validation |
| --- | --- | --- |
| `backend/` | [`backend/.env.example`](../../../backend/.env.example) | Zod-validated at boot (`backend/src/config/env.ts`). Production (`NODE_ENV=production`) rejects placeholder secrets (`change-me`), identical `JWT_ACCESS_SECRET`/`HMAC_SECRET`, non-HTTPS `CORS_ORIGINS`, `LOG_PRETTY=true`, and unset `AUTH_PUBLIC_REGISTRATION`. Requires `AI_BACKEND_URL` and `AI_BACKEND_SERVICE_SECRET` (>= 32 chars). |
| `ai-backend/` | [`ai-backend/.env.example`](../../../ai-backend/.env.example) | Checked at lifespan startup (`configuration_problems()`). Production (`ONUSFIT_AI_ENV=production`) exits non-zero if `AI_SERVICE_JWT_SECRET` (< 32 chars) or `GEMINI_API_KEY` is missing/invalid. |
| `admin/` | [`admin/.env.example`](../../../admin/.env.example) | `NEXT_PUBLIC_API_URL` only. Browser-bundled; **never** store secrets in `NEXT_PUBLIC_*`. |
| `mobile/` | [`mobile/.env.example`](../../../mobile/.env.example) | `EXPO_PUBLIC_API_URL` only; environment-specific URLs live in `mobile/eas.json` profiles (`preview`, `internal-testing`, `production`). `GOOGLE_SERVICES_JSON` is injected via EAS file secret. |

**Secret Rules:**
- Real `.env`, `.env.*`, and `backend/.env.primary.backup` are gitignored; never commit them.
- Use independent random >= 32-byte secrets for `JWT_ACCESS_SECRET`, `HMAC_SECRET`, and `AI_BACKEND_SERVICE_SECRET` (`AI_SERVICE_JWT_SECRET`).
- Keep `backend/` and `ai-backend/` on separate Gemini keys/quotas or use the `ai-backend/` key as the sole inference key with Google Cloud budget alerts enabled.

---

## 5. CI/CD & Offline AI Evaluation Pipeline

### 5.1 Main CI Workflow ([`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml))

- **Permissions:** Top-level `permissions: contents: read` (least privilege).
- **Path-based Triggers & Change Detection:** Workflow `paths` + `changes` job prevent mobile-only or docs-only commits from triggering unnecessary backend integration/Docker builds.
- **Jobs:**
  - `backend-quality`: `typecheck`, `lint`, `format:check`, `npm test`, `npm run build`, `node --env-file=.env.example` config validation, `npm audit --omit=dev --audit-level=high`.
  - `backend-migrations`: `pgvector/pgvector:pg17` service; applies all migrations and verifies idempotent second pass.
  - `backend-integration`: `pgvector/pgvector:pg17` service via `TEST_DATABASE_ADMIN_URL` (`npm run test:int`).
  - `mobile-quality`: `typecheck`, `lint`, `npm test` (using cached backend `tsx`), `npm audit --omit=dev --audit-level=high`.
  - `admin-quality`: `node_modules/.bin/tsc --noEmit`, `npm run lint`, `npm run build`, `npm test`, `npm audit --omit=dev --audit-level=high`.
  - `compose-validate`: validates `compose.yaml` and `backend/compose.yaml` schemas with temporary example `.env` copies.
  - `secrets`: Gitleaks (`ghcr.io/gitleaks/gitleaks:v8.28.0`) over Git history using `.gitleaksignore`.
  - `docker`: builds `fitonus-backend:ci`, verifies non-root `uid != 0`, verifies fail-closed startup, tests `/health/live`, `/health/ready`, migrations, and `SIGTERM` against `pgvector/pgvector:pg17`, and scans with Trivy (`aquasec/trivy:0.58.2`, failing on fixable `CRITICAL` CVEs).

### 5.2 AI Backend & Evaluation Workflow ([`.github/workflows/ai-backend.yml`](../../../.github/workflows/ai-backend.yml))

- **Permissions & Triggers:** `permissions: contents: read`; scoped to `ai-backend/**`, `compose.yaml`, and `.github/workflows/ai-backend.yml`.
- **Zero Live Gemini Calls in Routine CI:** Both `python-quality` and `ai-evals` explicitly set `GEMINI_API_KEY: ""` and `ONUSFIT_AI_ENV: test`.
- **Offline Evaluation Gate (`ai-evals`):**
  1. Runs `python -m pytest tests/evals -q`.
  2. Runs `python tests/evals/runner.py --output-json tests/evals/results/ci_report.json --output-md tests/evals/results/ci_report.md` (offline mode only, `$0` API cost).
  3. Asserts `mode == "offline"`, `is_live_evaluation is False`, `live_baseline_status == "NOT MEASURED"`, and `summary.failed_cases == 0`.
  4. Uploads `ci_report.json` and `ci_report.md` as 14-day workflow artifacts.
- **Security Gate (`security-scan` + `docker`):** Runs `pip-audit -r ai-backend/requirements.txt`, Gitleaks over `ai-backend/`, Docker startup/401 smoke tests, and Trivy image scanning.

---

## 6. Deployment Readiness, Migrations & Rollback

### 6.1 Health, Readiness & Graceful Shutdown

- **Node Backend (`backend/`):**
  - `GET /health/live` → HTTP 200 `{ status: "ok" }` (liveness).
  - `GET /health/ready` → HTTP 200 when `SELECT 1` succeeds and not shutting down; HTTP 503 during shutdown or DB outage (readiness).
  - `SIGTERM` triggers `container.lifecycle.beginShutdown()`, marks `/health/ready` 503, stops background dispatchers/purgers/workers, closes HTTP idle connections, drains in-flight requests up to `SHUTDOWN_TIMEOUT_MS` (`10000` ms default), and closes `pg.Pool`. Set container `stop_grace_period` / orchestrator grace period >= `15s`–`20s`.
- **Python AI Backend (`ai-backend/`):**
  - `GET /health/live` → HTTP 200 `{ status: "ok", service: "onusfit-ai-backend", version, environment }` (checks no external provider or DB).
  - `SIGTERM` stops Uvicorn cleanly (`--timeout-keep-alive 65` matches long-lived Node connection pooling).

### 6.2 Database Migration Execution Procedure

The HTTP API never executes migrations on startup. Always run migrations as a discrete release step **before** routing traffic to new code:

1. Take a pre-migration Neon branch snapshot / confirm PITR recovery window in Neon Console.
2. Verify current migration status (read-only):
   ```bash
   DATABASE_URL="<TARGET_POOLER_OR_DIRECT_URL>" node backend/dist/scripts/migrate.js status
   ```
3. Run pending forward-only migrations using the **migrator** role (acquires PostgreSQL advisory lock `72410318`, verifies SHA-256 checksums of applied files):
   ```bash
   DATABASE_URL="<MIGRATOR_DATABASE_URL>" node backend/dist/scripts/migrate.js
   ```
4. Keep runtime application connections on a least-privilege **runtime** role (`SELECT, INSERT, UPDATE, DELETE` + sequence `USAGE`, no DDL ownership) as documented in [`backend/docs/database.md`](../../backend/docs/database.md#least-privilege).
5. Schedule periodic cleanup (`node dist/scripts/cleanup.js` via Render Cron or external scheduler, e.g., hourly) to prune expired `idempotency_keys` and stale `auth_sessions`.

### 6.3 Rollback Procedures

| Component | Rollback Action | Notes / Caveats |
| --- | --- | --- |
| **Node API (`backend/` on Render)** | Render Dashboard → **Deploys** → redeploy last known-good commit/image. | Migrations are forward-only; keep schema changes expand-then-contract compatible so the previous Node build still runs against newly added nullable columns/tables. |
| **AI Backend (`ai-backend/` on Render)** | Render Dashboard → **Deploys** → redeploy previous deploy. | Failed deploys never replace healthy running instances (`ONUSFIT_AI_ENV=production` fails fast on bad config). |
| **Database (Neon PostgreSQL)** | Restore to pre-release Neon instant branch / PITR timestamp and point `DATABASE_URL` to the restored branch endpoint. | Never edit already-applied `.sql` files; the migration runner refuses checksum mismatches. |
| **Admin (`admin/` on Vercel)** | Vercel Dashboard → **Deployments** → **Instant Rollback** to prior production deployment. | Ensure `NEXT_PUBLIC_API_URL` matches target API version. |
| **Mobile (`mobile/` on Expo / Play)** | Halt rollout in Google Play Console or promote previous AAB / publish OTA JS fix if native deps unchanged. | Store builds bake `EXPO_PUBLIC_API_URL` at build time (`eas.json`). |
| **Service JWT Rotation** | Update `AI_SERVICE_JWT_SECRET` (Python) and `AI_BACKEND_SERVICE_SECRET` (Node) together during a low-traffic window, then redeploy both. | Only one active secret is accepted at a time; AI requests return `503` (or deterministic insights fallback) during the brief mismatch window. |

---

## 7. Cost-Optimized Deployment Architecture

FitOnus intentionally avoids Kubernetes, Kafka, Redis, and extra microservices at current scale:

```text
Expo Mobile App (EAS Build) ──HTTPS──▶ Render Web Service (backend/, Docker, 1 instance)
                                            │                    │
Admin Next.js (Vercel Hobby/Pro) ───────────┘                    ├─▶ Neon PostgreSQL + pgvector
                                            │                    └─▶ Cloudflare R2 (Public + Private buckets)
                                            ▼ (30s HS256 JWT, Private/Internal Network)
                                      Render Service (ai-backend/, Docker, 1 worker) ──▶ Google Gemini API
```

| Service | Low-Cost Choice | Why It Fits & Guardrails |
| --- | --- | --- |
| **Node API (`backend/`)** | Render Web Service (Docker) | Single modular monolith avoids microservice orchestration overhead; in-memory rate limits and dispatchers require no Redis on 1 instance. |
| **AI Service (`ai-backend/`)** | Render Paid Private Service (same region/workspace as Node) or Paid Web Service | Avoid Free tier for `ai-backend` in production: Free tier sleeps after 15 min idle (~60 s cold start), exceeding Node's 22–27 s timeout. Keep 1 instance so in-memory replay cache and model cooldown remain consistent. |
| **Database** | Neon PostgreSQL (Serverless + `pgvector`) | Eliminates separate vector DB (Pinecone/Qdrant/Weaviate) by hosting relational + `pgvector` HNSW + GIN full-text in one database, with instant branch snapshots and PITR. |
| **Admin Console (`admin/`)** | Vercel | Native Next.js App Router hosting with zero container upkeep; preview deployments map cleanly to Render DEV. |
| **Media & Assets** | Cloudflare R2 (Public + Private buckets) | Zero egress fees for public workout/exercise/notification artwork; short-lived signed URLs for private member photos. |
| **LLM Costs & Quotas** | Gemini Flash / Flash-Lite + Node `AiUsageGate` | Enforces per-user daily caps and burst limits in Node; CI runs **100% offline evals (`$0`)**; set hard spend/quota alerts in Google AI Studio / GCP Console. |
| **Omitted Infrastructure** | No Kubernetes, Kafka, Redis, or extra services | Current single-instance workloads use Postgres-backed queues (`private_media_deletions`, `idempotency_keys`) and in-memory limiters. Revisit Redis (`AiRateLimitStore`) only when horizontally scaling Node to `>= 2` replicas. |

---

## 8. Verification Commands & Operational Limitations

### 8.1 Verification Commands

```bash
# 1. Validate env templates & backend unit/build checks
(cd backend && node --env-file=.env.example --import tsx -e "import { loadConfig } from './src/config/env.js'; console.log(loadConfig(process.env).env)")
npm --prefix backend run typecheck && npm --prefix backend test && npm --prefix backend run build

# 2. Validate Compose configs (once Docker & Compose CLI are available)
docker compose -f compose.yaml --profile local-db --profile local-migrate --profile app config -q
docker compose -f backend/compose.yaml --profile app config -q

# 3. Validate offline AI evaluation pipeline (zero Gemini API calls)
(cd ai-backend && GEMINI_API_KEY="" .venv/bin/python tests/evals/runner.py --output-json /tmp/eval_ci.json --output-md /tmp/eval_ci.md)

# 4. Validate Admin & Mobile
(cd admin && node_modules/.bin/tsc --noEmit && npm test)
npm --prefix mobile run typecheck && npm --prefix mobile run lint && npm --prefix mobile test
```

### 8.2 Finalization Verification Snapshot & Known Blockers

| Check / Gate | Result | Notes |
| --- | --- | --- |
| **Backend (`typecheck`, `build`, unit `test`)** | **PASS** | `tsc --noEmit`, `tsc -p tsconfig.build.json`, and Vitest (`191` files, `2920` tests) passed; `.env.example` passed `loadConfig()`, `loadDatabaseConfig()`, `assertAiBackendConfigured()`, and Prettier. |
| **Backend (`npm audit --omit=dev --audit-level=high`)** | **PASS** | `0` vulnerabilities. |
| **Backend (`lint`, `format:check`)** | **FAIL (Pre-existing)** | `98` pre-existing ESLint errors and `147` formatting mismatches outside Phase 19 scope. |
| **Admin (`tsc --noEmit`, `test`, `build`)** | **PASS** | `0` TS errors, `299/299` tests passed, Next.js production build succeeded. |
| **Admin (`lint`, `npm audit --omit=dev --audit-level=high`)** | **FAIL (Pre-existing)** | `19` ESLint errors (`17` warnings); `npm audit` reported `6` runtime vulnerabilities (`1` moderate, `4` high, `1` critical in `next`/`sharp`/`postcss`/`nanoid`/`source-map-js`). |
| **Mobile (`typecheck`, `lint`, `test`, `npm audit`)** | **PASS** | `0` TS errors, `0` ESLint errors (`18` warnings), `870/870` tests passed; `npm audit --audit-level=high` exited `0` (`9` moderate only). |
| **AI Offline Benchmark (`evals/runner.py`)** | **PASS** | `277/277` passed (`100.0%`, `OFFLINE`, `LIVE BASELINE: NOT MEASURED`, `GEMINI_API_KEY=""`). Earlier `ExpectedToolCall(extra="forbid")` error on `expected_tools.0.required` resolved once concurrent Phase 13 edits settled. |
| **AI Backend (`ruff`, `mypy`, `pytest tests/evals`)** | **FAIL (Concurrent WIP)** | Active Phase 13/17 work causes `ruff check` (`12` errors), `mypy` (`3` errors in `audio.py` & `agent/executor.py`), and `test_multimodal_eval.py` import collection failure (`tests.evals.evaluators.base`). |
| **Workflow YAML, Compose Schema, Dockerfile Static Checks** | **PASS** | Both workflows pass PyYAML + DAG/permission checks; both Compose files validate against `compose-spec.json`; Dockerfiles pass non-root/stage/health/ignore checks. |
| **Docker Build, Container Smoke Tests, Trivy, Gitleaks, `actionlint`, `pip-audit`** | **BLOCKED (Local Tools Missing)** | `docker`, `docker-compose`, `actionlint`, `gitleaks`, `trivy`, and `pip-audit` binaries are not installed on this workstation; runtime container & scanner execution awaits CI or a Docker host. |

### 8.3 Unblocking Local Docker & Operational Limitations

1. **Install Docker Engine, Buildx, and Compose on Ubuntu/Debian (when ready to verify containers locally):**
   ```bash
   sudo apt-get update
   sudo apt-get install -y ca-certificates curl
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   sudo chmod a+r /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt-get update
   sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```
2. **Testcontainers Image in `global-setup.ts`:** `backend/tests/helpers/global-setup.ts` defaults to `postgres:17-alpine` when `TEST_DATABASE_ADMIN_URL` is unset. CI sets `TEST_DATABASE_ADMIN_URL` to `pgvector/pgvector:pg17`; local integration runs without `TEST_DATABASE_ADMIN_URL` need a local `pgvector` URL or a dedicated backend test update.
3. **Single-Instance In-Memory State:** Rate-limit stores (`backend`), JWT `jti` replay cache (`ai-backend`), and model cooldown state (`ai-backend`) are per-process. Scaling beyond 1 replica requires shared state (e.g., Redis) and dual-secret rotation support.
4. **Deferred Index Updates:** Linking this guide in `Resources/docs/INDEX.md` and `Resources/docs/ai-learning/existing-ai-engineering/00-learning-index.md` is deferred while parallel Phase 13/15/17 sessions are modifying them.
