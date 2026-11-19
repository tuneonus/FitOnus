# OnusFit — Python AI Backend Migration Readiness Assessment

**Date:** 2026-11-18 · **Type:** read-only assessment; no application code, schema, config or dependency was changed.
**Background (not overwritten):** [AI baseline](../../AI_ENGINEERING_BASELINE.md) · [AI roadmap](../../AI_ENGINEERING_ROADMAP.md) · [AI architecture proposal](../../AI_ARCHITECTURE_PROPOSAL.md) · [project structure](../architecture/PROJECT_STRUCTURE.md)

> **Status update (2026-11-19):** coach chat, coach insights, voice meal, speech transcription and meal photo analysis have since been migrated and made Python-only on branch `development` (no Node fallback, no flag); see `docs/ai/learning/02-python-only-ai-architecture.md`, `03-voice-meal-python-migration.md` and `04-python-speech-transcription.md` and `05-python-meal-photo-analysis.md` and `06-python-coach-insights.md`. No user-facing AI feature calls Gemini from Node any more. Sections below describe the state *before* that work and remain as the assessment of record. The Node `GeminiClient`, `GeminiExecutor` and `GeminiRuntimeService.executeWithTelemetry` they mention were removed in Phase 8 (2026-11-19); see `docs/architecture/PROJECT_STRUCTURE.md` §10 #15.

**How to read this document.** Statements tagged **[VERIFIED]** were checked against source in this session (file paths given). Statements tagged **[PROPOSED]** are design proposals: no such endpoint, field, table, flag or file exists. **[UNVERIFIED]** marks things I could not check (production configuration, live data, hosting capabilities, Python runtime behavior).

---

## 1. Executive summary

1. **Scope of what can move.** Node.js currently contains **five** Gemini-calling capabilities that serve end users (coach chat, coach insights, speech transcription, meal-photo analysis, voice-meal parsing) plus one admin-only direct SDK call (the "test connection" button). Memory and conversation history are *data features that feed prompts*; they do not call Gemini. `workout_generator` is **configured-only**: a flag, quota, rate limit and model column exist, but no code implements it.
2. **Recommended first migration: voice-meal parsing, transcript-text path only** (`POST /api/v1/nutrition/voice-meal/parse` when `transcript` is supplied and `audio` is not). It is stateless, needs no database reads, no memory, no multimodal payload, has a stable response contract, a small prompt, an existing seam (the `VoiceMealParser` port), and an unusually good evaluation story (Tamil/Tanglish quantities). Coach chat is the **last** thing to migrate, not the first.
3. **The mobile app and the public API do not change.** Node keeps authentication, authorization, the `AiUsageGate` (feature flag, burst limit, atomic daily quota, refund-if-undispatched), conversation/memory persistence, and the usage ledger. Python becomes an internal, authenticated inference service.
4. **Not ready to start implementing yet.** Blockers, all fixable in a few days of preparatory work:
   - **B1.** The four Gemini parsers (`parseGeminiOutput` / `parseInsightsOutput`) have **no unit tests**; tests mock the services above them. A Python port cannot be proven equivalent without characterization tests first (§13).
   - **B2.** The Python foundation has **never been executed**: `fastapi` and `pytest` are not installed in this environment (verified), there is no Dockerfile, no CI job, no lockfile.
   - **B3.** Four design decisions need your approval (§19), chiefly **who owns the Gemini API key** the admin console currently manages.
5. **Findings that affect the migration** (details in §3 and §15):
   - `POST /coach/transcribe` calls Gemini **without** `AiUsageGate` (no feature flag, daily quota or per-user burst limit; telemetry rows get a null user).
   - Coach insights consume a quota unit even when the model fails and deterministic fallback insights are returned.
   - Worst-case Node latency (primary timeout + fallback timeout ≈ 40 s) exceeds the mobile timeouts (25–30 s).
   - Cooldown, burst-limit and insights-cache state is per-process memory in Node.
6. **Keep the old Node implementation until proven.** Every stage keeps the Node Gemini path as the automatic fallback; retirement happens only after the criteria in §12.

---

## 2. Current verified architecture

```text
Mobile (Expo)  ──HTTPS──►  Node API  /api/v1/...                       [VERIFIED backend/src/container.ts:39]
                            auth → rate limiters → zod validation → controller → use case
                                          │
                       AiUsageGate.run(userId, action)                    shared/ai/ai-usage.ts,
                         1 per-user burst limiter (in-memory)             modules/app-settings/application/services/ai-usage-gate.ts
                         2 feature flag + atomic daily quota (Postgres)
                         3 AsyncLocalStorage context {userId, dispatched}
                                          │
                       Gemini*Service  (prompt + JSON parse)              modules/coach/infrastructure/*, modules/nutrition/infrastructure/*
                                          │
                       GeminiClient.generate()  (timeout, AbortSignal)    shared/ai/gemini-client.ts
                                          │  GeminiExecutor port
                       GeminiRuntimeService.executeWithTelemetry()        modules/app-settings/application/services/gemini-runtime-service.ts
                         decrypt key from DB · per-feature model · fallback model ·
                         ModelCooldownTracker · token/cost row → gemini_usage_events
                                          │
                                   Google Gemini API  (@google/genai)
```

- **[VERIFIED]** Only three places import `@google/genai`: `shared/ai/gemini-client.ts`, `app-settings/.../gemini-runtime-service.ts`, and `app-settings/.../use-cases/test-gemini-connection.ts` (admin "test key" button; it builds its own `GoogleGenAI` client).
- **[VERIFIED]** Production wiring happens only in `backend/src/container.ts`: `appSettings` (runtime + gate) → `geminiClient` → `nutrition` and `coach` modules.
- **[VERIFIED]** Public envelope: success `{ success: true, data, message }` (`shared/http/route.ts`); errors `{ success: false, error: { code, message, details? } }` (`middleware/error-handler.ts`); error `kind` maps to HTTP status in one place.
- **[VERIFIED]** The `docs/` symlink points to `Resources/docs/`; this file therefore lives at `Resources/docs/ai/`.
- **Changed since the original audit:** `GeminiClient` moved to `shared/ai/`; nutrition use cases now depend on `MealPhotoAnalyzer` / `VoiceMealParser` ports (`nutrition/application/ports.ts`). Those ports are the natural migration seams.

---

## 3. Existing AI feature inventory

Legend for status: **IMPLEMENTED** (code path calls Gemini) · **DATA-ONLY** (persists/serves data used by prompts, no inference) · **CONFIGURED-ONLY** (flag/quota exists, no behavior).

### 3.0 Summary

| # | Feature | Status | Calls Gemini | Gated by `AiUsageGate` | Migration complexity | Order |
|---|---|---|---|---|---|---|
| F1 | Voice meal (transcript text) | IMPLEMENTED | yes (text) | yes (`voice_meal`) | **Low** | **1** |
| F2 | Voice meal (audio) | IMPLEMENTED | yes (audio) | yes (`voice_meal`) | Medium | 2 |
| F3 | Speech transcription | IMPLEMENTED | yes (audio) | **no** | Medium (+ policy decision) | 2 |
| F4 | Meal photo analysis | IMPLEMENTED | yes (vision) | yes (`meal_photo`) | Medium–High (payload size) | 3 |
| F5 | Coach insights | IMPLEMENTED | yes (text) | yes (`coach_chat`, cache-miss only) | Medium | 4 |
| F6 | Coach chat | IMPLEMENTED | yes (text) | yes (`coach_chat`) | **High** | 5 |
| F7 | AI memory | DATA-ONLY | no | n/a | n/a (stays in Node) | — |
| F8 | Conversation history | DATA-ONLY | no | n/a | n/a (stays in Node) | — |
| F9 | Admin Gemini management / usage analytics | IMPLEMENTED (admin) | test-connection only | n/a (admin permission) | n/a (stays in Node) | — |
| F10 | Workout generator | **CONFIGURED-ONLY** | no | flag/quota only | not applicable | future, born in Python |

