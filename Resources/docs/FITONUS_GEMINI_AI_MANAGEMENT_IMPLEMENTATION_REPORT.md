# FITONUS — ADMIN GEMINI AI MANAGEMENT & COST TRACKING IMPLEMENTATION REPORT

**Target Environment:** Neon PostgreSQL DEV Branch  
**Date:** November 9, 2026  
**Role:** Senior Full Stack Architect, AI Integration Engineer, Database Engineer & Application Security Engineer  

---

## 1. Executive Summary

FitOnus has successfully extended the **Admin → Application Settings → AI Management** module with enterprise-grade capabilities:
1. **Secure Gemini API Key Management**:
   - Zero client-side leakage (backend proxy architecture strictly maintained).
   - Authenticated **AES-256-GCM** encryption with unique 12-byte IV and 16-byte authentication tags.
   - Master key separation (stored exclusively in host environment, never in PostgreSQL).
   - In-memory masking (`AIzaSy...XXXX`) for all admin views.
   - Real-time pre-activation connection testing.
   - Key rotation with version locking and atomic one-click rollback to the previous working key.
2. **Dynamic Gemini Model Configuration & Per-Feature Overrides**:
   - Remote model routing without mobile app updates or backend redeployments.
   - Per-feature model configuration for:
     - **AI Coach Chat** (`coach_chat`)
     - **Meal Photo Scanner** (`meal_photo`)
     - **Voice Meal Entry** (`voice_meal`)
     - **Workout Generator** (`workout_generator`)
   - Modality capability enforcement (vision, audio, structured JSON).
3. **Usage Telemetry & Real-Time Token Analytics**:
   - Request-level audit logging into `gemini_usage_events`.
   - Granular prompt tokens, completion tokens, cached tokens, and latency tracking.
   - Live estimated cost calculation in USD and converted INR using official Google Gemini pricing tables.
4. **Interactive Admin Analytics Dashboard**:
   - KPI metrics: Today's Requests, Monthly Requests, Total Tokens, Estimated Monthly Cost (USD & INR), Average Latency, and Error Count.
   - Consumption breakdown by AI Feature and by Gemini Model.
   - 30-day daily usage trends.
   - Granular, filterable request telemetry logs with pagination.

---

## 2. System Audit & Baseline

Prior to implementation, a full codebase audit was performed across `backend/`, `admin/`, and `mobile/`:
- **API Key Storage:** Previously relied entirely on a static `GEMINI_API_KEY` environment variable. Plaintext storage or direct dynamic rotation was unavailable.
- **Model Configuration:** Hardcoded to `gemini-2.5-flash` in code constructors without runtime flexibility.
- **Mobile Security:** Mobile client never calls Google Gemini directly and does not possess any Gemini API keys. All AI operations are proxied through backend endpoints (`/coach/chat`, `/nutrition/meal-photo/analyze`, `/nutrition/voice-meal/parse`, `/workouts/generate`).
- **Telemetry:** Token usage, response duration, and API expenditure were completely uncaptured.

---

## 3. Database Architecture (Neon DEV Migration 0015)

Applied versioned migration [`0015_create_gemini_management.sql`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/migrations/0015_create_gemini_management.sql) to Neon DEV:

### 3.1 Schema Summary

1. `gemini_config`:
   - `provider`: Primary key (`google_gemini`).
   - `encrypted_api_key`: Ciphertext string (AES-256-GCM payload with IV and auth tag).
   - `key_mask`: Safe string mask (`AIzaSy...XXXX`).
   - `previous_encrypted_api_key`: Previous active encrypted key for atomic rollback.
   - `previous_key_mask`: Safe mask of the previous key.
   - `default_model`: System-wide fallback Gemini model.
   - `coach_model`, `meal_photo_model`, `voice_meal_model`, `workout_generator_model`: Feature-specific overrides.
   - `version`: Optimistic locking integer counter.
   - `updated_by`: Foreign key reference to `users(id)`.
   - `updated_at`: Timestamp.

