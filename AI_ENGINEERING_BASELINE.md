# OnusFit — AI Engineering Baseline Audit

**Date:** 2026-11-18 · **Type:** Read-only static audit · **Scope:** `backend/`, `mobile/`, `admin/`, `docs/`, `.github/`
**Method:** Source files were read directly. Nothing was run, installed, migrated or deployed, and no application code was changed.

> **Update 2026-11-19 (Phase 8):** every AI feature now runs in the Python AI backend, and the Node `GeminiClient`, `GeminiExecutor`, `GeminiRuntimeService.executeWithTelemetry` and `ai-error-classifier.ts` described below were removed. This audit stays as the record of the state at audit time; see `docs/architecture/PROJECT_STRUCTURE.md` §10 #15.
>
> **Update 2026-11-19 (Phase 9):** two gaps in §3.13/§3.15 were closed **in logs only**: one user request can now be joined to its AI call (`correlationId`, sent to Python as `X-Correlation-Id`) and coach insights served from the deterministic fallback, from the cache, or from a fresh model answer are distinguishable (`ai.cache`, `ai.deterministic_fallback`). Still open: metrics, alerts, tracing, evals and a database column for failures. See `docs/ai/learning/07-ai-observability.md`.
>
> **Update 2026-11-18:** after this audit, `GeminiClient` moved from `backend/src/modules/coach/infrastructure/gemini-client.ts` to `backend/src/shared/ai/gemini-client.ts` (structure standardization; no behavior change). File paths below that mention the old location are as audited. See `docs/architecture/PROJECT_STRUCTURE.md`.

> **Honesty notes**
> - Status labels describe what the *code* does today, not what the design docs say. Several docs (`docs/09`, `docs/21`, `docs/22`, `docs/27`) describe an OpenAI / GPT-4o / pgvector architecture that **does not exist in the code**. The code uses Gemini only. Treat those docs as stale intent.
> - I read the whole Gemini path (client, runtime service, 4 AI services, quota gate, rate limiter, timeout, memory and conversation repositories, migrations 0013/0015/0019/0020, CI, Dockerfile, compose). I did **not** read every mobile or admin file, and I did not read `docs/09-ai-coach.txt` line by line. Claims about mobile or admin are limited to what I grep-verified.
> - Test counts and line counts come from `wc -l`. I did not execute the test suite, so "tests pass" is not asserted.

---

## 1. Executive summary

OnusFit already has **production-grade AI *plumbing*** that most portfolio projects lack: a single provider chokepoint, atomic per-user daily quotas with refund semantics, per-user burst limiting, hard timeouts with `AbortSignal` cancellation, model fallback with a circuit-breaker cooldown, an error classifier, token and cost telemetry in PostgreSQL, an admin console for key, model and pricing management, and encrypted key storage (AES-256-GCM).

It is weak, or missing, on the **AI-engineering core** that interviewers probe: structured outputs, tool calling, retrieval, agents, evaluation, tracing and prompt-injection defense.

| Strength (keep and showcase) | Gap (build next) |
|---|---|
| Reliability and cost control around one LLM provider | Single-shot prompting, no tools, no retrieval, no agent loop |
| Multimodal (image and audio) features in production | Prompt-and-pray JSON; no schema-constrained output |
| User-controlled memory UX (consent, edit, delete) | Memory is a recency list, not retrieval; nothing writes suggestions |
| Clean-architecture ports (`CoachChatService`, `AiUsageGate`) that make swapping implementations easy | No evals, no tracing, no prompt versioning |

**Status tally (16 areas):** IMPLEMENTED 3 · PARTIAL 8 · MISSING 5

| # | Area | Status |
|---|---|---|
| 1 | LLM integrations and models | **IMPLEMENTED** |
| 2 | Prompt engineering | **PARTIAL** |
| 3 | Structured output handling | **PARTIAL** |
| 4 | Function / tool calling | **MISSING** |
| 5 | Conversation memory architecture | **PARTIAL** |
| 6 | AI personalization | **PARTIAL** |
| 7 | Multimodal AI | **IMPLEMENTED** |
| 8 | Streaming and async processing | **PARTIAL** (async patterns yes; streaming and queues no) |
| 9 | RAG / retrieval | **MISSING** |
| 10 | Vector database | **MISSING** |
| 11 | AI agent workflows | **MISSING** |
| 12 | AI security and safety | **PARTIAL** |
| 13 | Token usage and cost tracking | **IMPLEMENTED** (with accuracy caveats) |
| 14 | AI evaluation and testing | **PARTIAL** (engineering tests yes; model-quality evals none) |
| 15 | Logging, tracing, observability | **PARTIAL** |
| 16 | AI deployment architecture | **PARTIAL** |

---

## 2. Current architecture (as built)

