# Learning guide 06 — Coach insights moved to Python

**Branch:** `development`. **Builds on:** [02 Python-only architecture](02-python-only-ai-architecture.md), [03 voice meal](03-voice-meal-python-migration.md), [04 speech transcription](04-python-speech-transcription.md) and [05 meal photo](05-python-meal-photo-analysis.md). This is the **last** user-facing AI feature that called Gemini from Node. It is also the first migrated feature that has a *non-AI fallback*, a *cache* and a *large structured context*, so the interesting question is what must **stay** in Node.

---

## 1. What the feature does

The AI Coach home card calls `GET /api/v1/coach/insights?lang=en|ta|tanglish&timezone=…&refresh=true|false`. The API answers with a greeting, one recommendation and 2–3 short insights (title, description, category, priority, severity, action, a follow-up question, evidence, confidence, `requiresDevice`), written from the user's **real data**: profile, today's nutrition and water, recent workouts, today's planned workout, active goals and latest weight (the `UserFitnessContext`, the same payload coach chat uses). Nothing is stored.

**Public contract: unchanged** — same query, same response keys, same status codes and error codes, same quota and cache behavior.

## 2. Who owns what

| Concern | Owner |
|---|---|
| Login, route validation, the kill switch (`aiCoach` flag), the 10-minute cache, in-flight de-duplication, the `coach_chat` daily quota (insights share it), loading the user's data from PostgreSQL | **Node** (`GetCoachInsightsUseCase`, **unchanged**) |
| "Not enough data yet" welcome answer | **Node** (no AI call at all) |
| **Deterministic insights** used whenever the AI path fails or is unusable | **Node** (`domain/coach-insights.ts`) |
| Which Gemini models (admin "coach" model setting) | Node → sent to Python |
| Prompt, Gemini call, primary + backup model, reply parsing | **Python** |
| Token ledger (`feature = coach_insights`) | Python reports, Node writes |

Why the fallback stays in Node: it needs no AI, it is the safety net for "Python is down", and it must keep working exactly when Python does not. Python therefore **never invents insights**: when the model's answer is unusable it says `outcome: "unusable"` with no result, and Node answers with its own deterministic insights (this was readiness decision O5).

## 3. Request flow

```
Phone → GET /api/v1/coach/insights?lang=ta
  → Node: authenticate → zod (lang ∈ en|ta|tanglish) → GetCoachInsightsUseCase
      assertEnabled('coach_chat')                       ← kill switch, also for cache hits
      cache hit (same user + language, < 10 min, no refresh)?  → answer, STOP (free)
      same request already running?                      → share its result, STOP
      AiUsageGate.run('coach_chat')                      ← one quota unit
        load UserFitnessContext from PostgreSQL
        PythonCoachInsightsService.generateInsights(context, lang)
          not enough data?          → welcome answer (no AI)
          try: callPythonAi → POST /internal/v1/ai/coach/insights
                 (signed 30 s token, scope ai:coach:insights, complete context in the body)
               Python: verify token → validate → prompt → Gemini (primary, then backup) → parse
               ok + at least one insight → map to the public shape
               otherwise (unusable)      → deterministic insights
          catch ANY error (down, timeout, 401, 429, 503, bad contract…) → deterministic insights
      store in cache (also deterministic ones) → 200
```

## 4. The quota and fallback rules (preserved exactly — they are subtle)

All of these were true with Node Gemini and are asserted by tests now:

| Situation | Public result | Quota unit | Python calls |
|---|---|---|---|
| Normal generation | 200, AI insights | 1 | 1 |
| Cache hit (< 10 min) | 200, same insights | 0 | 0 |
| `refresh=true` | 200, new insights | 1 more | 1 |
| Concurrent identical requests | 200, shared result | 1 total | 1 total |
| User has no data yet | 200, welcome (`hasSufficientData: false`, no insights) | **1** (it is not an error, so the gate keeps the charge) | 0 |
| Python down / timeout / 401 / 429 / 503 / 422 / broken reply / unusable reply | **200, deterministic insights** (`hasSufficientData: true`) | **1, not refunded** | at most 1, never retried |
| Kill switch off | 422 `FEATURE_DISABLED`, even if a cached answer exists | 0 | 0 |
| Daily quota used up | 429 `AI_QUOTA_EXCEEDED` | 0 | 0 |

Why "consumed even on failure": the old service caught every error *inside* the work the gate wraps, so the gate saw a success and never refunded. The new adapter catches the same way. It is documented behavior, not an accident (readiness doc §1: "insights consume a quota unit even when the model fails"). Changing it would be a deliberate, separate decision.

The deterministic result is cached for 10 minutes like any other, so a broken AI path is not hammered by repeated refreshes.

## 5. Time budget

The app waits **25 s**. Node's HTTP call to Python is capped at **22 s** (`COACH_INSIGHTS_MAX_TIMEOUT_MS`, even if `AI_BACKEND_TIMEOUT_MS` is higher); Python's total Gemini deadline is **1.5 s shorter (20.5 s)** and covers primary *and* backup; one Gemini attempt is limited to 20 s (`GEMINI_ATTEMPT_TIMEOUT_S`, the same 20 s Node used). If anything is slower, the user gets deterministic insights instead of an error. **Real latency matters here:** the three live generations took **15–16 s each** (see §10), so the margin to the 20 s limit is thin.