2. `gemini_pricing`:
   - `model`: Unique model identifier (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-lite`, `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`).
   - `input_price_per_million`: Standard input rate (e.g. $0.075 for Flash, $1.25 for Pro).
   - `output_price_per_million`: Standard output rate (e.g. $0.30 for Flash, $5.00 for Pro).
   - `cached_input_price_per_million`: Cached prompt rate (e.g. $0.01875 for Flash).
   - `supports_vision`, `supports_audio`: Capability flags.

3. `gemini_usage_events`:
   - `id`: UUID primary key.
   - `request_id`: Tracing identifier.
   - `user_id`: Caller user ID (or NULL for system requests).
   - `feature`: Action category (`coach_chat`, `meal_photo`, `voice_meal`, `workout_generator`).
   - `model`: Resolved model name at execution time.
   - `status`: Execution status (`success` or `error`).
   - `input_tokens`, `output_tokens`, `cached_tokens`, `total_tokens`: Token metrics.
   - `estimated_cost_usd`: Calculated API cost.
   - `duration_ms`: Round-trip latency in milliseconds.
   - `error_category`: Normalized error classifier (e.g., `RATE_LIMITED`, `INVALID_ARGUMENT`).
   - `created_at`: UTC timestamp with B-Tree indices for date and feature queries.

---

## 4. Cryptographic Security & Key Governance

Implemented in [`backend/src/shared/security/encryption.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/shared/security/encryption.ts):
- **Algorithm:** Authenticated **AES-256-GCM** (Galois/Counter Mode).
- **Key Derivation:** SHA-256 digest of server-side `HMAC_SECRET` / `AI_ENCRYPTION_KEY`.
- **Initialization Vector:** 96-bit (12-byte) cryptographically secure pseudo-random bytes generated fresh per encryption.
- **Integrity Tag:** 128-bit (16-byte) authentication tag validated prior to returning decrypted plaintext.
- **Key Masking Function:**
  ```ts
  export function maskApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length < 8) return '••••••••';
    const prefix = apiKey.slice(0, 6);
    const suffix = apiKey.slice(-4);
    return `${prefix}...${suffix}`;
  }
  ```
- **Zero Plaintext Invariant:** The database only ever stores ciphertext JSON (`ciphertext`, `iv`, `authTag`). Plaintext keys are never output in responses or logs.

---

## 5. Backend Architecture & Runtime Integration

### 5.1 Clean Architecture Modules

1. **Domain Entities:** [`gemini-config.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/modules/app-settings/domain/gemini-config.ts)
2. **Ports & Repository:** [`pg-app-settings-repository.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/modules/app-settings/infrastructure/pg-app-settings-repository.ts)
3. **Use Cases:**
   - [`GetGeminiConfigUseCase`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/modules/app-settings/application/use-cases/get-gemini-config.ts)
   - [`UpdateGeminiConfigUseCase`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/modules/app-settings/application/use-cases/update-gemini-config.ts)
   - [`TestGeminiConnectionUseCase`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/modules/app-settings/application/use-cases/test-gemini-connection.ts)
   - [`RollbackGeminiKeyUseCase`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/modules/app-settings/application/use-cases/rollback-gemini-key.ts)
   - [`GetGeminiUsageAnalyticsUseCases`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/modules/app-settings/application/use-cases/get-gemini-usage.ts)
4. **Runtime Telemetry Interceptor:**
   [`GeminiRuntimeService`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/modules/app-settings/application/services/gemini-runtime-service.ts) resolves active keys/models, manages in-memory caching with 60s TTL, computes token costs, and asynchronously records usage telemetry.
5. **Controllers & Endpoints:**
   Mounted under `/api/v1/admin/ai`:
   - `GET /configuration`: Retrieve active masked configuration and resolved models.
   - `PATCH /configuration`: Update key, default model, and feature overrides with version check.
   - `POST /test-connection`: Ping Gemini API with active or candidate key.
   - `POST /rollback-key`: Restore previous working key.
   - `GET /models`: Retrieve model catalog with token pricing.
   - `GET /usage/summary`: High-level usage and cost metrics.
   - `GET /usage/by-feature`: Breakdown by AI capability.
   - `GET /usage/by-model`: Breakdown by Gemini model.
   - `GET /usage/trends`: Daily volume and cost trends.
   - `GET /usage`: Granular request logs with pagination.

---

## 6. Admin Panel UI Implementation

