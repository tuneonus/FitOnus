# Learning guide 02 — Python is now the only AI Coach chat backend

**Branch:** `development` (not committed, not deployed). **Builds on:** [01-python-chat-integration.md](01-python-chat-integration.md), which describes the earlier *flag + Node fallback* design. This guide describes what replaced it. Where the two disagree, this one is current.

---

## 1. Why the Node Gemini fallback was removed

In guide 01, Node asked Python first and, if Python failed, called Gemini itself. That was the right *migration* design: it made it safe to switch on. But as a *destination* it has real costs:

| Problem with keeping the fallback | Why it matters |
|---|---|
| **Two implementations of one feature** | The prompt, the parser and the model-fallback logic existed in TypeScript *and* Python. Every change had to be made twice, and a golden-file test existed only to keep them from drifting. |
| **Hidden failures** | If Python was broken (bad secret, wrong URL, bad deploy), users still got answers from Node. Nobody noticed that Python was never actually used. A failing component should fail loudly in development. |
| **Possible double billing** | A Python timeout followed by a Node call could cost two Gemini calls for one quota unit. |
| **It can't teach you anything** | You learn production AI engineering by owning the failure modes of *one* inference service: timeouts, rate limits, retries, errors, not by having a safety net that hides them. |

**Trade-off you are accepting:** if the Python service is down, AI Coach chat is down. The API answers with a clean `503` and the app shows a normal "try again" message. Other AI features (voice meal, meal photo, transcription, insights) still use Node Gemini and are unaffected.

What did *not* change: the mobile API, the quota gate, conversation storage, memory consent, the prompt wording, the Gemini models, and Python's own primary → fallback **model** logic (that is a different fallback: Gemini model A → Gemini model B, inside Python).

---

## 2. Node vs Python responsibilities

```
Phone ──► NODE (front of house) ───────────► PYTHON (kitchen) ───► Gemini
          • who is this? may they chat?       • build the prompt
          • feature switch, burst limit,      • call Gemini (primary model,
            daily quota (reserve 1 unit)        then one backup model)
          • load profile/workouts/goals       • parse the reply
          • choose which memories (consent)   • report token usage
          • save user + assistant messages
          • turn any failure into a clean HTTP error
```

| Concern | Owner | Where |
|---|---|---|
| Login, permissions | Node | `coach.controller.ts` (`requireActor`) |
| Daily quota, feature switch, burst limit, refund rules | Node | `AiUsageGate` (`shared/ai/ai-usage.ts`, `app-settings/…/ai-usage-gate.ts`) |
| User data, history, memories (consent) | Node | `ChatWithCoachUseCase`, `PgUserContextRepository`, `PgMemoryRepository` |
| Saving conversations | Node | `ChatWithCoachUseCase` |
| Which Gemini models to use | Node (admin console) → sent to Python each request | `GeminiRuntimeService.resolveModelNames` |
| Prompt, Gemini call, reply parsing | **Python** | `ai-backend/src/onusfit_ai/…` |
| Primary → backup **model** switching | **Python** | `llm/gemini.py` |
| Gemini API key | **Python** (its own `GEMINI_API_KEY`) | env var |
| Cost/usage ledger | Node (Python reports, Node writes) | `GeminiRuntimeService.recordExternalUsage` |

---

## 3. The exact request flow

1. Phone: `POST /api/v1/coach/chat` (unchanged contract).
2. Node authenticates, validates, enters `AiUsageGate.run` → **reserves exactly one quota unit**.
3. `ChatWithCoachUseCase` loads context/history/memories, creates or finds the conversation, **saves the user's message**.
4. It calls `generateCoachResponse(...)` on the coach service, which is now **always** `PythonCoachChatService` (no other implementation exists).
5. The adapter gets model names from admin settings and sends `POST /internal/v1/ai/coach/chat` to Python with a signed 30-second token.
6. Python verifies the token, validates the body, builds the prompt, calls Gemini, parses, returns JSON.
7. Node validates Python's reply, records usage, returns a `CoachResponse`.
8. The use case **saves the assistant message** and answers the phone.