```
 Mobile (Expo/RN)                         Admin (Next.js)
   coach / meal photo / voice               Gemini key, models,
   memory UI                                pricing, usage analytics
        │  HTTPS (REST, request/response)         │
        ▼                                          ▼
 ┌──────────────────────── Node.js + Express 5 (modular monolith) ───────────────────────┐
 │ auth → zod validation → controller → use case                                          │
 │                                                                                        │
 │   AiUsageGate.run()          shared/ai/ai-usage.ts                                     │
 │     1 per-user burst limit   shared/ai/ai-rate-limit.ts      (IN-MEMORY, per process)  │
 │     2 feature flag + atomic daily quota (PostgreSQL)  check-and-record-ai-quota.ts     │
 │     3 AsyncLocalStorage request context (userId, dispatched flag → refund vs consume)  │
 │                                                                                        │
 │   Use cases: ChatWithCoach · GetCoachInsights · AnalyzeMealPhoto · ParseVoiceMeal      │
 │        │                                                                               │
 │        ▼  (ports)                                                                      │
 │   Gemini*Service  ── builds ONE big prompt string (profile + today + memories +        │
 │        │               last 6 turns + user msg), asks for "JSON only"                  │
 │        ▼                                                                               │
 │   GeminiClient.generate()    coach/infrastructure/gemini-client.ts                     │
 │        │   runWithAiTimeout (AbortSignal, 20–25 s, no retry)                           │
 │        ▼                                                                               │
 │   GeminiRuntimeService.executeWithTelemetry()                                          │
 │        key/model from DB (decrypt) · per-feature model · fallback model ·              │
 │        ModelCooldownTracker (IN-MEMORY circuit breaker) · token+cost → gemini_usage_events │
 └───────────────┬────────────────────────────────────────────────────────┬───────────────┘
                 ▼                                                        ▼
        Google Gemini API                                   PostgreSQL (Neon)
        (@google/genai)                                     coach_conversations/messages/memories
                                                            gemini_config/pricing/usage_events
                                                            app_settings (flags, limits)
```

**One-line characterisation:** *a well-guarded, single-call, context-stuffing LLM gateway.* Every AI feature is one prompt in, one JSON string out, one parse.

---

## 3. Component-by-component audit

Format per component: **Status → Evidence → Current architecture → Limitations → Improvements → Concepts to learn → Interview demo.**

### 3.1 LLM integrations and models — IMPLEMENTED

**Evidence**
- `backend/package.json`: sole AI dependency is `@google/genai ^3.0.0`.
- `backend/src/modules/coach/infrastructure/gemini-client.ts`: `GeminiClient` wraps `client.models.generateContent` for text, image, audio and transcription.
- `backend/src/modules/app-settings/application/services/gemini-runtime-service.ts`: per-feature model resolution (`coach_chat`/`coach_insights`, `meal_photo`, `voice_meal`, `workout_generator`), primary → fallback, cooldown.
- `backend/migrations/0015_create_gemini_management.sql`, `0020_add_gemini_fallback_model.sql`: `gemini_config`, `gemini_pricing`, `gemini_usage_events`.
- `backend/src/config/env.ts:67-69`: `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.5-flash-lite`), `GEMINI_FALLBACK_MODEL` (default `gemini-3.1-flash-lite`).
- `backend/src/shared/security/encryption.ts`: AES-256-GCM for the stored key.

**Architecture.** Key and models live in the DB (admin-editable, cached 20 s). A model that fails with a retryable, non-project-wide error goes into cooldown and one fallback request is attempted. Project-wide quota exhaustion and auth errors are *not* retried on the fallback.

**Limitations**
- Gemini only. There is no provider abstraction beneath `GeminiClient` (the domain ports are provider-neutral, but the client and runtime service are not).
- `generateContent` is called with **no `temperature`, `maxOutputTokens`, `topP` or thinking budget**. Only `abortSignal` is set. Extraction tasks run at the default temperature, and nothing caps output cost.
- `executeWithTelemetry` creates a new `GoogleGenAI` client on every call.
- `workout_generator` has a feature flag, quota, rate limit and model column but **no implementation anywhere in `src/`** (grep: only app-settings and shared/ai reference it). It is a reserved slot.
- Dead path: `GeminiClient.modelName` / direct-key mode duplicates the runtime-service path.

**Improvements.** Add a `LlmProvider` port (`generate`, `generateStructured`, `embed`, `stream`) and make Gemini one adapter. Set per-feature generation config (temperature ≈ 0–0.3 for extraction, `maxOutputTokens` ceilings). Reuse the SDK client per key version.

**Learn.** Provider abstraction, model routing/cascading, generation parameters, context windows, circuit breakers.

**Interview demo.** "Show me how you'd survive a provider outage": trip the cooldown with a failing key in dev, show the fallback model answering, then show the `gemini_usage_events` row with `FALLBACK_SUCCESS`.

---

### 3.2 Prompt engineering — PARTIAL

**Evidence**
- `coach/infrastructure/gemini-coach-chat-service.ts:16-64` (`buildSystemPrompt`)
- `coach/infrastructure/gemini-coach-insights-service.ts:61-132`
- `nutrition/infrastructure/gemini-meal-photo-service.ts:20-73`
- `nutrition/infrastructure/gemini-voice-meal-service.ts:39-98`
- `coach/infrastructure/gemini-client.ts:93-102` (transcription prompt)