Paths below are relative to `backend/` and all **[VERIFIED]**. Use cases return through `AiUsageGate.run`; model names default from env `GEMINI_MODEL=gemini-3.5-flash-lite`, `GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite` (`src/config/env.ts:68-69`), but the **effective production models are set in the DB table `gemini_config` by the admin console and were not inspected** **[UNVERIFIED]**.

### F1 / F2 — Voice meal parsing

| Field | Value |
|---|---|
| Endpoint | `POST /api/v1/nutrition/voice-meal/parse` (`nutrition/interface/nutrition.routes.ts` ~l.333) |
| Controller | `nutrition.controller.ts` → `parseVoiceMeal` |
| Use case | `nutrition/application/use-cases/parse-voice-meal.ts` → `ParseVoiceMealUseCase` (validates, 15 MB audio cap, mime allow-list, then `aiUsageGate.run({action:'voice_meal'})`) |
| Gemini service | `nutrition/infrastructure/gemini-voice-meal-service.ts` → `GeminiVoiceMealService.parseVoiceMeal` (implements `VoiceMealParser`); text path → `GeminiClient.generateText(prompt, 20_000, 'voice_meal')`; audio path → `generateFromAudio(…, 25_000)` |
| Prompt | inline in `GeminiVoiceMealService.buildPrompt` (English/Tamil/Tanglish quantity lexicon, JSON schema example) |
| Model | `voice_meal` feature → `gemini_config.voice_meal_model` → default model → env fallback (`gemini-runtime-service.ts:resolveExecutionTarget`) |
| Request (zod) | `parseVoiceMealRequest` in `nutrition/interface/voice-meal.schemas.ts`: `transcript?` (≤2000), `audio?` (base64 string), `mimeType?`, `lang?` (≤50), `mealType?` (≤50); refine: transcript **or** audio required |
| Response (zod) | `voiceMealResponseSchema`: `transcript, detectedLanguage, items[DetectedFoodItem], confidence('high'\|'medium'\|'low'), totalKcal, totalProteinGrams, totalCarbsGrams, totalFatGrams, totalFiberGrams?, unclearReason?, parsedAt`; items per `detectedFoodItemSchema` (`meal-photo.schemas.ts`) |
| DB | none in the inference path |
| Auth | `access: { kind: 'authenticated' }`; no extra per-route limiter (global IP limiter + gate burst limiter apply) |
| Quota/usage | gate action `voice_meal`; telemetry via runtime service |
| Error handling | parse failure ⇒ **HTTP 200** with `items: []`, `confidence: 'low'`, `unclearReason: 'AI response was not formatted correctly…'` (indistinguishable from "no food"); provider errors → `AppError` (503/429); quota → 429 `AI_QUOTA_EXCEEDED`; flag off → 422 `FEATURE_DISABLED` |
| Tests | `tests/unit/nutrition/voice-meal.test.ts` (7 tests, **mocks the service**; the parser is not exercised), `tests/unit/ai/ai-use-case-gating.test.ts` |
| Mobile | `mobile/src/features/ai-coach/services/voice-meal-api.ts` (timeout 25 s), `features/nutrition/screens/VoiceMealEntryScreen.tsx` |
| Notes | The parser generates ids `voice-food-<Date.now()>-<idx>`, sets `brand: 'AI Voice Estimate'`, `isAiEstimated: true`, clamps/rounds numbers, and computes totals server-side. These details are part of the de-facto contract. |

### F3 — Speech transcription

| Field | Value |
|---|---|
| Endpoint | `POST /api/v1/coach/transcribe` (`coach.routes.ts` ~l.191) |
| Controller | `coach.controller.ts` → `transcribeAudio`: calls `deps.geminiClient.transcribeAudio(body.audio)` **directly** |
| Use case | none |
| Service | `GeminiClient.transcribeAudio` in `shared/ai/gemini-client.ts` (prompt inline; feature label `coach_chat`; 25 s) |
| Request/Response | `transcribeAudioSchema` `{ audio:{mimeType, base64} }` / `transcribeResponseSchema` `{ transcript, detectedLanguage }` (`coach.schemas.ts`) |
| Auth / limits | authenticated + `rateLimiters.aiCoach` route middleware (`container.ts:205`); **no `AiUsageGate`** ⇒ no feature flag, no daily quota, no per-user burst limit; telemetry row has `user_id = null` (no AI request context). **No size cap other than the global body limit**. |
| Error handling | parse failure returns the raw model text as `transcript`, `detectedLanguage:'en'` (HTTP 200) |
| Tests | none specific (`coach-http.test.ts` mocks the client) |
| Mobile | `features/ai-coach/services/speech-service.ts`, `store/coachStore.ts`, `voice-coach/screens/VoiceCoachScreen.tsx` |

### F4 — Meal photo analysis

| Field | Value |
|---|---|
| Endpoint | `POST /api/v1/nutrition/meal-photo/analyze` |
| Use case | `nutrition/application/use-cases/analyze-meal-photo.ts` → `AnalyzeMealPhotoUseCase` (10 MB base64 cap, mime allow-list, gate action `meal_photo`) |
| Service | `nutrition/infrastructure/gemini-meal-photo-service.ts` → `GeminiMealPhotoService.analyzePhoto` (implements `MealPhotoAnalyzer`); `GeminiClient.generateFromImage(…, 25_000)` |
| Prompt | inline in `buildPrompt` (USDA-based estimation, `isFood` branch) |
| Request | `analyzeMealPhotoRequest`: `image` (base64), `mimeType` enum default `image/jpeg`, `mealType?`, `notes?` (≤250) |
| Response | `mealPhotoResponseSchema`: `isFood, summary, items[], overallConfidence(0–1), totals…, unclearReason?, analyzedAt` |
| DB | none in inference path |
| Error handling | parse failure ⇒ 200 `isFood:false`, `summary:'Unable to parse food analysis'` (looks like "not food"); quota consumed |
| Tests | `tests/unit/nutrition/meal-photo.test.ts` (6, mocked service) |
| Mobile | `meal-photo-api.ts` (timeout 30 s), `MealAnalysisScreen.tsx` |
| Notes | Effective JSON body limit is `BODY_LIMIT` (code default 100 kB; **production value [UNVERIFIED]**, an ops doc lists `10mb`). |

### F5 — Coach insights

| Field | Value |
|---|---|
| Endpoint | `GET /api/v1/coach/insights?timezone&lang(en\|ta\|tanglish)&refresh` |
| Use case | `coach/application/use-cases/get-coach-insights.ts`: `assertEnabled('coach_chat')`, **in-process** 10-min cache + in-flight de-dupe keyed `userId:lang`, then `aiUsageGate.run({action:'coach_chat'})` → loads context (`PgUserContextRepository.getUserFitnessContext`) → service |
| Service | `coach/infrastructure/gemini-coach-insights-service.ts` → `GeminiCoachInsightsService.generateInsights`; `generateText(prompt, 20_000, 'coach_insights')`; **catches every error** and returns `buildDeterministicInsights` |
| Response | `coachInsightsResponseSchema`: `greeting, recommendation|null, insights[{id,title,description,category,priority,severity,action,question,evidence[],confidence,requiresDevice}], generatedAt, hasSufficientData` |
| DB | reads profile, today's meals/water, recent workouts, planned workout, goals, latest weight (`pg-user-context-repository.ts`) |
| Quota | shares `coach_chat` action; unit consumed even when the deterministic fallback is returned |
| Tests | `tests/unit/coach/coach-insights.test.ts` (6, mocked service) |
| Mobile | `insights-api.ts` (timeout 25 s), `use-coach-insights.ts` |