If step 5–7 fails, the adapter throws one controlled `AppError`; the use case does **not** save an assistant message; the gate settles the quota (§5).

---

## 4. Error and timeout handling

Time budget (all in `backend/src/config/env.ts` and `python-coach-chat-service.ts`):

```
mobile gives up .......................... 30 s
Node → Python HTTP timeout (default) ..... 25 s   (AI_BACKEND_TIMEOUT_MS, 1–28 s)
Python's Gemini deadline ................. 23.5 s (HTTP timeout − 1.5 s, so Python can answer "timed out" itself)
one Gemini attempt (Python) .............. ≤ 20 s (GEMINI_ATTEMPT_TIMEOUT_S), backup model only if time remains (≥ 1 s)
```

What the user/API sees for each failure (all through the existing error handler, no new error codes):

| What went wrong | Python says | Node returns to the app | Quota |
|---|---|---|---|
| Python not running / wrong URL | — (connection refused) | `503 SERVICE_UNAVAILABLE` "The AI Coach is temporarily unavailable…" | **refunded** (nothing reached any AI) |
| Wrong/expired service token | `401 AUTH_INVALID_TOKEN` | same 503 (details only in server logs) | refunded |
| Python missing its secret or Gemini key | `503 AUTH_NOT_CONFIGURED` / `PROVIDER_NOT_CONFIGURED` | same 503 | refunded |
| Contract mismatch | `422 INVALID_REQUEST` | same 503 | refunded |
| Python crashed | `500` | same 503 | consumed (Gemini may have been called) |
| Reply doesn't match the contract | `200` + wrong shape | same 503 | consumed |
| Node → Python HTTP timeout | — | `503` "AI request timed out. Please try again." | consumed |
| Gemini timed out inside Python | `504 PROVIDER_TIMEOUT` | same timeout error | consumed |
| Gemini rate limit | `429 PROVIDER_RATE_LIMITED` (+`retryAfterSeconds`) | `429 RATE_LIMITED` (+ retry hint) | consumed |
| Gemini daily quota (whole project) | `429 PROVIDER_QUOTA_EXHAUSTED` | `429 AI_QUOTA_EXCEEDED` | consumed |
| Both Gemini models failed / cooling down | `503 AI_UNAVAILABLE` | `503 AI_UNAVAILABLE` | consumed (or refunded if cooling skipped the call) |

Rules worth remembering:
- **No automatic retry anywhere.** Node calls Python once; Python calls each Gemini model at most once. Retrying could be billed twice.
- **Nothing internal leaks:** no URLs, tokens, secrets or Google error text in any response.
- The user's message is already saved when a failure happens, so tapping retry (same `clientMessageId`) does not duplicate it.

---

## 5. Quota and persistence behavior

The one idea to understand: **`dispatched`**. The quota gate refunds a unit only if the AI provider was *never* called.

- Python's error body includes `dispatched: true/false` ("may Gemini already have been called?").
- Node's client adds the cases Python can't speak for: *connection refused / DNS failure* ⇒ nothing was sent ⇒ `false`; *HTTP timeout* ⇒ unknown ⇒ `true`.
- `PythonCoachChatService` calls `markAiRequestDispatched()` when `dispatched` is true; otherwise it leaves it false, and `AiUsageGate` refunds the unit when the request throws.

Tested guarantees (`coach-chat-python-integration.test.ts`, real use case + real gate):

| Guarantee | Test |
|---|---|
| Success ⇒ 1 quota unit, 2 messages (`user`, `assistant`) | "serves the reply from Python…" |
| Python down ⇒ unit refunded, only the user message, conversation created once | "Python unavailable…" |
| Timeout / Gemini rate limit ⇒ unit consumed, **no retry**, only the user message | timeout & rate-limit tests |
| Invalid token ⇒ refunded, one call only | "invalid service token…" |
| Invalid reply ⇒ no assistant message | "invalid Python response…" |
| Feature off / quota exhausted ⇒ Python never called, nothing written | "Node responsibilities…" |