**Architecture.** Five hand-written template-literal prompts. Good practices already present: role framing, explicit grounding rule ("NEVER invent … state that no wearable is connected"), multilingual rules (English / Tamil / Tanglish), a worked JSON example, an explicit "not food" branch, a medical-advice branch (`medicalNote`), and a Tamil/Tanglish quantity lexicon in the voice prompt.

**Limitations**
- The "system prompt" is concatenated into the **user `contents` string** (`gemini-coach-chat-service.ts:74-92`). The SDK's `systemInstruction` is never used, so there is no instruction/data separation.
- User text, memory text and transcripts are interpolated raw (see §3.12).
- No prompt versioning, no registry, no A/B capability, and prompts are not recorded with the usage event, so a regression cannot be traced to a prompt change.
- No few-shot examples beyond one schema example; language handling is a prose rule rather than tested behaviour.
- Prompts are untested for behaviour. Unit tests assert plumbing, not output quality.
- Prompt text, JSON schema and parser are three separate things that must be kept in sync by hand.

**Improvements.** Move to `systemInstruction`; extract prompts to versioned template files (`prompts/coach_chat/v3.md`) with a `prompt_version` column on `gemini_usage_events`; derive the output schema from one source (Zod → JSON Schema) so the prompt, the API schema and the validator cannot drift.

**Learn.** System vs user roles, instruction hierarchy, few-shot/in-context learning, prompt versioning, prompt regression testing, delimiting untrusted input.

**Interview demo.** Open two prompt versions side-by-side, run both over the same 30-case golden set, and show the score diff (needs §3.14 work first).

---

### 3.3 Structured output handling — PARTIAL

**Evidence**
- Fence stripping + `JSON.parse` + manual coercion is **copy-pasted four times**: `gemini-coach-chat-service.ts:104-132`, `gemini-coach-insights-service.ts:134-179`, `gemini-meal-photo-service.ts:75-164`, `gemini-voice-meal-service.ts:100-191`, plus `gemini-client.ts:113-131`.
- `coach/interface/coach.schemas.ts` has Zod schemas (`coachResponseSchema`, `coachInsightsResponseSchema`), but they validate the **HTTP response shape**, not the raw model output.
- No `responseMimeType` / `responseSchema` / `responseJsonSchema` anywhere in `src/` (grep: zero hits).

**Architecture.** Ask for JSON in prose → strip markdown fences → `JSON.parse` → `String()/Number()/includes()` coercion with defaults → on failure, fall back.

**Limitations**
- Model output is not schema-constrained, so malformed JSON is possible and is handled by silent degradation.
- Failures are **silent and indistinguishable from success**: the meal photo service returns `isFood: false, "Unable to parse food analysis"` on a parse error, so a model formatting failure shows to the user as "that's not food", and the quota unit is still consumed. Coach chat returns the raw JSON string as `text`. Nothing logs or counts parse failures, so the parse-failure rate is unknown.
- Coercion hides semantic errors (an item with `calories: "abc"` becomes `0`).
- No plausibility bounds (for example kcal per gram, macro-to-kcal consistency).

**Improvements.** Use Gemini constrained decoding (`responseMimeType: 'application/json'` + `responseJsonSchema`) *and* validate with Zod/Pydantic (defence in depth); one shared `parseModelJson<T>(schema)`; on validation failure, one bounded repair retry with the validation error fed back; emit a metric/log event for every parse failure and repair; add domain plausibility checks (Atwater: `4P + 4C + 9F ≈ kcal` within tolerance).

**Learn.** Constrained decoding vs prompt-only JSON, JSON Schema, Pydantic/Zod validation, repair loops, "parse, don't validate".

**Interview demo.** Replay 200 recorded raw outputs through old parser vs new schema-validated pipeline; show parse-failure rate dropping and a dashboard of repair events.

---

### 3.4 Function / tool calling — MISSING