### F6 — Coach chat

| Field | Value |
|---|---|
| Endpoint | `POST /api/v1/coach/chat` (+ `rateLimiters.aiCoach`) |
| Use case | `coach/application/use-cases/chat-with-coach.ts` → `ChatWithCoachUseCase.execute` → gate `coach_chat` → `respond()`: load context → resolve/create conversation → **persist user message first** (idempotent on `clientMessageId`) → history (client `history` wins over server history) → active memories (`getActiveMemoriesForContext`, 15, recency) → `generateCoachResponse` → persist assistant message |
| Service | `coach/infrastructure/gemini-coach-chat-service.ts` → `GeminiCoachChatService` (system prompt concatenated with history/memories into one string; last 6 turns) |
| Request | `chatRequestSchema`: `message`(1–1000), `timezone?`, `history?`(≤10 `{role,text≤1000}`), `conversationId?`(uuid), `clientMessageId?`(≤100) |
| Response | `coachResponseSchema`: `text, blocks?, followUps?, sources?, toolCalls?, medicalNote?, memoryUsed?, conversationId?`. The backend populates only `text, followUps, sources, medicalNote, conversationId`; `blocks`/`toolCalls`/`memoryUsed` are accepted but never produced. |
| DB | context reads (above) + `coach_conversations`, `coach_messages`, `coach_memories` |
| Tests | `coach-use-case`, `coach-http`, `coach-history`, `coach-memory`, `coach-message-ownership` (all mock the Gemini service) |
| Mobile | `coach-api.ts` (timeout 30 s), `coachStore.ts`, `CoachConversationScreen.tsx` |

### F7 / F8 — Memory and conversations (data-only)

`/api/v1/coach/memory*` (8 routes), `/api/v1/coach/conversations*` (5), `/coach/messages/:id/feedback`. No Gemini calls. `coach_memories` has `status` (`active|pending_approval|dismissed|archived`), `sensitive`, `user_settings.ai_memory_enabled`. **Nothing writes `pending_approval` rows** (no extraction exists) and `sensitive` is not filtered when memories are read for the prompt. These stay in Node.

### F9 — Admin Gemini management

`/api/v1/admin/ai/*` (config, models, test-connection, rollback-key, usage summary/by-feature/by-model/trends) and `/admin/application-settings`. Key stored encrypted (AES-256-GCM, `AI_ENCRYPTION_KEY` or HMAC secret fallback). `test-connection` is the only non-gateway SDK call. Stays in Node.

### F10 — Workout generator

`GeminiFeature`, `AiUsageAction`, `gemini_config.workout_generator_model`, flag `workoutGenerator`, limit `workoutGeneratorDailyLimit`, burst limit 10/15 min exist. **No use case, route or prompt.** [VERIFIED by grep over `src/`.]

---

## 4. Actual request execution flows

### 4.1 Voice-meal text (representative simple flow) **[VERIFIED]**
```
POST /nutrition/voice-meal/parse {transcript, lang?, mealType?}
 → global IP limiter → authenticate → zod (transcript ≤2000)
 → ParseVoiceMealUseCase: has transcript, no audio
 → AiUsageGate.run(userId,'voice_meal')
      burst limiter → flag + atomic quota reserve → AsyncLocalStorage ctx(dispatched=false)
 → GeminiVoiceMealService.parseVoiceMeal → buildPrompt → GeminiClient.generateText(prompt,20s,'voice_meal')
 → GeminiClient.generate → GeminiRuntimeService.executeWithTelemetry
      resolve key/model → cooldown check → primary (markAiRequestDispatched; 20 s timeout)
      on retryable, non-project-wide failure → fallback model (new 20 s timeout)
      write gemini_usage_events (tokens, cost) fire-and-forget
 → parseGeminiOutput (strip fences, JSON.parse, coerce, recompute totals) or "not formatted" result
 → 200 {success:true, data:VoiceMealParseResult}
 failure before dispatch ⇒ quota refunded; after dispatch ⇒ unit consumed
```

### 4.2 Coach chat **[VERIFIED]**
`authenticate → zod → ChatWithCoachUseCase → gate.run('coach_chat') → getUserFitnessContext (6 SQL queries) → conversation get/create → persist user message → history → memories → GeminiCoachChatService (one concatenated prompt) → GeminiClient → runtime → parse → persist assistant message → 200`.

### 4.3 Insights **[VERIFIED]**
`assertEnabled → cache hit? return : in-flight? await : gate.run → context → service (model; any error ⇒ deterministic) → cache(10 min) → 200`.

### 4.4 Transcribe **[VERIFIED]**
`authenticate + aiCoach limiter → zod → controller → GeminiClient.transcribeAudio → generate → runtime (userId null)` — no gate.

---

## 5. Node.js vs Python responsibility matrix

Rule: **Node owns data, identity and money; Python owns inference.** Business rules live in exactly one place.

| Concern | Today | Target owner | Notes |
|---|---|---|---|
| Public REST API, envelope, status codes | Node | **Node** | unchanged for mobile |
| Authentication, authorization, ownership checks | Node | **Node** | Python trusts only a verified service token |
| Feature flags (`features.flags`), daily limits (`ai.limits`), burst limit, quota reserve/refund | Node (`AiUsageGate`) | **Node** | single quota system; Python never charges |
| User/profile/workout/nutrition CRUD, DB transactions | Node | **Node** | |
| **Context data retrieval** (SQL for profile, nutrition, workouts, goals) | Node | **Node** | DB stays Node-owned; Node sends a typed context payload |
| **Context processing for the prompt** (formatting, selection, truncation) | Node (inside prompt builder) | **Python** | |
| Prompt construction, versions, generation params | Node (inline) | **Python** | port verbatim first (§12), improve afterwards |
| Gemini SDK call, structured-output validation, response parsing/normalization | Node | **Python** | |
| Model fallback + bounded retry at the provider call | Node runtime | **Python** (per request) | Node still sends the *configured* primary/fallback names |
| Circuit breaker / cooldown | Node in-memory | **Python** for its calls; Node's remains for the Node path | state is split during migration |
| Conversation + message persistence, idempotency by `clientMessageId` | Node | **Node** | Python is stateless per request |
| **AI memory storage, consent, `ai_memory_enabled`, `sensitive`** | Node | **Node** | Node filters what Python may see |
| Memory *candidate extraction* (future) | none | **Python proposes, Node persists** as `pending_approval` | |
| Token/cost ledger (`gemini_usage_events`, `gemini_pricing`) | Node | **Node** (single ledger) | Python reports usage; Node writes and prices it |
| Admin API-key / model configuration and analytics | Node | **Node** | key delivery to Python: open decision O1 |
| Deterministic insight fallback | Node (in the Gemini service) | **Node (stays)** | it is the failure fallback; Python returns "model result or error", never a fabricated fallback |
| Safety rules (grounding, medical note, no invented wearables) | in prompts | **Python** (prompt) + **Node** (quota/kill switch) | red-flag pre-classifier, when built, lives in Python |
| Tracing/eval of model behavior | none | **Python** (Langfuse later) | correlation id comes from Node |
| RAG, embeddings, tools, LangGraph workflows | none | **Python** | only when a feature needs them (§17) |

### Shared concerns