---

## 6. What changed (this step)

**Deleted**
- `backend/src/modules/coach/infrastructure/gemini-coach-chat-service.ts` — the Node chat prompt, parser and Gemini call.
- `backend/tests/unit/coach/coach-chat-prompt-parity.test.ts` — compared Node's prompt to Python's; Node's prompt no longer exists.
- The `COACH_CHAT_BACKEND` flag, `wrapChatService`, `CoachChatOptions`, the fallback timing constants.

**Modified (Node)**
- `src/modules/coach/infrastructure/python-coach-chat-service.ts` — fallback removed; every failure → one `AppError`.
- `src/modules/coach/infrastructure/gemini-ai-service.ts`, `src/modules/coach/index.ts` — chat service is now a *required* constructor/module option (`chatService`), not an optional wrapper.
- `src/modules/coach/application/ports.ts` — `generateCoachResponse` back to 4 parameters.
- `src/config/env.ts` — flag removed; `AI_BACKEND_URL` / `AI_BACKEND_SERVICE_SECRET` validated (format) at load and **required** to start (`assertAiBackendConfigured`); default HTTP timeout 25 s, max 28 s.
- `src/server.ts` — fails at startup with a clear JSON error if the Python settings are missing.
- `src/container.ts` — always builds the Python client and adapter.
- `src/modules/app-settings/.../gemini-runtime-service.ts` — new `resolveModelNames` (model names without needing a Node-side API key); `resolveExecutionTarget` behaves as before.
- `scripts/verify-ai-final.ts` — removed the one scenario that used the Node chat parser (now covered in Python tests).
- `tests/helpers/test-app.ts` (test env gets the two Python settings), `backend/.env.example`.

**Still in Node (not migrated yet; voice meal has since moved, see guide 03):** voice meal, meal photo, transcription, coach insights, admin "test key". `GeminiClient`, `GeminiRuntimeService` and the quota gate remain because they need them.

**Python:** no behavior change. Docstrings for the prompt now say the golden files are regression fixtures; README updated.

**Important functions to read**
- `PythonCoachChatService.generateCoachResponse` — try Python once; on failure mark dispatched if needed and throw `toAppError(failure)`.
- `toAppError` — the failure table in §4.
- `assertAiBackendConfigured` (`env.ts`) — startup check.
- `GeminiRuntimeService.resolveModelNames` — admin-configured model names.

---

## 7. Python files: Input → Processing → Output → Errors → Tests

(`ai-backend/src/onusfit_ai/`; tests in `ai-backend/tests/`)

**`main.py` — `create_app()`**
- **Input:** none. **Processing:** builds the FastAPI app, disables `/docs` and `/openapi.json` (internal service), registers error handlers and the two routers. **Output:** the app (`app`). **Errors:** none. **Tests:** `test_health.py`, `test_coach_chat_api.py::test_openapi_docs_are_not_public`.

**`api/health.py` — `live()`**
- **Input:** `GET /health/live`. **Processing:** reads settings. **Output:** `{status, service, version, environment}`. **Errors:** none (checks no dependency). **Tests:** `test_health.py`.

**`api/coach_chat.py` — `coach_chat()`**
- **Input:** JSON body, `Authorization: Bearer <token>`, optional `X-Request-Id`. **Processing:** FastAPI runs the auth dependency, validates the body into `CoachChatRequest`, injects the LLM, calls `generate_coach_reply`. **Output:** `CoachChatResponse`. **Errors:** 401/503 auth, 422 validation, any `AiError` from the LLM layer. **Tests:** `test_coach_chat_api.py` (success shape, rejections, structured provider errors, no content in logs).