## 6. Characterization-first

Before deleting `GeminiCoachInsightsService`, a throwaway script (outside the repo) ran the **real Node class** over nine synthetic contexts and recorded:

- **26 prompts**: eight sufficient contexts × `en`/`ta`/`tanglish`, plus `undefined` and an unknown language (both behave like English) → `tests/fixtures/coach_insights/prompt_cases.json`. The contexts include nulls, `0` (kept: `??` only replaces null), floats (`72.5`, `0.00001`, `1e21`), quotes, and Tamil text.
- **39 raw model replies** and what the Node parser made of them → `parse_cases.json` (22 usable, 17 unusable).
- **45 deterministic/welcome outputs** (nine contexts × five languages, for "model error" and for "unusable reply") → `backend/tests/fixtures/coach-insights/deterministic_cases.json`.

Quirks of the Node parser that are **preserved**:

- Code fences are removed **without trimming first**: a reply with a newline *before* the fence is unusable. (In production the text is trimmed before parsing, in Node's old client and in Python's, so this only matters for the pinned unit cases.)
- A reply is usable only if `insights` is a **non-empty array**. A `null` item anywhere breaks the whole reply; a non-object item (`"a"`, `5`) is accepted and filled with defaults.
- Per item: `id` kept only if a non-empty string (else `ins-<ms>-<index>`); `title`/`description`/`action`/`question` use `String(x || default)` (`"Fitness Insight"`, `""`, `"Ask Coach"`, `"How can I improve my progress?"`); enums outside the allow-lists fall back (`workout` / `medium` / `info` / `high`) and are **case-sensitive** (`"HIGH"` → `medium`); `evidence` is mapped with `String()` (`null` → `"null"`); `requiresDevice` is JavaScript truthiness (`"false"` → `true`, `[]` → `true`).
- `greeting` is kept only if a string (else `Hello, <name>!`); `recommendation` only if a string (an empty string is kept, anything else becomes `null`).
- All insights are kept (the "2 or 3" is only a request to the model).

## 7. Files

**Python (`ai-backend/src/onusfit_ai/`)**

- `prompts/coach_insights.py` — **`build_prompt(context, lang)`**, version `coach_insights_v1_node_parity`; verbatim port, compared against the 26 golden prompts (`test_coach_insights_prompt.py`). Uses `js_num` / `js_nullish` so numbers and `??` print like JavaScript.
- `contracts/coach_insights.py` — **`CoachInsightsRequest`** (`context` = the existing `UserFitnessContext` model, `lang`, `model`, `deadlineMs`; no unknown fields, so no `userId`), **`CoachInsightsResponse`** (`outcome: ok | unusable`, `result` or `null`, `usage`, `traceId`).
- `coach/insights_parsing.py` — **`parse_insights_output(raw, display_name)`** → `(result | None, outcome)`; never raises (`test_coach_insights_parsing.py`, 39 goldens + extras).
- `coach/insights.py` — **`generate_coach_insights`**: prompt → `llm.generate_text` → parse; logs metadata only (no name, goal, workouts, prompt or reply).
- `api/coach_insights.py` — **`POST /internal/v1/ai/coach/insights`**, scope `ai:coach:insights` (chat, meal, voice and transcription tokens are refused, and an insights token does not open the chat endpoint). Registered in `main.py`.
- `core/js_compat.py` — gained **`js_nullish`** (the `${value ?? default}` rule), moved out of the chat prompt where it was private; the chat golden prompts still pass byte for byte.

**Node (`backend/src/modules/coach/`)**

- `infrastructure/python-coach-insights-service.ts` — **`PythonCoachInsightsService`** implements the existing `CoachInsightsService` port with `callPythonAi`. Welcome answer first; then Python; **every** failure → `buildDeterministicInsights`.
- `domain/coach-insights.ts` — **`hasSufficientInsightsData`**, **`buildWelcomeInsights`**, **`buildDeterministicInsights`**: pure functions **moved unchanged** out of the old service (extracted by script so no Tamil/Tanglish string was retyped) and proven against the 45 goldens.
- `index.ts`, `container.ts` — `createCoachModule` now takes `insightsService` (and no `geminiConfig`); the container builds `PythonCoachInsightsService` with the `coach_insights` model names. `CoachModule` exposes `aiService` instead of `geminiClient` / `geminiService`.
- `GetCoachInsightsUseCase`, the controller, routes and schemas are **unchanged**.

## 8. Removed, and what was deliberately not removed

Verified by `grep` that nothing in `src/` referenced them, then deleted:

- `infrastructure/gemini-coach-insights-service.ts` (prompt + parser + deterministic fallback; the fallback now lives in `domain/coach-insights.ts`),
- `infrastructure/gemini-ai-service.ts` (the composite that built a Node `GeminiClient` for the coach module).