| Concern | Authoritative owner / source of truth | Read/write | Node ↔ Python | Failure behavior | Migration compatibility |
|---|---|---|---|---|---|
| **AI memory** | Node, tables `coach_memories`, `user_settings` | Node R/W; Python **never** reads DB | Node sends `memories: string[]` already filtered (consent, `active`, not `sensitive` unless user opted in) | memory service down ⇒ chat without memory | memory format `[CATEGORY]: text` preserved for parity |
| **Model + key config** | Node DB (`gemini_config`) via admin console | Node R/W | **Model names:** Node sends `model.primary`/`model.fallback` per request **[PROPOSED]**. **Key:** unresolved (O1) | key missing ⇒ Python returns 503 ⇒ Node falls back to Node path | admin keeps working for Node path throughout |
| **Model fallback** | Python decides *at call time*; Node decides *which models* | — | as above | both fail ⇒ Python 503 `AI_UNAVAILABLE`-equivalent | same retryable/non-retryable classification must be ported (`ai-error-classifier.ts`) |
| **Token/cost telemetry** | Node `gemini_usage_events` | Node writes | Python returns `usage` block; Node maps it and writes (and prices via `gemini_pricing`) | Python crash after Gemini dispatch ⇒ no usage row (document as accepted loss; Python logs it) | row shape unchanged (`feature`, `model`, tokens, status) |
| **Retry behavior** | Today: none after dispatch except one fallback model | — | Node never retries a dispatched Python call; Python makes at most one primary + one fallback attempt | — | preserves the "no double billing" rule documented in `backend/docs/ai-reliability.md` |
| **Feature flags** | Node `app_settings` | Node R/W | Python unaware of flags; flag off ⇒ Node never calls Python | — | rollout flags are separate (§12) |
| **AI request logging** | Node HTTP log (pino) + Python structured log | each owns its own | shared `X-Request-Id`; **no prompt/response text in logs** | — | |
| **Consent / sensitive data** | Node | Node filters before sending | Python must treat all received text as sensitive: never log it | — | `sensitive` filtering must exist in Node *before* memories are sent (currently missing) |

---

## 6. Current Gemini dependency map **[VERIFIED]**