**`contracts/coach_chat.py` (+ `_base.py`)** — the request/response models
- **Input:** raw JSON. **Processing:** Pydantic checks types, lengths (`message` 1–1000, `history` ≤ 20…), allowed values, **forbids unknown fields** (so a body `userId` is refused), converts camelCase ↔ snake_case. **Output:** typed objects. **Errors:** `RequestValidationError` → 422 listing field names only. **Tests:** `test_coach_chat_api.py::test_invalid_requests_are_rejected_without_echoing_input`, `test_user_id_in_body_is_not_accepted`.

**`coach/chat.py` — `generate_coach_reply()`**
- **Input:** request, an LLM object, trace id. **Processing:** `build_prompt` → `llm.generate_text` → `parse_coach_output` → map usage; logs metadata only. **Output:** `CoachChatResponse`. **Errors:** propagates `AiError`. **Tests:** `test_coach_chat_api.py` (with a fake LLM), `test_coach_chat_api.py::test_message_memories_and_reply_are_never_logged`.

**`coach/parsing.py` — `parse_coach_output()`**
- **Input:** Gemini's raw text, whether memories were supplied. **Processing:** strip ```` ```json ```` fences → `json.loads` → accept if it's an object with string `text`; else use raw text. Adds `"AI Memory"` to `sources` when memories exist. **Output:** `(result, "ok" | "unstructured")`. **Errors:** none raised (bad JSON is an expected case). **Tests:** `test_coach_chat_parsing.py`.

**`prompts/coach_chat.py` — `build_prompt()`**
- **Input:** message, context, history, memories. **Processing:** system rules + user data + memories + last 6 turns + the question; `js_num` formats numbers like JavaScript did. **Output:** one string. **Errors:** none. **Tests:** `test_coach_chat_prompt.py` compares with `tests/fixtures/coach_chat/*.prompt.golden.txt`, which are the exact prompts the former Node code produced. To change the prompt on purpose: bump `PROMPT_VERSION`, regenerate those files.

**`llm/gemini.py` — `GeminiClient.generate_text()`**
- **Input:** prompt, primary and fallback model names, deadline. **Processing:** plan models (skip any in cooldown), call with `asyncio.timeout`, **no SDK retries**, on a *model-fixable* failure try the backup model once, record cooldowns. **Output:** `LlmResult(text, usage)`. **Errors:** `AiError` with safe codes (`PROVIDER_RATE_LIMITED`, `PROVIDER_QUOTA_EXHAUSTED`, `PROVIDER_UNAVAILABLE`, `AI_UNAVAILABLE`, `PROVIDER_TIMEOUT`, `PROVIDER_AUTH_ERROR`, `PROVIDER_NOT_CONFIGURED`, `PROVIDER_ERROR`), each with `dispatched`. **Tests:** `test_gemini_client.py` (primary/fallback behavior, exactly two calls max, auth/daily-quota never fall back, timeout, cooldown, deadline, missing key).

**`llm/errors.py` — `classify_gemini_error()`, `ModelCooldown`**
- **Input:** any exception from the SDK. **Processing:** reads HTTP code/status/details, retry hints, model-specific quota. **Output:** `ClassifiedError(kind, is_retryable, is_project_wide, retry_after_seconds)`. **Errors:** never raises. **Tests:** `test_gemini_client.py::test_classifier_…`.

**`core/config.py` — `get_settings()`**
- **Input:** environment. **Processing:** reads `GEMINI_API_KEY`, `AI_SERVICE_JWT_*`, timeouts. **Output:** frozen `Settings`. **Errors:** none (missing secret is handled by auth, failing closed). **Tests:** used by every API test via env fixtures.