**Not removed in this change (removed afterwards in Phase 8, 2026-11-19, finding #15 in `PROJECT_STRUCTURE.md`):** `shared/ai/gemini-client.ts` (`GeminiClient`) and the runtime machinery behind it (`GeminiRuntimeService.executeWithTelemetry`, the error classifier, `runWithAiTimeout`). After this change **no production code constructed or called them**; only tests did, so removing them meant deleting or rewriting those tests and was done as its own change. Still needed and kept: `recordExternalUsage` (the ledger), `resolveModelNames` (admin model choice) and the admin "test API key" button, which calls the SDK once to validate a key (not user-facing inference).

## 9. Tests

- **Python:** 468 pass (was 367). New (101): prompt (26 goldens + 2), parsing (39 goldens + 3), API (31). The API tests cover success, every language, the complete context (all 8 synthetic contexts), unusable and empty replies, 11 invalid requests that must not echo user data, wrong scopes (including the chat/insights cross-check), missing and wrong token, structured Gemini errors, no private data in logs, and — with the **real `GeminiClient` over a fake SDK** — backup-model fallback, both models failing, rate limit, a hanging call timing out once without retry, and a missing key being non-billable.
- **Node:** `coach-insights-fallback.test.ts` (54: the 45 goldens + rules) and `python-coach-insights-integration.test.ts` (75) drive the **real use case, real quota gate, real HTTP client, real route/controller** against a fake Python: the full context reaches Python field for field, token scope, deadline cap, usage rows, cache hit / refresh / per-user / per-language / de-duplication, kill switch and quota, the welcome path, **every failure → deterministic 200 with the unit consumed and exactly one Python call**, and the public response keys. The existing `coach-insights.test.ts` (mocked service) passes unchanged.

## 10. Verification status

| Check | Status |
|---|---|
| Python tests, Ruff, mypy | run (468 passed) |
| Node typecheck, unit tests (1591), production build | run |
| **Real Gemini coach insights** | **Done on 2026-11-19.** Through a real Express route, the real use case and quota gate, the Node adapter, a real `uvicorn` and real Gemini (`gemini-3.5-flash-lite`), using **synthetic** contexts from the test fixtures (no real user data). Four requests: a full context in English (200, 3 grounded AI insights, **15.2 s**), the same request again (**7 ms, from cache**), a sparse all-null context in Tanglish (3 insights, 16.0 s) and a Tamil-script context with quotes (2 insights, 16.1 s). All valid against the public schema and none deterministic; **3 quota units, 3 `coach_insights` usage rows**, adapter logs showed `outcome: ok`. The throwaway scripts and the service secret were not saved; the key came from the local, git-ignored `backend/.env` and was never printed. Not tested: a phone, the backup model against real Gemini, and the quality of Tamil/Tanglish wording by a native speaker. |

## 11. Known gaps and notes

- **Latency is close to the limit.** 15–16 s per generation against a 20 s Gemini attempt and 25 s on the phone: on a slow Gemini minute, users will get the deterministic insights instead (HTTP 200, no error). That is the designed behavior and is also logged, but it means AI quality quietly degrades; watch the share of `Python coach insights failed` log lines and `outcome: unusable` once deployed. The old Node path had the same 20 s limit.
- Only successful Python calls are written to the usage table (failures that never answered cost nothing visible).
- The welcome answer and failed generations still consume a `coach_chat` unit (see §4). Charging only for AI-generated answers would be a separate behavior change.
- The prompt interpolates the user's display name, goal and workout names verbatim (parity first, readiness decision O7); hardening against prompt injection is a separate, evaluated change.
- The `GeminiService` port keeps its old name (it now means "chat + insights generation"); renaming it touches eight test files and was left alone.
- The HTTP integration tests that need PostgreSQL (`ai-usage.http.test.ts`, `ai-rate-limit.http.test.ts`) were **not run** (no Docker here). Reading them, their insights expectations should hold unchanged: they expect `422 FEATURE_DISABLED` when the flag is off and `200` for repeated and refreshed requests, and their freshly seeded users have no data, so insights takes the welcome path and never reaches Python (with data it would be `200` with deterministic insights, which is what the old "no Gemini key" setup produced too). Run them where Docker is available.

## 12. What to study

1. **Decide what the new service must *not* own.** Cache, quota, data loading and the safety-net fallback stayed in Node; Python only turns a context into a reply.
2. **A fallback is a contract.** "Any failure → 200 with deterministic insights, unit consumed, one call" is five properties, each pinned by a test.
3. **Never let the AI service fabricate.** `outcome: "unusable"` + `null` is honest; Node decides what to show.
4. **Extract, don't retype.** The Tamil and Tanglish strings were moved by script and proven with 45 goldens.
5. **Dead code is a decision.** Deleting what is provably unused is cheap; deleting what only tests use needs the whole suite.

**Interview line:** "I moved the last Gemini feature out of Node without changing the API, the cache or the quota rules. Python only generates and parses; Node keeps the cache, the quota gate and a deterministic fallback, so a Python outage degrades to simple insights instead of an error. I pinned the old behavior with 110 recorded cases first and ran the real thing through Gemini at the end."