| Component | File | Depends on | Used by |
|---|---|---|---|
| `GeminiClient` (text/image/audio/transcribe; timeout; error mapping) | `shared/ai/gemini-client.ts` | `@google/genai`, `ai-timeout`, `ai-usage`, `ai-error-classifier`, `GeminiExecutor` | coach services, nutrition services, `coach.controller` (transcribe) |
| `GeminiRuntimeService` | `app-settings/application/services/gemini-runtime-service.ts` | `AppSettingsRepository` (key/model/pricing/usage), `decryptSecret`, `ModelCooldownTracker`, `@google/genai` | `GeminiClient` via `GeminiExecutor` |
| `TestGeminiConnectionUseCase` | `app-settings/application/use-cases/test-gemini-connection.ts` | `@google/genai` directly | admin route |
| `AiUsageGateService` + `CheckAndRecordAiQuotaUseCase` | `app-settings/application/...` | `AppSettingsRepository.reserveAiUsage/releaseAiUsage`, `AiRateLimiter` | all four use cases |
| `ModelCooldownTracker`, `ai-error-classifier`, `ai-timeout`, `ai-rate-limit` | `shared/ai/` | none external | runtime, client, gate |
| Prompt + parser pairs | five `gemini-*-service.ts` + `GeminiClient.transcribeAudio` | `GeminiClient` | use cases |
| Env/config | `config/env.ts` (`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `AI_ENCRYPTION_KEY` read in `container.ts`) | — | container |
| DB tables | `gemini_config`, `gemini_pricing`, `gemini_usage_events` (0015, 0020), ai quota tables, `app_settings` | — | runtime, admin |

**Migration surface = the five prompt+parser pairs and the provider call path.** Everything above them (use cases, gate, controllers, schemas) stays.

---

## 7. Existing public API contract inventory

All are under `/api/v1`. Envelope and codes are the shared ones in §2. **Mobile must see identical shapes**; the zod `response.schema` parses handler output, so undeclared fields cannot leak.

| Route | Request | Success | AI-specific errors |
|---|---|---|---|
| `POST /coach/chat` | §3 F6 | 200 `coachResponseSchema` | 429 `AI_QUOTA_EXCEEDED`, 429 `RATE_LIMITED` (`details.retryAfterSeconds`), 422 `FEATURE_DISABLED`, 503 `SERVICE_UNAVAILABLE`/`AI_UNAVAILABLE` |
| `GET /coach/insights` | query `timezone, lang, refresh` | 200 `coachInsightsResponseSchema` | same; provider failure ⇒ 200 with deterministic content |
| `POST /coach/transcribe` | `audio{mimeType,base64}` | 200 `{transcript,detectedLanguage}` | 503; 429 only from route limiter |
| `POST /nutrition/meal-photo/analyze` | §3 F4 | 200 `mealPhotoResponseSchema` | 400 unsupported mime, 413 `PAYLOAD_TOO_LARGE`, plus AI codes |
| `POST /nutrition/voice-meal/parse` | §3 F1 | 200 `voiceMealResponseSchema` | 400/422 validation, 413, plus AI codes |
| `/coach/memory*`, `/coach/conversations*`, `/coach/messages/:id/feedback` | zod in `coach.schemas.ts` | various | n/a (Node-only) |
| `/admin/ai/*`, `/admin/application-settings` | `app-settings.schemas.ts` | various | n/a (Node-only) |

Timeouts the mobile client enforces **[VERIFIED]**: voice meal 25 s, meal photo 30 s, insights 25 s, chat 30 s, global axios default 60 s (`mobile/src/services/api-client.ts:26`). I verified the API clients and timeouts, **not** field-by-field mobile consumption of every response property; do that before changing any response (this plan changes none).

**Contract rule for the migration:** Node's public zod schemas are the contract. The Python adapter must return data that Node maps into the existing `VoiceMealParseResult` etc. Node continues to validate with its existing output schema.

---

## 8. Proposed internal Python API contracts **[PROPOSED]**

None of these endpoints or field names exist. Conventions for every internal endpoint:

- Path prefix `/internal/v1/ai/…`; JSON; UTF-8; camelCase field names to match the existing TypeScript/zod style, mapped to snake_case Python attributes via Pydantic aliases (`alias_generator=to_camel`, `populate_by_name=True`).
- Required headers: `Authorization: Bearer <service JWT>` (§9), `X-Request-Id` (Node's request id), `Content-Type: application/json`.
- Pydantic v2 models in `ai-backend/src/onusfit_ai/contracts/` with `extra='forbid'` on requests (unknown fields are a bug), `extra='ignore'` never on requests.
- Response always contains `usage` and `outcome` (below) so Node can write the ledger and detect silent-failure modes that the current public API hides.
- Errors use one shape: `{ "error": { "code": "...", "message": "...", "retryAfterSeconds": 12?, "dispatched": true|false } }`. `dispatched` tells Node whether Gemini may have been called, which drives **quota refund vs consume** (the existing `markAiRequestDispatched` rule).

### 8.1 Endpoint list (proposed, in migration order)

| # | Endpoint | Replaces | Request payload | Timeout budget* |
|---|---|---|---|---|
| 1 | `POST /internal/v1/ai/meals/parse-text` | `GeminiVoiceMealService.parseVoiceMeal` (text) | transcript text | 22 s |
| 2 | `POST /internal/v1/ai/meals/parse-audio` | voice meal (audio) | audio bytes (multipart) | 28 s |
| 3 | `POST /internal/v1/ai/speech/transcribe` | `GeminiClient.transcribeAudio` | audio bytes (multipart) | 28 s |
| 4 | `POST /internal/v1/ai/meals/analyze-photo` | `GeminiMealPhotoService.analyzePhoto` | image bytes (multipart) | 28 s |
| 5 | `POST /internal/v1/ai/coach/insights` | `GeminiCoachInsightsService.generateInsights` | context + lang | 22 s |
| 6 | `POST /internal/v1/ai/coach/chat` | `GeminiCoachChatService.generateCoachResponse` | message + context + history + memories | 22 s |

\*Node→Python deadline. Python's own Gemini timeout is shorter (20 s text / 25 s media, parity with today). **Budget rule:** mobile timeout > Node→Python deadline > Python Gemini attempt(s). Today's worst case (20 s primary + 20 s fallback ≈ 40 s) already exceeds mobile's 25 s; Python must enforce a **total** deadline (`deadlineMs`) across primary + fallback. Because multipart avoids ~33% base64 inflation, Node decodes the mobile's base64 once and forwards raw bytes.

### 8.2 Detailed contract — #1 `POST /internal/v1/ai/meals/parse-text`

**Request body** (`ParseMealTextRequest`)

| Field | Type | Req | Validation | Note |
|---|---|---|---|---|
| `transcript` | string | yes | trimmed, 1–2000 chars | same bound as public API |
| `lang` | string | no | ≤50 | hint only |
| `mealType` | string | no | ≤50 | hint only |
| `model.primary` | string | yes | 1–64 chars, `^[A-Za-z0-9._-]+$` | resolved by Node from admin config |
| `model.fallback` | string \| null | no | same | null = no fallback |
| `deadlineMs` | int | yes | 1000–30000 | total budget incl. fallback |
| `promptVersion` | string | no | | pin during canary; default = Python's current |

Headers add: `Idempotency-Key: <Node request id>` (Python de-duplicates *in-flight* duplicates; a non-mutating call, so safe).
User identity is **only** the JWT `sub`; there is no `userId` in the body.

**Response 200** (`ParseMealTextResponse`)

| Field | Type | Note |
|---|---|---|
| `outcome` | `"ok"` \| `"no_food"` \| `"parse_failed"` | **new**: distinguishes the "not formatted" failure that today looks like "no food" |
| `result.transcript` | string | |
| `result.detectedLanguage` | string | default `"en"` (parity) |
| `result.items[]` | `{id, name, brand, serving, servingWeightG, servingUnit, servingSize, kcal, protein, carbs, fat, fiber, confidence, isAiEstimated}` | same fields/rounding as `detectedFoodItemSchema` |
| `result.confidence` | `"high"\|"medium"\|"low"` | |
| `result.totalKcal/ProteinGrams/CarbsGrams/FatGrams/FiberGrams` | number | computed server-side exactly like today |
| `result.unclearReason` | string \| null | |
| `result.parsedAt` | ISO-8601 string | |
| `usage.model` | string | model actually used |
| `usage.isFallback` | bool | |
| `usage.inputTokens/outputTokens/cachedTokens/thinkingTokens/totalTokens` | int | thinking tokens are not captured today |
| `usage.durationMs` | int | |
| `usage.providerRequestId` | string \| null | today always null |
| `usage.promptVersion` | string | |
| `traceId` | string | echo for correlation |

`outcome:"parse_failed"` ⇒ Node returns today's public "not formatted" result (parity) **and** logs/counts it.

**Error mapping**

| Python status / `error.code` | Meaning | Node action |
|---|---|---|
| 401/403 `AUTH` | bad service token | log critical; use Node fallback path; do **not** charge twice |
| 422 `INVALID_REQUEST` | contract bug | log; Node fallback |
| 429 `PROVIDER_RATE_LIMITED` (+`retryAfterSeconds`) | Gemini 429 | map to public 429 `RATE_LIMITED` (existing mapping) |
| 503 `PROVIDER_UNAVAILABLE` / `PROVIDER_TIMEOUT` | Gemini overloaded/timeout, `dispatched:true` | public 503 `SERVICE_UNAVAILABLE` with the existing timeout message; unit consumed (existing rule) |
| 503 `AI_UNAVAILABLE` | both models cooling/failed | public 503 `AI_UNAVAILABLE` + `retryAfterSeconds` |
| 502/connection refused/timeout **before send** | Python down, `dispatched:false` | **refund + fall back to Node Gemini path** (which will mark dispatched itself) |
| any 5xx with `dispatched:true` | ambiguous | consume unit; surface 503; no automatic Node retry (avoids double billing) |

### 8.3 Contracts #5/#6 sketch (later phases)

- **Insights** request: `{ context: UserFitnessContext, lang, model, deadlineMs }`; response `{ outcome: "ok", result: CoachInsightsResponse-like, usage, traceId }`. On any model failure Python returns an **error**, not fabricated content; Node's deterministic fallback keeps working (single owner).
- **Chat** request: `{ message, context: UserFitnessContext, history: [{role,text}], memories: string[], lang?, model, deadlineMs }` where **`history` and `memories` are loaded and filtered by Node** (server-authoritative; the current "client history wins" behavior must be fixed in Node first or knowingly preserved). Response `{ outcome, result: {text, followUps, sources, medicalNote, blocks?}, usage, traceId }`. Persistence stays in Node.
- Types `UserFitnessContext`, `CoachResponse`, `Block` are in `modules/coach/domain/coach.types.ts` and become Pydantic models; field names are copied, not invented.

---

## 9. Authentication and security design **[PROPOSED]**

**Trust model.** Mobile → Node (public, user auth). Node → Python (internal, service auth). Python → Gemini (provider key). Python is never reachable from mobile.

| Topic | Design |
|---|---|
| Service token | Node signs a JWT per call, `exp` ≤ 60 s (30 s preferred), `iat`, `jti`. Claims: `iss="onusfit-node-api"`, `aud="onusfit-ai-backend"`, `sub=<userId UUID>` (identity for logging/quotas/tracing only), `scope="ai:meals:parse"` (one scope per endpoint), `rid=<request id>`. |
| Algorithm / keys | Preferred **asymmetric (ES256 or EdDSA)**: Node holds the private key, Python only the public key, so a compromised Python process cannot mint tokens. **Acceptable for the first stages:** HS256 with a ≥32-byte secret. Node already uses `jose` (`backend/package.json`); Python verifies with a maintained JWT library (decision O3). Keys carry a `kid`; Python accepts two `kid`s during rotation. |
| Verification in Python | Verify signature, `iss`, `aud`, `exp`, `iat` (≤ 5 s skew), scope == endpoint. Reject otherwise with 401, no detail. |
| Replay protection | In-memory `jti` cache for the token lifetime (single instance). Calls are non-mutating and quota is charged by Node, so replay risk is cost only; with ≥2 Python instances move the cache to Redis or accept the bounded risk. |
| User identity | Python uses `sub` for correlation and optional per-user concurrency caps. It **never** accepts a user id from a body/query. Authorization decisions remain in Node. |
| Data access by AI tools (future) | Python calls **Node internal endpoints** (`/internal/tools/*`) with a token whose `sub` is the user; Node enforces ownership. No direct DB access from Python (DB role with schema `ai` only, later). |
| Network | Python listens only on an internal interface/private service; no public route. If the host cannot provide private networking **[UNVERIFIED]**, rely on JWT + TLS and do not expose docs/OpenAPI publicly (`docs_url=None` in production). |
| Transport | TLS between services if traffic leaves the host; otherwise private network. |
| Secret rotation | Gemini key and service signing key stored as environment secrets (never in the repo); rotate with overlap (`kid`); document the runbook before Python-primary. |
| Request limits | Python enforces a max body size per endpoint (text 64 kB; media 16 MB) before parsing, and a global concurrency semaphore for provider calls (protects against thundering herds even if Node misbehaves). |
| Rate limiting | Authoritative limits stay in Node. Python adds only defense-in-depth: per-`sub` concurrency cap and a global QPS ceiling. |
| Audit logging | Python logs one structured line per call: `rid, sub-hash, endpoint, model, outcome, tokens, durationMs, status`. **No transcript, memory, image or prompt text.** |
| PII minimization | Node sends only fields the feature needs: for meal parsing just the transcript + hints; for coach, omit `displayName` and exact identifiers unless a prompt requires them (Phase 0/6 of the roadmap). Never send `sensitive` memories unless the user opted in. |
| Gemini key exposure | Never sent to mobile; never in request bodies between services. |
| Failure of auth | Fail closed: no token/invalid token ⇒ 401; Node treats it as "Python unavailable" and uses the legacy path. |

---

## 10. Python foundation readiness (`ai-backend/`)

| Item | Status **[VERIFIED 2026-11-18]** |
|---|---|
| Layout | Valid `src/` layout: `pyproject.toml`, `README.md`, `src/onusfit_ai/{__init__,main}.py`, `api/health.py`, `contracts/health.py`, `core/config.py`, `tests/test_health.py`. No empty future directories. |
| Package build config | hatchling wheel target `src/onusfit_ai`; pytest `pythonpath=["src"]`. Not built. |
| FastAPI app | `create_app()` factory + `app = create_app()`; one router. Appropriate for now. |
| Health | `GET /health/live` only (process up; checks nothing). **No readiness** endpoint; correct for now (no dependencies), required before deployment. |
| Dependencies declared | `fastapi>=0.115`, `uvicorn[standard]>=0.30`; dev: `pytest`, `httpx`, `ruff`, `mypy`. **Lower bounds only; no lockfile.** Gemini SDK, JWT library, `pydantic-settings` not declared (not needed yet). |
| Tests executable? | **Not verified.** `python3 -c "import fastapi"` → `ModuleNotFoundError`; `python3 -m pytest` → `No module named pytest`. Only `py_compile` was run earlier. |
| Docker | none (`ai-backend/Dockerfile` absent). Docker daemon is also unavailable in this environment. |
| CI | `.github/workflows/ci.yml` has no Python job. |
| Config / secrets | One env var (`ONUSFIT_AI_ENV`); no secrets; no `.env.example`; `.gitignore` excludes `.env*`. Adequate for the stage. |
| Missing before first migration | (a) install + run tests once locally (`uv`, Python 3.12 are present) and commit a lockfile; (b) request-id middleware + structured JSON logging; (c) service-JWT verification dependency; (d) settings for Gemini key/timeouts; (e) a Dockerfile; (f) a CI job (ruff, mypy, pytest). |
| Missing before production | readiness endpoint, graceful shutdown/timeouts config, body-size limits, concurrency limiter, deployment target and secrets, observability export. |

---

## 11. First migration feature recommendation

### 11.1 Scoring (1 = easiest/safest, 5 = hardest/riskiest)

| Criterion | F1 voice text | F2 voice audio | F3 transcribe | F4 meal photo | F5 insights | F6 chat |
|---|---|---|---|---|---|---|
| Complexity | **1** | 2 | 2 | 3 | 3 | 5 |
| Business criticality | 2 | 2 | 2 | 2 | 3 | **5** |
| Database coupling (in inference path) | **0** | 0 | 0 | 0 | 4 | 5 |
| Prompt complexity | 3 | 3 | 1 | 3 | 4 | 5 |
| Memory dependency | **0** | 0 | 0 | 0 | 0 | 5 |
| Multimodal | **none** | audio | audio | image | none | none |
| Contract stability (public schema) | **high** | high | high | high | high | medium (blocks/toolCalls undefined) |
| Existing test coverage of the *service* | low | low | none | low | low | low |
| Failure risk to users | **low** (user can retype) | low | low | low | low (fallback exists) | **high** |
| Payload transfer cost | **tiny** | 15 MB cap | large | 10 MB cap | small | small |
| Learning value | high | high | medium | high | medium | very high |

### 11.2 Decision

**Migrate F1 first: voice-meal, transcript-text path.**

Why it beats the alternatives:
- vs **Coach chat (F6):** chat has persistence, idempotency, memory, history, six SQL reads, the highest traffic and the largest blast radius. Its value is high, but it is the wrong *first* step, because a bug there is user-visible in the flagship feature.
- vs **Insights (F5):** needs the full `UserFitnessContext` payload, owns a cache/de-dupe layer in Node and a deterministic fallback; more coupling and a trickier "who falls back" story.
- vs **Meal photo (F4) / audio (F2, F3):** multi-megabyte payloads add transport, size-limit and multipart concerns that should be solved *after* the core pattern (auth, contract, shadow, canary, usage ledger) is proven on a tiny text request.
- vs **Transcribe (F3):** simplest prompt, but today it is **ungated**; moving it would either preserve a quota bypass or force a behavior change that needs your approval (O6).
- F1 has: no DB, no memory, a **ready-made seam** (`VoiceMealParser` in `nutrition/application/ports.ts` ⇒ a `PythonVoiceMealParser` adapter replaces `GeminiVoiceMealService` without touching the use case or gate), a stable response contract already guarded by zod, and an excellent offline evaluation (Tanglish quantity lexicon is explicit in the prompt).
- The Node use case already splits the text path from the audio path, so text can move while audio stays in Node.

**Prerequisite that F1 shares with every feature:** characterization tests for the existing parser (B1).

---

## 12. Incremental migration phases

Stage letters match your required stages. Every stage has an explicit gate; failing a gate means stay or roll back, never push forward.

### Phase M0 — Preparation (Node + Python foundation; no behavior change)
**Tasks:** (1) Node characterization tests for `GeminiVoiceMealService.parseGeminiOutput` using a recorded-raw-text fixture set (fenced JSON, bad JSON, no-food, missing numbers, negative numbers, wrong enum). (2) Install and run the Python foundation tests; commit lockfile. (3) Decide O1–O4 (§19). (4) Add request-id + JSON-logging middleware to `ai-backend`. (5) Freeze the voice-meal prompt text as the Python v1 baseline.
**Gate:** Node tests green; `pytest` green locally; decisions recorded.

### Stage A — Python implementation (no traffic)
**Tasks:** Pydantic request/response models; `llm/` Gemini wrapper (one place calling the SDK, timeout + total deadline, single primary+fallback attempt, error classification ported from `ai-error-classifier.ts`); `prompts/meal_text_v1` = verbatim port; parser/normalizer reproducing today's coercion, rounding, ids, totals; endpoint `POST /internal/v1/ai/meals/parse-text`; service-JWT dependency. Unit tests with a **fake LLM** (no network).
**Gate:** Python output equals Node output on the characterization fixtures (same raw model text → same normalized result, modulo ids/timestamps).

### Stage B — Contract verification
**Tasks:** commit the generated OpenAPI of `ai-backend`; add Node `PythonVoiceMealParser` adapter (implements `VoiceMealParser`; behind a config switch, default off); Node-side contract tests with recorded Python responses; reverse test: Python validates sample requests Node produces. Verify error mapping (§8.2) with a fake Python server in Node tests, including **refund-on-not-dispatched** and **fallback-to-Node-when-Python-down**.
**Gate:** contract tests pass in CI both sides; no public API diff (existing HTTP tests unchanged and green).

### Stage C — Shadow mode
Node still returns the Node/Gemini result. After responding, Node asynchronously sends the **same request** to Python with header `X-Shadow: true`, for a **sampled** fraction.
- **No double charge:** the adapter in shadow mode runs *outside* `AiUsageGate`'s quota path and never calls `markAiRequestDispatched`; no quota unit is reserved for shadow calls.
- **No duplicate persistence:** voice-meal parse persists nothing (verified: the use case returns the result only; logging a meal is a separate mobile call), so shadow cannot create duplicate business records.
- **Cost control:** sampling rate (start 10%), daily shadow-call cap, auto-disable when the cap or a spend threshold is reached; skip shadow when the primary already failed.
- **Comparison (structured logs, no DB change initially):** schema validity, `outcome`, item-count agreement, normalized-name overlap, kcal difference, latency, tokens, estimated cost, safety flags. Log hashed transcript id, not text.
- Usage rows for shadow calls must not pollute user-facing analytics (O10: use a separate log/store first).
**Gate (proposed thresholds, tune with data):** ≥200 shadow samples; Python schema-valid ≥ Node's; `parse_failed` rate ≤ Node's; p95 latency ≤ Node's + 300 ms; item-set agreement ≥ 0.9 on the labeled set; cost within ±15%; zero unexplained 5xx.

### Stage D — Canary
Stable per-user bucketing (`hash(userId) % 100 < percent`) so a user always sees one implementation. Ramp 1% → 5% → 25% → 50% only after each step holds for ≥24 h and ≥N requests. Flag: env/config for the first iteration, admin `app_settings` flag later (O4). Python result is the user-visible one; on any Python error Node transparently falls back to the Node Gemini path (refund rules per §8.2).
**Automatic rollback triggers (proposed):** Python error rate > 2% over 100 requests; `parse_failed` rate > Node baseline + 2 pts; p95 > 1.5× baseline; any auth/contract error; cost per request > 1.3× baseline. Rollback = set percent to 0 (no deploy).

### Stage E — Python primary
100% of **text** voice-meal traffic via Python; Node Gemini path remains as automatic fallback for ≥2 weeks. **Required before this stage:** key-delivery decision implemented (O1), production deployment, secrets rotation runbook, alerts, readiness endpoint, dashboards.

### Stage F — Legacy retirement (per feature)
Remove `GeminiVoiceMealService`'s text path (and its prompt) from Node only when: contract tests green; AI evals pass; ≥2 weeks stable at 100%; error/latency within thresholds; cost understood; rollback rehearsed; you approve. Keep the `VoiceMealParser` port and a **disabled-by-default** Node adapter for one more release if rollback value is high.

### Subsequent features (same A–F loop)
F2 voice audio and F3 transcribe → F4 meal photo → F5 insights → F6 chat. For each, write characterization tests *first*. Before F3 moves, decide whether to put it behind the gate (O6, a separate Node change, since it alters behavior).

---

## 13. Testing and evaluation strategy

| Layer | Node | Python |
|---|---|---|
| Characterization (parser equivalence) | **New** tests with recorded raw outputs per feature (B1) | same fixtures (shared JSON files, copied into `ai-backend/tests/fixtures/` or a single shared location, O12) |
| Unit | existing gate/timeout/fallback tests stay | fake LLM; normalizer; error classifier; JWT verification |
| Contract | zod/response mapping vs recorded Python responses; error-mapping table | OpenAPI snapshot; request/response model tests (`extra='forbid'`) |
| Integration | adapter + fake Python server (refund/fallback paths); existing Testcontainers tests unchanged | `TestClient` end-to-end with fake LLM |
| Live smoke | `scripts/verify-*` style, manual | one opt-in test hitting Gemini with a tiny prompt, excluded from CI |
| AI evaluation | n/a | `ai-backend/evals/`: 30–60 labeled transcripts (English, Tamil, Tanglish, no-food, chatter, ambiguous quantities); metrics: schema validity, item precision/recall, kcal MAPE vs hand labels, language detection accuracy |
| CI | existing jobs | new job: `ruff`, `mypy`, `pytest`, OpenAPI drift check; **offline evals on recorded outputs in PR CI**, live evals nightly with a spend cap |

---

## 14. Observability and cost strategy

- **Correlation:** Node `x-request-id` → `X-Request-Id` header → Python logs, `traceId` in responses; `gemini_usage_events.request_id` is currently `req-<ts>-<rand>` and **not** the HTTP id (verified) — use the HTTP id for Python-served calls. Distributed tracing (OpenTelemetry) is optional later; Langfuse for LLM traces/evals when you reach roadmap Phase 1 (self-host to keep health data in your control).
- **Cost ledger:** single ledger in Node. Python returns `usage` including thinking tokens; Node prices with `gemini_pricing`. Before trusting it, fix the possible double-counting of cached tokens noted in the baseline (verify against current Gemini usage-metadata docs).
- **Metrics to emit/track (per feature):** request count, outcome distribution (`ok/no_food/parse_failed`), error rate by code, p50/p95/p99 latency (Node→Python and Python→Gemini), tokens in/out/thinking, cost/request, fallback-model rate, shadow agreement, rollback-trigger counters.
- **Logging:** structured JSON, hashed user and transcript identifiers, never raw text; sampling for debug captures with scrubber (roadmap Phase 1).
- **Alerts (minimum before primary):** Python down/readiness failing, error rate, p95 latency, parse-failed rate, daily cost.

---

## 15. Risks and mitigations

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | Python port subtly changes output (rounding, ids, defaults) | High / medium | Characterization tests first; verbatim prompt; shadow comparison; contract tests |
| R2 | Double billing or lost quota refund across the hop | Medium / high | `dispatched` flag in error contract; adapter calls `markAiRequestDispatched` exactly when the request is sent; no automatic retry after dispatch; test both paths |
| R3 | Latency regression (extra hop, free-tier cold start) | Medium / medium | Measure in shadow; total-deadline budgets; keep warm or choose a host without cold starts **[UNVERIFIED hosting]** |
| R4 | Key ownership split-brain (admin rotates key; Python still uses old env key) | Medium / high | Decision O1 before Python-primary; document and alert on `AUTH_ERROR` |
| R5 | Python outage breaks AI features | Medium / medium | Node fallback path retained until Stage F; circuit breaker in the Node adapter |
| R6 | Shadow traffic cost surprise | Medium / low | Sampling, daily cap, auto-disable |
| R7 | Health-data privacy (logs, traces, provider) | Medium / high | No text logging; data minimisation; `sensitive` filter in Node before sending; self-hosted trace store |
| R8 | Prompt injection via memories/history | Medium / medium | Fix client-forged history and `sensitive` filtering in Node (Phase 0 of roadmap); instruction/data separation in Python prompts **after** parity |
| R9 | State split: cooldown/burst/insights cache are per-process | Medium / low | Document; Python keeps its own breaker; revisit with Redis only when ≥2 instances |
| R10 | Two languages, one developer | High / medium | Migrate one feature at a time; keep Python shallow; shared fixtures; CI for both |
| R11 | Ungated `/coach/transcribe` becomes an abuse/cost path | Medium / medium | Separate Node fix needing approval (O6); until then it is only limited by `aiCoach` limiter + global limiter |
| R12 | Timeout budgets inconsistent (40 s worst case vs 25–30 s mobile) | Medium / low | Python total deadline < Node deadline < mobile timeout |
| R13 | Docs/stale design (OpenAI/pgvector in numbered docs) misleads | Low / low | Treat code as truth; this document supersedes for AI migration |

---

## 16. Rollback plan

1. **Instant (no deploy):** set the rollout percent/mode to `off`. Node's existing Gemini implementation serves all traffic (it stays deployed and tested until Stage F).
2. **Automatic:** adapter-level circuit breaker opens on repeated Python failures ⇒ Node path; refunds applied when `dispatched:false`.
3. **Config rollback:** previous Python image tag redeployable; service-key rotation reversible via two-`kid` overlap.
4. **Data:** none to roll back for F1 (stateless). For later features that persist, persistence stays in Node, so rollback never touches Python-owned data (there is none).
5. **Legacy code retention:** the Node implementation and tests stay in the repo through Stage E; Stage F removal is a separate, reviewable change revertible with git.
6. **Rehearsal:** perform one rollback drill in canary before going Primary.

---

## 17. AI Engineering learning roadmap (Concept → Node code → Python design → Tasks → Testing → Production → Interview)

Only technologies with a concrete requirement here are used.

| Phase | Concept | Existing Node code | Python design | Implementation tasks | Testing | Production considerations | Interview explanation |
|---|---|---|---|---|---|---|---|
| **M0** | Characterization testing; contract-first design | `gemini-voice-meal-service.ts` parser, zod schemas | Pydantic models drafted from zod | write fixtures; run Python tests; decisions | recorded-output fixtures | none | "Before porting untested code I pinned its behavior with recorded outputs." |
| **A** | **FastAPI** app factory, dependency injection, async I/O; **Pydantic v2** validation; **Gemini SDK** structured generation; prompt versioning | `GeminiClient.generate`, `buildPrompt`, `parseGeminiOutput` | `api/`, `contracts/`, `llm/`, `prompts/` (create each with its first real file) | port prompt; use schema-constrained output **only after parity is proven** (parity first) | fake LLM unit tests; error-classifier table tests | blocking calls in the event loop; timeouts with total deadline | "Why Pydantic + constrained decoding beats parse-and-pray; how I proved parity." |
| **B** | **Contract testing**, service-to-service auth | public zod envelope, `AppError` mapping | OpenAPI snapshot, JWT dependency | Node adapter implementing `VoiceMealParser`; error mapping | fake Python server tests; refund/fallback paths | key rotation, clock skew | "How two services evolve safely: versioned internal contract + drift check." |
| **C** | **LLMOps shadow evaluation**, cost control | `recordGeminiUsage`, usage analytics | structured comparison logs | sampling, caps, comparator | comparator unit tests; labeled-set eval | privacy, spend caps | "Shadow mode compares models/prompts on real traffic without user impact." |
| **D/E** | Canary releases, SLOs, rollback triggers | feature flags in `app_settings`, ai-reliability doc | metrics endpoint/logs | percent bucketing; alerts | failure injection (Python down) | dashboards, runbook | "Measurable rollback criteria, not gut feel." |
| **F2/F3/F4** | **Multimodal AI** (audio, image) | `generateFromAudio/Image` | multipart endpoints, size limits | port prompts; media validation | fixture media files | payload size, memory use | "Handling binary payloads across a service boundary." |
| **F5** | Context assembly, graceful degradation | `PgUserContextRepository`, deterministic fallback | context Pydantic model | port insight prompt | context fixtures | fallback ownership | "Where retrieval ends and prompt-facing processing begins." |
| **F6** | Conversation memory, history handling, prompt-injection defense | `chat-with-coach.ts`, memory repo | stateless chat endpoint | server-authoritative history; delimit untrusted input | red-team cases | memory consent, PII | "Stateless inference service, stateful product service." |
| **After parity** | **Evaluation / LLMOps** (Langfuse, golden sets) | no evals exist | `evals/` | datasets, judge, CI gate | n/a | cost of live evals | "How I know a prompt change is better." |
| **When a feature needs it** | **RAG + pgvector** — only for cited knowledge answers or grounding meal nutrients in a food table | none | `retrieval/` | per roadmap Phase 3 | recall@k | licensing | tied to a product requirement |
| **When a feature needs it** | **Tool calling → LangGraph** — only for the weekly workout-plan flow (`workout_generator` is configured-only) | `toolCalls` field exists unused | `tools/`, `workflows/` | per roadmap Phases 4–5 | validator + budget tests | human approval gate | tied to a product requirement |
| **Not now** | MCP, Redis | in-memory limiter/cooldown noted | — | — | — | only at ≥2 instances / demo need | do not add for appearance |

---

## 18. Prioritized implementation checklist

**Required before first migration (M0)**
- [ ] Node characterization tests for `GeminiVoiceMealService.parseGeminiOutput` (and later the other parsers)
- [ ] Install Python deps locally; run `pytest`, `ruff`, `mypy`; commit lockfile
- [ ] Decide O1–O4 and record in the decision log
- [ ] Request-id + structured logging + body-size limit in `ai-backend`
- [ ] Freeze v1 prompt text for parity

**Required before production rollout (Stages D–E)**
- [ ] Service JWT verification (Python) and signing (Node), `kid` rotation
- [ ] Dockerfile + CI job for `ai-backend`; deployment target with private networking decision
- [ ] Readiness endpoint; graceful shutdown; concurrency limiter
- [ ] Node adapter with circuit breaker, refund/fallback behavior tested
- [ ] Shadow comparator + sampling/cap
- [ ] Rollout flag + rollback triggers + alerts + dashboard
- [ ] Key delivery implemented (O1) and rotation runbook
- [ ] Usage ledger mapping (incl. thinking tokens, HTTP request id)
- [ ] `sensitive`-memory filtering and server-authoritative history in Node (before memory/history cross the boundary — chat phase)

**Optional / later**
- [ ] Langfuse tracing and eval datasets/CI gate
- [ ] Gate `/coach/transcribe` with `AiUsageGate` (behavior change; separate approval)
- [ ] Redis, MCP (only when justified)
- [ ] Split `app-settings` AI parts into an `ai-management` module

---

## 19. Open decisions requiring developer approval

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **O1** | **Who holds the Gemini API key used by Python?** | (a) Python env var, separate key; (b) Node internal endpoint delivering the admin-managed key (short-lived in-memory cache); (c) Python reads encrypted DB value (rejected: breaks "Python has no DB") | Stages A–D: **(a)** (separate key also gives separate quota/cost attribution and a clean rollback). Before **Python-primary**, implement **(b)** so the admin console rotation applies to both. |
| **O2** | Hosting and networking for `ai-backend` (private service vs public URL, cold starts) | Render private service / same host / other | Verify capabilities **[UNVERIFIED]**; require JWT regardless; avoid cold-start tiers for the primary path. |
| **O3** | Service-token algorithm and library | HS256 shared secret vs ES256/EdDSA | ES256/EdDSA target; HS256 acceptable for M0–D. |
| **O4** | Rollout flag mechanism | env/config vs `app_settings` admin flag | env/config first (no schema/UI change); admin flag later. |
| **O5** | Owner of deterministic insight fallback | Node vs Python | **Node** (single owner; Python returns result or error). |
| **O6** | Gate `/coach/transcribe` with quota/flag? | leave as is / gate | Gate it (separate Node change) before or during F3; changes behavior, needs approval. |
| **O7** | Prompt policy during migration | verbatim first vs improve while porting | **Verbatim first**; improvements after parity with evals. |
| **O8** | Shadow storage | structured logs vs new DB table vs Langfuse | logs first (no schema change). |
| **O9** | Shadow sampling rate and daily budget | e.g. 10% / fixed cap | start 10%, cap by call count; adjust with cost data. |
| **O10** | Telemetry for Python-served calls | reuse `feature` values vs add provenance column | add a nullable column (new migration) when implementing; no schema change now. |
| **O11** | Python tooling | `uv` + `ruff` + `mypy` + `pytest` (already assumed in pyproject) | confirm. |
| **O12** | Where shared JSON fixtures live | duplicate per repo area vs shared top-level folder | one shared fixtures folder referenced by both test suites. |

---

## Appendix A — What I did and did not verify in this assessment

**Executed (read-only):** `git status/log`, `grep`/file reads across `backend/src`, `backend/tests`, `backend/migrations`, `mobile/src/features/ai-coach/services`, `ai-backend/`; `python3 -c "import fastapi"` (fails: not installed); `python3 -m pytest --version` (fails: not installed). **Not executed:** any test suite, lint, build, server, database query, Gemini call, Docker, `uv`/`pip` installation.

**Could not verify:** production `BODY_LIMIT`, production `gemini_config` models/key source, hosting/private-networking features, mobile field-by-field consumption of responses, live behavior of any Python code.

**Stated "does not exist" claims** (no tests for the four parsers, no `workout_generator` implementation, transcribe not gated) are based on source search at the time of this assessment; re-check if the repository changes.