**Evidence**
- `coach/interface/coach.schemas.ts` defines an optional `toolCalls: string[]` and `blocks` on the response, and the mobile app has block renderers (`mobile/src/features/ai-coach/components/blocks/*`: Chart, Workout, Nutrition, Comparison, Action, Link, Metrics). **No backend code ever populates `toolCalls`, and no prompt instructs the model to emit `blocks`.**
- No `tools` / `functionDeclarations` / function-calling config anywhere in `backend/src`.
- The data the coach sees is **pre-fetched, fixed context**: `pg-user-context-repository.ts` runs a fixed set of queries (profile, today's nutrition and water, recent workouts, planned workout, goals, latest weight) for every message regardless of the question.

**Architecture.** "Context stuffing": every turn pays tokens for all context, and the model cannot ask for more (for example "my last 8 weeks of bench press").

**Limitations.** No ability to query history beyond the snapshot, no actions (log water, schedule workout), tokens wasted on irrelevant context, and the coach is not "grounded" by verifiable evidence (`sources` is a string list the model writes itself, not provenance from tools).

**Improvements.** Define read-only tools first (`get_recent_workouts(days)`, `get_nutrition_summary(range)`, `get_weight_trend(days)`, `get_exercise_history(name)`), execute server-side with the authenticated `userId` injected by the server (never by the model), cap tool rounds, and populate `sources`/`toolCalls` from real executions. Then write-intent tools that return a *proposal* the user confirms in the UI (never auto-execute).

**Learn.** Function-calling loop, tool schema design, parallel tool calls, authorization of tool arguments (confused-deputy risk), idempotency, tool-result truncation.

**Interview demo.** Ask "Am I eating enough protein on leg days?" and show a trace with 2 tool calls and the answer citing their results, then show that changing the `userId` in the model's tool args is ignored.

---

### 3.5 Conversation memory architecture — PARTIAL

**Evidence**
- Short-term: `coach_conversations`/`coach_messages` (`migrations/0013`), `pg-conversation-repository.ts`, `chat-with-coach.ts:79-101` (loads last 8 stored messages when the client sent no history).
- Long-term: `coach_memories` (8 categories, `status` in `active|pending_approval|dismissed|archived`, `sensitive` flag), `pg-memory-repository.ts`, `manage-memories.ts`, 8 `/coach/memory*` routes, `user_settings.ai_memory_enabled`.
- Retrieval into prompt: `getActiveMemoriesForContext` → `ORDER BY updated_at DESC LIMIT 15` (`pg-memory-repository.ts`).

**Architecture.** Short-term = sliding window (prompt keeps the last 6 turns). Long-term = **user-curated fact list injected by recency**, with a strong consent UX (opt-out switch, approve/dismiss, edit, delete, clear all).

**Limitations**
- **Nothing creates memories automatically.** The `pending_approval` workflow exists end-to-end (routes, approve/dismiss, UI), but no code extracts candidate facts from conversations. grep finds `pending_approval` only in schema, types and repository code.
- Retrieval is recency, not relevance. The 16th memory is invisible forever; an injury note from last year is dropped for 15 trivial newer ones.
- The `sensitive` flag is stored and the mobile store has a `useSensitive` toggle, but `getActiveMemoriesForContext` has **no `sensitive` filter**, so the flag does not affect what reaches Gemini (verify on the mobile side whether the toggle is enforced elsewhere).
- No conversation summarisation; once past 6–8 turns, earlier context is lost.
- Client-supplied `history` takes precedence over the server's stored history (`chat-with-coach.ts:92`, `:109`), so a modified client can inject fabricated "assistant" turns.
- `docs/21-ai-memory.txt` describes a pgvector/OpenAI design that was never built.

**Improvements.** (a) Memory extraction job producing `pending_approval` rows; (b) embeddings + pgvector top-k retrieval with recency/importance re-ranking; (c) rolling conversation summary; (d) honour `sensitive`; (e) ignore client `history` (server is source of truth); (f) memory dedup/contradiction handling.

**Learn.** Working vs episodic vs semantic memory, summarisation buffers, MemGPT-style paging, embedding retrieval, memory poisoning, consent-based memory design.

**Interview demo.** Say "I have a bad left knee" in conversation A; start conversation B a week later and ask for a leg workout. Show the extracted suggestion being approved, the retrieval trace selecting it from 200 memories, and the plan avoiding lunges.

---

### 3.6 AI personalization — PARTIAL

**Evidence.** `pg-user-context-repository.ts` + `coach.types.ts` (`UserFitnessContext`), prompt builders in §3.2, `lang` parameter on insights (`en|ta|tanglish`), `diet_type`, goals, targets, memories.

**Architecture.** Static profile and "today" snapshot injected into the prompt; language mirroring; deterministic fallback insights built from the same context.

**Limitations.** No longitudinal features (trends, adherence, progressive-overload history, weekly patterns), no learned user preferences, no feedback loop. `coach_messages.feedback` (like/dislike, migration 0019) is collected but **never read by any AI code**. Wearable data is explicitly absent (the prompt tells the model to say so).

**Improvements.** Add derived features computed deterministically (7/28-day adherence, protein-per-kg trend, volume trend per muscle group), expose them as tools; use thumbs-down messages as an eval/fine-tune-free improvement signal; per-user "style" memory (tone, brevity).

**Learn.** Feature engineering for LLM context, user modelling, feedback loops, cold-start handling.

**Interview demo.** Two synthetic users (beginner vegetarian vs advanced lifter) get demonstrably different plans from the same question; show the context diff.

---

### 3.7 Multimodal AI — IMPLEMENTED

**Evidence.** `GeminiClient.generateFromImage` / `generateFromAudio` / `transcribeAudio`; `gemini-meal-photo-service.ts`; `gemini-voice-meal-service.ts`; use cases `analyze-meal-photo.ts` (10 MB cap, mime allow-list) and `parse-voice-meal.ts`; mobile `MealAnalysisScreen.tsx`, `VoiceMealEntryScreen.tsx`, `meal-photo-api.ts`, `voice-meal-api.ts`; tests `tests/unit/nutrition/meal-photo.test.ts`, `voice-meal.test.ts`.

**Architecture.** Base64 inline data (`inlineData`) → Gemini → JSON → per-item confidence and `isAiEstimated: true`. Voice supports raw audio or a client transcript. Code-switching (Tamil / Tanglish) is a real, differentiated feature.

**Limitations**
- Nutrition values are the **model's own estimate** ("based on standard USDA values" in the prompt). They are not grounded against the app's `foods` table (`migrations/0008`, seeded from `scripts/seed-foods.ts`), so there is no lookup and no reconciliation.
- Base64 JSON bodies inflate payloads ~33%; the 10 MB check is on the base64 *string length*. No Files API, no client-side downscale verification.
- No accuracy measurement: nobody knows the kcal error against labelled meals.
- The audio path asks for the transcript and the parse in one prompt, which conflates ASR errors and nutrition-parsing errors.
- Parse-failure → "not food" misreport (see §3.3).

**Improvements.** Two-stage pipeline: vision/ASR → *item names + portions* only → deterministic nutrient lookup from `foods` / an Indian food composition table via retrieval (§3.9), with the model's estimate as fallback and flagged; build a labelled meal set (even 50 photos) and report MAPE on kcal.

**Learn.** Multimodal prompting, ASR for code-switched language, grounding model estimates with reference data, measuring calibration of confidence labels.

**Interview demo.** Live: photo of dosa and sambar → items → nutrients grounded to DB rows with source tags; then show the offline MAPE table (model-only vs grounded).

---

### 3.8 Streaming and async processing — PARTIAL

**Evidence.**
- Async patterns present: `AsyncLocalStorage` request context (`shared/ai/ai-usage.ts`); fire-and-forget telemetry (`gemini-runtime-service.ts:317-333`, `.catch(() => {})`); in-flight request de-duplication for insights (`get-coach-insights.ts`, `inFlightRequests` map); timeouts via `AbortController` (`ai-timeout.ts`).
- Streaming: **none**. No `generateContentStream`, no SSE or WebSocket (grep: zero hits). Mobile has a `ThinkingIndicator` and a 30 s axios timeout (`coach-api.ts`).
- Background jobs / queues: none (no BullMQ, no worker, no cron). `docs/21` described a background extraction worker that does not exist.

**Limitations.** A coach reply is not visible until the whole response is generated (up to the 20 s timeout). Long work (weekly plan generation, memory extraction) has no place to run. Telemetry writes are swallowed on error, so lost usage rows are invisible. Insights cache and in-flight map are per-process.

**Improvements.** Token streaming over SSE for chat (with the JSON envelope redesigned: stream prose, deliver structured `followUps`/`sources` in a final event); a job table in Postgres (`SELECT … FOR UPDATE SKIP LOCKED`) for memory extraction and plan generation before reaching for Redis; client-disconnect → abort the upstream request.

**Learn.** SSE vs WebSocket, backpressure, cancellation propagation, outbox/job-queue patterns, idempotency keys for long jobs.

**Interview demo.** Side-by-side: time-to-first-token 12 s → <1 s on a slow-network throttle; kill the client mid-stream and show the upstream call abort and the quota behave as documented.

---

### 3.9 RAG / retrieval — MISSING

**Evidence.** No embedding calls, no `knowledge_base` table, no retrieval code. `docs/22-rag-system.txt` specifies a GPT-4o + `text-embedding-3-small` + pgvector design (stale: wrong provider, unbuilt). Nothing in `backend/migrations/` creates a vector column or extension.

**Architecture.** None. The only "knowledge" is the model's parametric memory, constrained by a prompt line saying not to invent data.

**Limitations.** Domain claims about training, nutrition and recovery are un-cited and unverifiable. `sources` in coach output is model-authored text ("Profile", "Today's Nutrition"), not provenance.

**Improvements.** Curated, licensed knowledge base (see Proposal §6) → chunk → embed → hybrid retrieval (vector + Postgres full-text) → cite chunk IDs → "I don't know" when the top score is below threshold. Also reuse retrieval to ground meal parsing against food-composition tables.

**Learn.** Chunking strategies, embeddings, hybrid search, re-ranking, citation/attribution, retrieval metrics (recall@k, MRR, nDCG), faithfulness and answer-relevance evaluation.

**Interview demo.** Ask a contested question ("is creatine safe for teens?"); show retrieved chunks, the cited answer, and the eval table of recall@5 and faithfulness before and after hybrid search.

---

### 3.10 Vector database usage — MISSING

**Evidence.** `grep -ri "pgvector|vector(|embedding"` over `backend/src`, `backend/migrations`, `package.json`: zero code hits. Neon (the dev/prod Postgres per repo reports) supports `pgvector`, but the extension is not enabled by any migration.

**Improvements.** `CREATE EXTENSION vector;` in a numbered migration; two tables (`knowledge_chunks`, `memory_embeddings`) with HNSW indexes and a per-user filter for memory.

**Learn.** Embedding dimensionality, cosine vs inner product, HNSW vs IVFFlat trade-offs, filtered vector search, multi-tenant isolation (always `WHERE user_id = $1` before similarity), re-embedding on model change.

**Interview demo.** `EXPLAIN ANALYZE` of a filtered ANN query; explain why per-user memory is a pre-filter problem.

---

### 3.11 AI agent workflows — MISSING

**Evidence.** No loop, planner, state machine or multi-step orchestration exists. The closest items are (a) the primary → fallback model sequence in `gemini-runtime-service.ts` (infra resilience, not agency) and (b) deterministic fallback insights (`buildDeterministicInsights`), a sensible degrade-gracefully pattern. The `workout_generator` flag (see §3.1) is the obvious home for a first real agent, but nothing is built.

**Limitations / opportunity.** Weekly workout planning is naturally multi-step: read history → pick split → select exercises from the `exercises` table → check volume and recovery → draft → user approves → persist.

**Improvements.** One bounded, human-in-the-loop workflow (Proposal §5): plan generation as an explicit state graph with validation nodes, checkpointing and a hard step budget. Do *not* make chat itself an open-ended agent.

**Learn.** ReAct vs plan-and-execute, state graphs, checkpoints, human-in-the-loop interrupts, termination guarantees, tool authorization, cost ceilings per run.

**Interview demo.** Show the graph diagram, a trace of a run that hits a validation failure and self-corrects, and a run paused for user approval then resumed.

---

### 3.12 AI security and safety — PARTIAL

**Already strong**
| Control | Evidence |
|---|---|
| AuthN on all AI routes | `coach.routes.ts` (`access: { kind: 'authenticated' }`) |
| Per-user burst limit (not IP, not token) | `shared/ai/ai-rate-limit.ts` |
| Atomic daily quota + admin kill switches, fail-closed | `check-and-record-ai-quota.ts`, `ai-usage-gate.ts` |
| Quota refunded only if the provider was never called | `ai-usage-gate.ts:34-48` |
| Hard timeout with abort; no retry/double billing | `ai-timeout.ts` |
| Provider errors sanitised to the client | `gemini-client.ts:183-222` |
| API key encrypted at rest (AES-256-GCM), masked in API, rollback supported | `shared/security/encryption.ts`, `rollback-gemini-key.ts` |
| Input caps (message ≤1000 chars, history ≤10 turns, image ≤10 MB, mime allow-list) | `coach.schemas.ts`, `analyze-meal-photo.ts` |
| User-controlled memory (opt-out, edit, delete, approval of suggestions) | `/coach/memory*` |
| Log redaction of tokens/passwords | `shared/logging/logger.ts` |
| Medical-escalation instruction (`medicalNote`) and "no invented wearable data" rule | `gemini-coach-chat-service.ts:53-63` |
| Secret scanning in CI | `.github/workflows/ci.yml` (gitleaks) |

**Gaps**
1. **Prompt injection.** `message`, memory text, transcripts and `notes` are string-interpolated into the same text channel as instructions, with no delimiting or role separation. Memory text is user-authored and **persisted**, so a stored injection re-fires on every future chat. (Impact is currently bounded because the model has no tools; once tools exist this becomes critical.)
2. **Forgeable history.** Client `history` with `role: 'assistant'` is trusted ahead of server-stored history (`chat-with-coach.ts:92,109`).
3. **`sensitive` memories not filtered** from the provider payload (see §3.5).
4. **No Gemini `safetySettings`**, no output moderation pass, and the medical escape hatch depends on the model self-reporting `medicalNote`. No deterministic red-flag classifier (chest pain, eating-disorder language, self-harm, pregnancy, under-18 dietary restriction).
5. **No health-data policy for the provider.** Name, weight, injuries and medical memories are sent to a third-party API. There is no data-minimisation pass (for example, omit `displayName`), no documented retention setting, and no user-facing disclosure that I could verify in the code.
6. **No output validation of advice** (extreme calorie targets, contraindicated exercise suggestions).
7. Image and audio uploads have no content moderation, and `transcribe` returns raw model transcript text to the client.
8. Quota is a request count, not a token or dollar budget, so one huge-context request costs the same unit as a tiny one. The code comments already note it is not a substitute for a provider-side spending cap.

**Improvements.** Delimit untrusted content (XML-style tags + `systemInstruction`), strip or neutralise instruction-like memory text on write, server-authoritative history, sensitive filtering, red-flag pre-classifier with canned safe responses, a red-team test suite run in CI, token-budget quotas, a data-minimisation function, and set a hard spend cap in Google Cloud.

**Learn.** OWASP LLM Top 10 (LLM01 prompt injection, LLM02 insecure output handling, LLM06 sensitive information disclosure, LLM08 excessive agency), indirect injection, guardrail layering, health-data privacy (DPDP Act 2023 in India; GDPR if EU users), model-armor/moderation APIs.

**Interview demo.** Run an automated red-team suite (50 injection and jailbreak prompts) against v1 and v2, showing attack-success-rate falling, plus the memory-poisoning test.

---

### 3.13 Token usage and cost tracking — IMPLEMENTED (with caveats)

**Evidence.** `gemini_usage_events` (`migrations/0015`): request_id, user, feature, model, status, input/output/cached/total tokens, `estimated_cost_usd`, duration, error_category. Written by `gemini-runtime-service.ts:attemptExecution` for both success and failure. `gemini_pricing` table (editable). Admin analytics: `get-gemini-usage.ts`, `admin/src/features/settings/components/GeminiAnalyticsSection.tsx`. Quota gate per user/feature/day.

**Architecture.** Per-call telemetry row + admin dashboard + daily request-count quotas + model price table.

**Limitations (verify these against the current Gemini usage-metadata docs)**
- **Possible double-counting:** `calculateCostUsd` adds `inputTokens * inputRate` *and* `cachedTokens * cachedRate`. In Gemini's usage metadata, `promptTokenCount` is understood to *include* cached tokens, in which case cached tokens are billed twice in the estimate.
- Thinking/reasoning tokens (`thoughtsTokenCount`) are not captured; where they are billed as output they would be under-counted.
- Failed/timeout calls record 0 tokens and $0 even though a timed-out call may be billed.
- Fallback usage is recorded by overloading `error_category = 'FALLBACK_SUCCESS'` for a success row. A dedicated `is_fallback` column would be cleaner.
- `provider_request_id` is always `null`; `request_id` is `req-${Date.now()}-${random}` and is **not** the HTTP `x-request-id`, so one user request cannot be joined to its AI call.
- Insights served from the deterministic fallback are indistinguishable in telemetry from model output.
- No `prompt_version`, `prompt_tokens_by_section`, `cache hit`, `tool rounds` or `attempt number` columns.
- No budget alerts; daily quota counts requests, not tokens/cost.

**Improvements.** Fix cost formula after verifying semantics, capture thinking tokens, add `http_request_id`, `prompt_version`, `is_fallback`, `outcome` (`model|deterministic_fallback|parse_failed`), a daily cost-per-user view with an alert threshold, and `maxOutputTokens` ceilings.

**Learn.** Token economics, context-cost scaling, prompt caching, cost per successful outcome (not per call), budget-based rate limiting.

**Interview demo.** "Cost per active user per month": SQL over `gemini_usage_events`, then a before/after showing a 40% token reduction from tool-based retrieval instead of context stuffing.

---

### 3.14 AI evaluation and testing — PARTIAL

**Evidence.** ~2,900 lines across `backend/tests/unit/ai/*` (5 files), `tests/unit/coach/*` (7), `tests/unit/nutrition/{meal-photo,voice-meal}.test.ts`, `tests/unit/app-settings/{ai-usage-gate,gemini-*}.test.ts`, `tests/integration/http/ai-*.test.ts`, `tests/integration/repositories/ai-telemetry.test.ts`. CI (`.github/workflows/ci.yml`) runs unit tests, Testcontainers PostgreSQL integration tests, migration smoke test. Live smoke scripts: `scripts/verify-gemini-live.ts`, `verify-ai-final.ts`, `verify-phase6-ai-endpoints.ts`.

**Architecture.** The provider is mocked (`vi.fn().mockResolvedValue(...)`), so tests prove quota, fallback, timeout, ownership and parsing mechanics. They say nothing about whether the coach gives *good* answers.

**Limitations.** No golden datasets, no LLM-as-judge, no regression suite for prompts, no measured accuracy for meal photo, voice, Tamil/Tanglish, or medical-safety behaviour, no retrieval metrics (n/a yet), and no way to gate a prompt change in CI. The like/dislike signal is unused. `verify-*.ts` scripts are one-off manual checks, not repeatable evals.

**Improvements.** `evals/` directory: (1) deterministic checks (schema validity, bounds, language detection), (2) golden cases with expected properties (not exact strings), (3) LLM-as-judge with a rubric, calibrated against ~30 human labels, (4) safety/red-team set, (5) run offline against *recorded* responses in PR CI and live on a nightly schedule with a spend cap. Track results over time.

**Learn.** Eval-driven development, golden sets, rubric design, judge bias and calibration, pairwise comparison, pass@k, statistical noise (run n times), data leakage in evals.

**Interview demo.** A results table: prompt v1 vs v2 vs model A vs model B across accuracy, safety, latency and cost, with confidence intervals, and a failing PR blocked by the eval gate.

---

### 3.15 Logging, tracing and observability — PARTIAL

**Evidence.** `shared/logging/logger.ts` (pino, redaction list), `middleware/request-context.ts` (request id, per-request log line, path without query string), DB telemetry (§3.13), admin analytics. No OpenTelemetry, Langfuse, Sentry, LangSmith or Prometheus dependencies in `backend/package.json`.

**Limitations.** Prompts and responses are not captured anywhere (good for privacy, but it makes debugging bad answers impossible). No trace spanning HTTP → context build → provider call → parse. No parse-failure, fallback-rate or empty-response metrics. Swallowed errors (`catch {}` in insights, `.catch(() => {})` in telemetry) leave no log line. No alerting.

**Improvements.** Trace per AI request with spans (`context_build`, `llm_call`, `parse`, `tool:*`), storing *scrubbed* inputs/outputs for a sampled subset with a retention limit; propagate the HTTP request id into `request_id`; add counters (`ai_parse_failure_total`, `ai_fallback_total`, `ai_timeout_total`); an incident dashboard and 2–3 alerts.

**Learn.** OpenTelemetry GenAI semantic conventions, trace/span modelling for LLM apps, sampling, PII scrubbing, prompt/response retention policy, SLOs for AI features.

**Interview demo.** Pick a thumbs-down message, jump to its trace, show the exact prompt version, retrieved context and tool calls, find the cause, add it to the eval set.

---

### 3.16 AI deployment architecture — PARTIAL

**Evidence.** `backend/Dockerfile` (multi-stage, non-root, healthcheck), `backend/compose.yaml` (Postgres 17 + migrate + api profiles), `.github/workflows/ci.yml` (typecheck, lint, format, unit, integration, migration smoke, mobile/admin tests, gitleaks, docker build with `push: false`), `backend/docs/deployment.md`, Render + Neon referenced in `Resources/docs/reports/*`.

**Architecture.** AI runs **in-process inside the Node monolith**. There is one deployable.

**Limitations**
- Three pieces of AI state are per-process memory and become wrong when scaled beyond one instance: the burst rate limiter (`ai-rate-limit.ts` documents this and already exposes an `AiRateLimitStore` seam), the model cooldown/circuit breaker (`model-cooldown-tracker.ts`), and the insights cache (`get-coach-insights.ts`). The daily quota is correct because it is atomic in Postgres.
- CI builds the image but never pushes or deploys; there is no CD stage and no environment promotion. (I did not inspect Render service settings.)
- No AI-specific CI (evals, prompt checks, red-team).
- No separation of AI workloads from request-serving; a slow AI burst competes with the event loop and the DB pool.

**Improvements.** See the architecture proposal. In short: introduce the shared-state seam (Redis or Postgres) only when a second instance is real; move heavy and experimental AI to a separately deployable service.

**Learn.** 12-factor config for AI, service boundaries, timeouts and budgets across hops, canary/shadow deployment for model or prompt changes, rollback of prompts.

**Interview demo.** Shadow-deploy a new prompt/model: 10% of traffic is duplicated to v2, and the eval dashboard compares outputs without users seeing v2.

---

## 4. Cross-cutting findings (priority-ordered)

| # | Finding | Severity | Where |
|---|---|---|---|
| 1 | Client-supplied `history` (incl. `assistant` role) overrides server history | Medium (injection vector) | `chat-with-coach.ts:92,109` |
| 2 | Memory `sensitive` flag not enforced on provider payload | Medium (privacy) | `pg-memory-repository.ts` `getActiveMemoriesForContext` |
| 3 | Parse failures are silent and shown as valid results ("not food") while quota is charged | Medium (quality, trust) | `gemini-meal-photo-service.ts:149-163` and 3 others |
| 4 | Cost formula may double-count cached tokens; thinking tokens untracked | Low–Medium (accuracy of the admin dashboard) | `gemini-runtime-service.ts:135-146` |
| 5 | No `maxOutputTokens` / temperature set | Low–Medium (cost, determinism) | `gemini-client.ts:152` |
| 6 | Stored prompt-injection via memory text | Medium now; High once tools exist | `manage-memories.ts` → prompt |
| 7 | In-memory limiter/breaker/cache are wrong under >1 instance | Medium when scaling | §3.16 |
| 8 | Stale design docs describe OpenAI/pgvector architecture | Low (confusing for readers and interviewers) | `docs/09`, `21`, `22`, `27` |
| 9 | `workout_generator` is configured (flag, quota, model) but unimplemented | Info | `app-settings/*` |
| 10 | `toolCalls`/`blocks` in schema and UI renderers but never produced by the backend | Info (ready-made UX for tool calling) | `coach.schemas.ts`, `mobile/.../blocks/*` |

None of these is a regression risk to the working Play Store build; all are addressed by additive changes in the roadmap.

---

## 5. What an interviewer will see today vs. after the roadmap

| Interview topic | Today (honest) | After roadmap |
|---|---|---|
| "How do you control LLM cost/abuse?" | **Strong story** (gate, quotas, refunds, kill switch) | Add token budgets and spend-cap alerts |
| "How do you get reliable JSON?" | Weak (prompt-only + silent fallback) | Constrained decoding + validation + metrics |
| "Tool calling / agents?" | None | Read tools + one LangGraph workflow |
| "RAG?" | None | Hybrid RAG with measured retrieval quality |
| "How do you know it's good?" | Not measurable | Eval suite gating CI |
| "How do you debug a bad answer?" | Cannot | Trace → prompt version → context → fix → eval case |
| "Security of LLM apps?" | Good infra, no injection defence | Red-team suite with measured ASR |
| "Multimodal?" | **Strong story** | Grounded and measured accuracy |