**`core/auth.py` — `verify_service_token()`, `require_scope()`**
- **Input:** `Authorization` header, endpoint scope. **Processing:** signature (HS256 only), issuer, audience, expiry, lifetime ≤ 60 s, scope, replay (`jti`). **Output:** `ServiceClaims`. **Errors:** 401 `AUTH_INVALID_TOKEN` (one vague message) or 503 `AUTH_NOT_CONFIGURED` if the secret is missing/short. **Tests:** `test_auth.py` (wrong secret/audience/issuer/scope, expired, too-long lifetime, garbage, replay, `alg: none`, fail-closed).

**`core/errors.py` — `AiError`, `register_error_handlers()`**
- **Input:** an `AiError` or validation error. **Processing:** one JSON shape `{"error": {code, message, dispatched, retryAfterSeconds?}}`; validation errors list fields, never values. **Output:** JSON response. **Errors:** — . **Tests:** `test_coach_chat_api.py`.

---

## 8. How to run and test locally

```bash
# 1) Python service
cd ai-backend
uv venv .venv && uv pip install --python .venv/bin/python -e ".[dev]"     # one time (.venv is gitignored)
cp .env.example .env     # set AI_SERVICE_JWT_SECRET (32+ chars) and GEMINI_API_KEY
set -a; source .env; set +a
.venv/bin/uvicorn onusfit_ai.main:app --host 127.0.0.1 --port 8000
curl http://127.0.0.1:8000/health/live

# 2) Node (backend/.env must contain; never commit it)
#    AI_BACKEND_URL=http://127.0.0.1:8000
#    AI_BACKEND_SERVICE_SECRET=<same value as AI_SERVICE_JWT_SECRET>
cd backend && npm run dev
```

If either Node setting is missing, Node refuses to start and prints which key is missing (never values). Generate a secret with `python3 -c "import secrets; print(secrets.token_urlsafe(36))"`.

**Tests**
```bash
cd ai-backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check . && .venv/bin/mypy
cd backend    && npm run typecheck && npm test && npm run build
```

**Try the failures yourself:** stop Python and send a coach message (clean 503, quota refunded); start Python with a different `AI_SERVICE_JWT_SECRET` (Python logs a 401, Node logs `Python coach chat failed … kind: auth`, the app gets the same clean 503).

**Deployment note:** the Node server now cannot start without a reachable-configured Python backend. Deploying this branch needs the Python service hosted and both settings added to the environment first (not done; deployment configuration was out of scope).

---

## 9. What to study for AI Engineer interviews

1. **Service boundaries for LLM features:** what stays in the product backend (identity, quota, persistence, consent) and what moves to the inference service. Be able to draw §2.
2. **Failure design:** timeouts that nest (mobile 30 > HTTP 25 > Gemini 23.5 > attempt 20), why *not* to auto-retry billable calls, and the difference between "model fallback" (kept) and "provider/implementation fallback" (removed).
3. **Billing-safe error handling:** the `dispatched` flag and refund-vs-consume rule.
4. **Structured I/O:** Pydantic contracts with `extra="forbid"`, why validate *both* directions (Python validates the request, Node validates the reply).
5. **Service-to-service auth:** short-lived HS256 JWT, audience/scope/replay, fail-closed secrets; why identity is in the token, never the body.
6. **Migration technique:** golden-file parity while two implementations exist, then retire one and keep the goldens as regression fixtures.
7. **Privacy in logs:** metadata-only logging and "validation errors never echo values", tested.
8. **Honest limits to mention:** one Python instance (replay cache and model cooldown are in-memory), no streaming yet, Python has its own Gemini key (admin-console key applies to the Node features), only successful Python calls appear in the usage table.

**30-second answer:** "AI Coach inference is a separate FastAPI service; the Node API stays the system of record. Node does auth, quota, data loading and persistence, then calls Python with a 30-second signed token. Python builds the prompt, calls Gemini with a backup model and a total deadline, validates the output, and reports token usage. I removed the Node fallback on purpose, so failures are explicit: one controlled 503, no retries, and quota refunded only when nothing reached Gemini. Tests cover the whole path with the real quota gate, and I verified it end to end against real Gemini."