Implemented in `admin/src/features/settings/`:
- **API Client:** [`api-ai.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/settings/api-ai.ts)
- **Types:** [`types-ai.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/settings/types-ai.ts)
- **State Hook:** [`useGeminiSettings.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/settings/hooks/useGeminiSettings.ts)
- **Components:**
  1. [`GeminiConfigSection.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/settings/components/GeminiConfigSection.tsx):
     - Active key card with encryption status badge, test connection button with latency display, rotate button, and rollback button.
     - Dynamic model selection: Default system model selector + 4 feature cards (AI Coach, Meal Photo Scanner with Vision badge, Voice Meal Entry with Audio badge, Workout Generator).
     - Save button with version conflict notification.
  2. [`GeminiAnalyticsSection.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/settings/components/GeminiAnalyticsSection.tsx):
     - 6 KPI cards (Today Requests, Month Requests, Total Tokens, Estimated Cost in USD & INR, Latency, Errors).
     - Per-feature and per-model consumption tables.
     - Daily usage trends table.
     - Paginated request telemetry logs with feature filtering.
  3. [`GeminiKeyModal.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/settings/components/GeminiKeyModal.tsx):
     - Password visibility toggle.
     - Pre-activation connection testing.
     - Security protocol notice.
  4. [`AppSettingsView.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/settings/components/AppSettingsView.tsx):
     - Section C sub-tabs: *Gemini Configuration*, *Usage & Cost Analytics*, *User Quotas & Limits*.

---

## 7. Verification & Test Results

### 7.1 Backend Unit Tests
- `tests/unit/app-settings/gemini-ai-management.test.ts`: **9/9 passed**
  - GET masked API key (never exposes secret)
  - RBAC protection (403 for members)
  - PATCH AES-256-GCM encryption & audit logging
  - Model validation (400 for invalid model)
  - Optimistic concurrency control (409 on version conflict)
  - Key rollback to previous working key
  - Supported model catalog and token pricing
  - Token consumption and cost summary calculation
  - Runtime cost calculation
- All Backend Unit Tests: **740/740 passed (76 test files)**

### 7.2 Admin Panel Verification
- TypeScript (`tsc --noEmit`): **0 errors**
- Next.js Production Build (`npm --prefix admin run build`): **11/11 static pages generated successfully**
- Admin Test Suite: **70/70 passed** (including `admin-gemini-ai.test.ts`)

### 7.3 Mobile Application Verification
- TypeScript (`tsc --noEmit`): **0 errors**
- Mobile Test Suite: **221/221 passed**
- Zero Gemini API key presence in mobile code or configuration bundles.

### 7.4 Live Neon PostgreSQL DEV Verification (`verify-gemini-live.ts`)
Executed against `ep-shy-art-b3sxwfkd-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb`:
1. Fetched live initial config from Neon DEV: **Verified**
2. Fetched 6 models & pricing from `gemini_pricing`: **Verified**
3. AES-256-GCM encryption/decryption round-trip: **Verified**
4. Key rotation with ciphertext storage check in DB: **Verified**
5. Optimistic concurrency conflict rejection (409): **Verified**
6. One-click rollback to previous key: **Verified**
7. Dynamic model resolution (`workout_generator` -> `gemini-2.5-pro`): **Verified**
8. Telemetry event recording into `gemini_usage_events`: **Verified**
9. Analytics aggregation queries (summary, breakdown, trends, logs): **Verified**
10. Test telemetry cleanup & clean configuration restoration: **Verified**

---

## 8. Summary of Completed Deliverables

| Deliverable | Status | Notes |
| :--- | :--- | :--- |
| **Secure Key Management** | **Completed** | AES-256-GCM encrypted in Neon DEV, masked in API/UI, rollback supported |
| **Dynamic Model Configuration** | **Completed** | Runtime resolution per feature without mobile update or redeployment |
| **Usage & Cost Tracking** | **Completed** | Token telemetry, duration, USD & INR conversion based on real rates |
| **Admin UI Enhancement** | **Completed** | Tabbed AI Management, Key Rotation Modal, Analytics KPI cards & Log table |
| **Zero Mobile Leaks** | **Verified** | Mobile proxies strictly through backend; no secrets exposed |
| **Live Neon DEV Verified** | **Verified** | Verified live database migrations and persistence on Neon DEV |

