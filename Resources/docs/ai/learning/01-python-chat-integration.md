# Learning guide 01 — How the Python AI Coach chat works

> **Superseded in part (2026-11-18, branch `development`):** the `COACH_CHAT_BACKEND` flag and the Node Gemini fallback described below were removed. Python is now the only coach chat backend; see [02-python-only-ai-architecture.md](02-python-only-ai-architecture.md). The rest of this guide (FastAPI, Pydantic, Gemini calls, the service token, quota behavior) still applies.

**Written for:** you, learning AI engineering by reading working code. No prior FastAPI or Pydantic knowledge assumed.
**Status of the code described here:** implemented and tested (see §11). It is **off by default**. Nothing is deployed or committed.

> Paths are relative to the repo root. Line numbers are from the day this was written (2026-11-18) and will drift; the function names will not.

---

## 0. The 60-second picture

Before this work, the Node API did everything for an AI Coach message, including calling Gemini. Now one step, "turn this prompt into a reply", can be done by a small Python program instead.

```
Phone ──► Node API ───────────────► Python (FastAPI) ───► Gemini
          (who are you? may you?      (build prompt,         (the LLM)
           quota, load your data,      call Gemini,
           save the conversation)      parse the reply)
          ◄─────────────────────────── ◄──────────────────── ◄────
```

Think of it as a restaurant. **Node is the front of house**: it knows the customer, checks they are allowed to order, keeps the bill (quota) and writes the order in the book (conversation). **Python is the kitchen**: it only cooks (calls the AI) and hands the plate back. The kitchen never talks to customers and never touches the till.

If the kitchen is closed or broken, Node cooks the dish itself (the old way) so the customer is still served.

**The switch** (default = old way):

```
COACH_CHAT_BACKEND=NODE_GEMINI     # default: Node calls Gemini itself (nothing changes)
COACH_CHAT_BACKEND=PYTHON_GEMINI   # Node asks Python first; Node Gemini is the backup
```

---

## 1. Every file, and why it exists

### New — Python (`ai-backend/`)

| File | What it is | Why it exists |
|---|---|---|
| `src/onusfit_ai/main.py` | Builds the FastAPI app | The entry point (`uvicorn onusfit_ai.main:app`). Mounts the routes and error handlers. Turns off `/docs` because this is an internal service. |
| `src/onusfit_ai/api/coach_chat.py` | The route `POST /internal/v1/ai/coach/chat` | A *thin* HTTP wrapper: receive request → call one function → return the answer. |
| `src/onusfit_ai/contracts/_base.py` | Shared Pydantic settings | camelCase on the wire, strict (unknown fields rejected). |
| `src/onusfit_ai/contracts/coach_chat.py` | Request/response shapes | The "contract" between Node and Python. Pydantic validates it automatically. |
| `src/onusfit_ai/coach/chat.py` | `generate_coach_reply` | The use case: prompt → Gemini → parse → response. No HTTP in it, so it is easy to test. |
| `src/onusfit_ai/coach/parsing.py` | `parse_coach_output` | Turns Gemini's raw text into structured data (strips ```` ```json ```` fences, falls back to plain text). |
| `src/onusfit_ai/prompts/coach_chat.py` | The prompt text | A line-for-line port of the Node prompt, with a version label. |
| `src/onusfit_ai/llm/gemini.py` | `GeminiClient` | The **only** file that talks to Google. Handles the fallback model, timeouts, cooldown. |
| `src/onusfit_ai/llm/errors.py` | Error classifier + cooldown | Decides "is this failure worth trying the backup model?" and "skip a model that just failed". |
| `src/onusfit_ai/core/config.py` | `Settings` | Reads environment variables (secrets never live in code). |
| `src/onusfit_ai/core/auth.py` | Service-token check | Makes sure only Node can call this service. |
| `src/onusfit_ai/core/errors.py` | `AiError` + handlers | One consistent JSON error shape; never echoes user content. |
| `tests/…` (7 files) + `tests/fixtures/coach_chat/*` | 59 tests + shared fixtures | See §11. |
| `.env.example` | Template of settings | Copy to `.env`. |

Modified in Python: `pyproject.toml` (added `google-genai`, `pyjwt`, `pytest-asyncio`, ruff/mypy config), `README.md`.

### New — Node (`backend/`)

| File | What it is | Why it exists |
|---|---|---|
| `src/shared/ai/python-ai-client.ts` | `PythonAiClient`, `PythonAiError` | Generic "call the Python service" code: signs the token, enforces a timeout, classifies failures. Knows nothing about coaching. |
| `src/modules/coach/infrastructure/python-coach-chat-service.ts` | `PythonCoachChatService` | The coaching-specific adapter: builds the request, validates the reply, decides fallback vs error, records usage. |
| `tests/helpers/fake-python-ai-server.ts` | A real local HTTP server for tests | So tests exercise real HTTP, timeouts and connection failures. |
| 5 test files (see §11) | | |

### Modified — Node

| File | Change | Why |
|---|---|---|
| `src/config/env.ts` | New settings `COACH_CHAT_BACKEND`, `AI_BACKEND_URL`, `AI_BACKEND_SERVICE_SECRET`, `AI_BACKEND_TIMEOUT_MS` + validation | The feature flag. Refuses to start in Python mode without a URL and a long secret. |
| `src/container.ts` | Builds the Python client and passes `wrapChatService` only in Python mode | The one place where implementations are wired together. |
| `src/modules/coach/index.ts` | `wrapChatService` option; exports the adapter | Lets the container swap the chat implementation without the coach module knowing about Python. |
| `src/modules/coach/infrastructure/gemini-ai-service.ts` | Accepts `wrapChatService` | Puts the Python adapter *in front of* the Node chat service, which becomes its fallback. |
| `src/modules/coach/application/ports.ts` | `generateCoachResponse(..., options?)` + `CoachChatOptions` | Lets the fallback receive "you only have N seconds left". |
| `src/modules/coach/infrastructure/gemini-coach-chat-service.ts` | Uses `options.timeoutMs` (default still 20 000) | Same. Default behavior unchanged. |
| `src/modules/app-settings/.../gemini-runtime-service.ts` | New `recordExternalUsage` | So Python-served calls appear in the existing usage/cost dashboard. |
| `.env.example` | Commented placeholders | Documentation only, no secrets. |

**Not changed (on purpose):** `ChatWithCoachUseCase`, the quota gate, the routes, the response schema, the mobile app, the database.

---

## 2. The exact request flow

Assume `COACH_CHAT_BACKEND=PYTHON_GEMINI`.

1. **Phone** sends `POST /api/v1/coach/chat` `{ message, ... }` with the user's login token.
2. **Node** (`coach.controller.ts` → `chat`): checks the login, validates the body, calls `ChatWithCoachUseCase.execute`.
3. **Node use case**: runs inside the **quota gate** (`AiUsageGate.run`): feature switch → burst limit → reserve **one** quota unit.
4. **Node use case** then loads the user's fitness data, finds or creates the conversation, **saves the user's message**, loads recent history and memories.
5. **Node use case** calls `geminiService.generateCoachResponse(message, context, history, memories)`. This is where the swap happens: that object is now `PythonCoachChatService`.
6. **`PythonCoachChatService`** asks the admin settings which Gemini models to use, then calls `PythonAiClient.postJson`.
7. **`PythonAiClient`** signs a 30-second token naming the user and sends `POST /internal/v1/ai/coach/chat` to Python.
8. **Python** verifies the token, validates the body with Pydantic, builds the prompt, calls Gemini (primary model, then the backup model only if needed), parses the reply, and returns JSON.
9. **Node adapter** validates Python's reply, records tokens/cost in the usage table, and returns a normal `CoachResponse`.
10. **Node use case** **saves the assistant message**, returns the response.
11. **Phone** receives the exact same JSON shape as before.

Steps 1–4 and 10–11 are untouched. Only steps 5–9 are new.

---

## 3. How FastAPI routes work (`ai-backend/src/onusfit_ai/`)

FastAPI turns a Python function into an HTTP endpoint with a decorator:

```python
# api/coach_chat.py
router = APIRouter(prefix="/internal/v1/ai/coach", tags=["coach"])

@router.post("/chat", response_model=CoachChatResponse)
async def coach_chat(
    body: CoachChatRequest,                                   # ← parsed + validated JSON body
    claims: ServiceClaims = Depends(require_chat_scope),      # ← "run this check first"
    llm: TextGenerator = Depends(get_llm),                    # ← "give me an LLM client"
    x_request_id: str | None = Header(default=None),          # ← the X-Request-Id header
) -> CoachChatResponse:
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())
    return await generate_coach_reply(body, llm, trace_id=trace_id)
```

Things to notice:

- **The decorator** `@router.post("/chat")` says "POST requests to `/internal/v1/ai/coach/chat` run this function".
- **Parameters are inputs.** FastAPI looks at each parameter's *type* to decide where it comes from: a Pydantic model → the JSON body; `Header(...)` → a header; `Depends(...)` → the result of another function.
- **`Depends`** is dependency injection: FastAPI calls `require_chat_scope` (the auth check) and `get_llm` (builds the Gemini client) and passes the results in. If the auth check raises an error, your function never runs. This also makes testing easy: a test can replace `get_llm` with a fake (`app.dependency_overrides[get_llm] = ...`).
- **`async def` / `await`**: while Python waits for Gemini (seconds), the server can handle other requests. `await` means "pause here until the answer arrives, but let others run".
- **The route is thin**: no prompt, no Gemini, no parsing. Just plumbing. The real work is in `coach/chat.py`.
- **`main.py:create_app`** assembles everything: `register_error_handlers(app)` and `app.include_router(coach_chat.router)`.

---

## 4. How Pydantic validates data (`contracts/`)

A **Pydantic model** is a class describing the exact shape of some data. Pydantic checks incoming JSON against it and gives you real typed Python objects, or a clear error.

```python
# contracts/coach_chat.py
class CoachChatRequest(ContractModel):
    message: str = Field(min_length=1, max_length=1000)
    context: UserFitnessContext
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
    memories: list[str] = Field(default_factory=list, max_length=30)
    model: ModelSelection
    deadline_ms: int = Field(ge=1000, le=30000)
```

```python
# contracts/_base.py
class ContractModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")
```

- `deadline_ms` in Python is `deadlineMs` in JSON (`alias_generator=to_camel`). Node uses camelCase; Python prefers snake_case; Pydantic translates.
- **`extra="forbid"`** rejects unknown fields. This is why a request containing `"userId": "..."` returns 422: the service refuses to accept an identity from the body (test: `test_user_id_in_body_is_not_accepted`).
- `Field(min_length=1, max_length=1000)` is the same rule as the Node route (`coach.schemas.ts`).
- `Literal["user", "assistant"]` (in `ChatTurn.role`) allows only those two strings.
- Responses use Pydantic too: `CoachChatResponse` is the promise Python makes to Node.

When validation fails, FastAPI raises `RequestValidationError`. Our handler (`core/errors.py:handle_validation_error`) turns it into:

```json
{"error": {"code": "INVALID_REQUEST", "message": "Request validation failed.", "dispatched": false,
           "fields": [{"field": "message", "problem": "string_too_short"}]}}
```

It lists **where and why** but never **the value**, because the value could be a private health message. (Test: `test_invalid_requests_are_rejected_without_echoing_input`.)

---

## 5. How Python calls Gemini (`llm/gemini.py`)

```python
from google import genai
client = genai.Client(api_key=...)          # built once from GEMINI_API_KEY
response = await client.aio.models.generate_content(model="gemini-3.5-flash-lite", contents=prompt, config=...)
text = response.text                         # the model's answer
usage = response.usage_metadata              # token counts
```

`GeminiClient.generate_text` wraps that with production behavior. **Input → Processing → Output → Errors:**

- **Input:** `prompt` (a string), `primary_model`, `fallback_model` (names chosen by Node), `deadline_s` (total time budget).
- **Processing:**
  1. Builds a **plan**: normally `[primary, fallback]`. If the primary is in *cooldown* (it failed recently), start with the fallback. If both are cooling, fail immediately without calling Google.
  2. For each model in the plan: computes the time left; if under 1 s, stops. Otherwise calls Gemini with `asyncio.timeout(...)`, and tells the SDK `retry_options=HttpRetryOptions(attempts=1)` (= **no hidden retries**, because a retry can be billed twice).
  3. On failure, `classify_gemini_error` decides: *Is this the kind of failure another model could fix?* Rate limit / overload / model-not-found → yes, try the fallback **once**. Bad API key, project-wide daily quota, timeout, unknown error → **no**.
  4. A failed model gets a cooldown (5 s – 24 h, from the error's retry hint); a success clears it.
- **Output:** `LlmResult(text, usage)`; `usage` has input/output/cached/thinking/total tokens, the model used, and whether it was the fallback.
- **Errors:** an `AiError` with a safe public code, never Google's raw message: `PROVIDER_RATE_LIMITED` (429), `PROVIDER_QUOTA_EXHAUSTED` (429), `PROVIDER_UNAVAILABLE` / `AI_UNAVAILABLE` (503), `PROVIDER_TIMEOUT` (504), `PROVIDER_AUTH_ERROR` / `PROVIDER_NOT_CONFIGURED` (503), `PROVIDER_ERROR` (503). Each has `dispatched: true/false`: *"may Google already have been called?"* (explained in §9).

**Why at most two attempts?** Every attempt can cost money and time. "Primary then one fallback" is bounded; a retry loop is not. (Test: `test_both_models_failing_gives_ai_unavailable_after_exactly_two_calls`.)

### The prompt (`prompts/coach_chat.py`)

`build_prompt(message, context, history, memories)` returns **one big string**: the coach's rules and the user's data, then memories, then the last 6 chat turns, then the question. It is a **line-for-line port of the Node prompt**, deliberately. During a migration you change *one thing at a time*: if answers change and you changed language *and* wording, you cannot tell which caused it.

To make sure the port is exact, both languages are tested against the **same golden files** that Node rendered (`ai-backend/tests/fixtures/coach_chat/*.prompt.golden.txt`):

- Python: `tests/test_coach_chat_prompt.py`
- Node: `backend/tests/unit/coach/coach-chat-prompt-parity.test.ts`

If anyone changes one prompt without the other, a test fails. (I checked this by breaking one word on purpose; the test failed as it should.)

Tiny trap handled in `js_num`: JavaScript prints `72` for `72.0`, Python prints `72.0`. Without `js_num`, the Python prompt would say "Height: 175.0 cm" and differ from Node.

### Parsing the reply (`coach/parsing.py`)

`parse_coach_output(raw_text, has_memories)`:
- **Input:** Gemini's text, e.g. ```` ```json\n{"text":"...","followUps":[...]}\n``` ````
- **Processing:** strip the code fence → `json.loads` → if it is an object whose `text` is a string, build a structured result; otherwise use the raw text as the answer with `sources=["OnusFit Coach Engine"]`. If memories were supplied, add `"AI Memory"` to `sources` (same as Node).
- **Output:** `(CoachChatResult, outcome)` where outcome is `"ok"` or `"unstructured"`.
- **Errors:** none raised: bad JSON is an expected case, handled by falling back. The `outcome` flag is **new**: Node did this silently; now the failure is visible and can be counted later.

---

## 6. How Node talks to Python (`backend/src/shared/ai/python-ai-client.ts`)

`PythonAiClient.postJson(request)` (line ~196):

- **Input:** `{ path, scope, userId, requestId, body, timeoutMs }`
- **Processing:** (1) sign a token (§7); (2) `fetch` the URL with headers `Authorization: Bearer <token>`, `X-Request-Id`, JSON body, and `signal: AbortSignal.timeout(timeoutMs)`; (3) if the HTTP status is not 2xx, convert Python's JSON error into a typed `PythonAiError`.
- **Output:** the parsed JSON body (type `unknown`: it is *not trusted yet*; the adapter validates it with zod).
- **Errors:** always a `PythonAiError` with:
  - `kind`: `unreachable`, `timeout`, `auth`, `misconfigured`, `invalid_request`, `invalid_response`, `server_error`, or one of the Gemini-related `provider_*` kinds;
  - `dispatched`: may Gemini have been called?
  - `fallbackEligible`: is it safe for Node to answer instead?

**"Connection refused"** means Python was never reached → `dispatched: false`. **A timeout** means Python might still be calling Gemini → `dispatched: true`. The code checks `error.cause.code` (`ECONNREFUSED`, `ENOTFOUND`, ...) to tell them apart.

`PythonCoachChatService` (`python-coach-chat-service.ts`) is where coaching logic lives:

- `generateCoachResponse(message, context, history, memories, options?)`: **Input** the same arguments Node's own service takes, so the use case cannot tell the difference. **Output** a `CoachResponse`. **Errors** an `AppError` (the same public codes the Node path raises) or whatever the Node fallback throws.
- `callPython(...)`: builds the body `{message, context, history, memories, model:{primary,fallback}, deadlineMs}`; **validates Python's reply** with a zod schema (`pythonChatResponseSchema`): never trust data from another process; records usage; maps to the mobile-compatible shape (no `medicalNote`/`blocks` keys when Python sent `null`, exactly like the Node implementation).

---

## 7. How internal authentication works

Problem: the Python service must only obey Node. Anyone who can reach its URL could otherwise burn your Gemini budget.

Solution: **a short-lived signed token (JWT, HS256)** on every call.

**Node signs** (`python-ai-client.ts`):

```ts
new SignJWT({ scope: 'ai:coach:chat', rid: requestId })
  .setIssuer('onusfit-node-api').setAudience('onusfit-ai-backend')
  .setSubject(userId)            // who the request is for
  .setIssuedAt().setExpirationTime('30s').setJti(randomUUID())
  .sign(secretKey)               // HS256, shared secret (>= 32 chars)
```

**Python verifies** (`core/auth.py:verify_service_token`): **Input** the `Authorization` header + the endpoint's scope. **Processing:** secret configured and ≥32 chars? → `jwt.decode(..., algorithms=["HS256"], audience, issuer, leeway=5 s, require exp/iat/sub/jti/iss/aud)` → lifetime ≤ 60 s → `scope` equals this endpoint's scope → `jti` not seen before (replay cache). **Output** `ServiceClaims(user_id, request_id, jti)`. **Errors:** 401 `AUTH_INVALID_TOKEN` (one deliberately vague message: never tell a caller *why*), or 503 `AUTH_NOT_CONFIGURED` if the secret is missing/short (**fail closed**: with no secret, accept nothing).

What each check defends against:

| Check | Attack it stops |
|---|---|
| Signature with shared secret | Anyone but Node calling the service |
| `algorithms=["HS256"]` only | The classic "alg: none" trick (tested) |
| `aud` / `iss` | A token meant for another service |
| `exp` ≤ 30 s (and ≤ 60 s max) | A stolen token being useful later |
| `scope` | A token for one endpoint working on another |
| `jti` replay cache | Re-sending a captured token within its lifetime |
| `sub` = user id **only in the token** | A client claiming to be someone else in the body (body `userId` is rejected by Pydantic) |

The shared secret lives in two places that must match: `AI_BACKEND_SERVICE_SECRET` (Node) and `AI_SERVICE_JWT_SECRET` (Python). It is never sent to the phone, never logged.

---

## 8. How quota and conversation storage stay in Node

Nothing about them moved. Look at `ChatWithCoachUseCase` (unchanged): it reserves the quota **before** anything else and persists messages **around** the AI call. The Python adapter is just a replacement for "the thing that produces the reply text".

That is why these are true by construction, and each is tested in `coach-chat-python-integration.test.ts`:

| Guarantee | How it holds | Test |
|---|---|---|
| Exactly one quota unit per chat request, even when Python fails and Node answers | The gate runs once, outside the adapter; the adapter never touches quota | "Python down: … STILL exactly 1 quota unit and 2 stored messages" |
| Exactly one user message and one assistant message saved | The use case saves them once; the adapter does not write | same |
| Quota refunded if nothing reached any AI provider | Python unreachable ⇒ adapter does **not** call `markAiRequestDispatched()` ⇒ gate refunds if Node also fails early | "Python unreachable AND Node fails before reaching Gemini: refunded" |
| Quota kept if Gemini was (maybe) called | Adapter marks dispatched when Python was reached | "Gemini rate limit reported by Python: … unit stays consumed" |
| Disabled feature ⇒ Python never called | Gate throws first | "does not touch quota when the feature is disabled" |
| Memory consent unchanged | Node still decides which memories to load (`getActiveMemoriesForContext`); Python only sees what Node sends and never reads the database | "sends the memories Node selected … to Python" |

Python-served calls are also written to `gemini_usage_events` (via `GeminiRuntimeService.recordExternalUsage`) so your admin cost dashboard stays complete.

---

## 9. Feature flag and fallback

### The flag

`backend/src/config/env.ts` (line ~71): `COACH_CHAT_BACKEND` is `NODE_GEMINI` unless you set `PYTHON_GEMINI`. A typo like `PYTHON` **stops the server at startup** with a clear message instead of silently using Node. In Python mode, a missing URL or a secret shorter than 32 characters also stops startup (`aiBackendIssues`).

`backend/src/container.ts` (line ~199): the Python client and the `wrapChatService` wrapper are created **only** when the flag is `PYTHON_GEMINI`. In the default mode, the program is wired exactly as before.

### The fallback decision (`PythonCoachChatService.generateCoachResponse`)

```
call Python once
  success                         → use Python's answer
  failure → is it a PYTHON problem (could Node safely answer instead)?
      yes: unreachable, timeout, bad token, Python misconfigured,
           contract mismatch, bad response, Python 5xx
           → if enough time budget remains (>= 3 s): call Node Gemini ONCE with the remaining time
           → otherwise: return a safe 503
      no:  Gemini itself said "rate limited / quota / overloaded / timeout"
           (Python already tried its own backup model)
           → do NOT call Gemini again from Node; return the matching error
```

Key numbers (`python-coach-chat-service.ts`):

- Total budget **27 s** (mobile gives up at 30 s).
- Python HTTP timeout default **15 s** (`AI_BACKEND_TIMEOUT_MS`).
- Node's fallback gets `min(20 s, time left)`; with less than **3 s** left it is skipped.
- Python's own Gemini deadline is **1.5 s shorter** than the HTTP timeout so Python can answer "I timed out" itself.

**What is `dispatched` for?** The quota gate refunds a unit only if the AI provider was **never** called. "Python unreachable" proves nothing was sent. "Python timed out" proves nothing, so we assume Gemini may have been billed. This keeps the existing billing rule intact.

**Known trade-off (honest):** if Python times out while still talking to Gemini, and Node then falls back, Google may bill two calls for one quota unit. This is rare and bounded (one extra call).

---

## 10. Function reference: Input → Processing → Output → Errors

| Function | Input | Processing | Output | Errors |
|---|---|---|---|---|
| `api/coach_chat.py:coach_chat` | HTTP body, auth header, `X-Request-Id` | FastAPI validates + authenticates, then calls `generate_coach_reply` | `CoachChatResponse` JSON | 401/503 auth, 422 validation, any `AiError` |
| `coach/chat.py:generate_coach_reply` | validated request, an LLM object, trace id | `build_prompt` → `llm.generate_text` → `parse_coach_output` → build response; logs **metadata only** | `CoachChatResponse` | propagates `AiError` from the LLM layer |
| `prompts/coach_chat.py:build_prompt` | message, context, history, memories | system rules + data + memories + last 6 turns + question | one prompt string | none |
| `llm/gemini.py:GeminiClient.generate_text` | prompt, models, deadline | plan models, call with timeout, fallback once, cooldown | `LlmResult` | `AiError` (§5) |
| `llm/errors.py:classify_gemini_error` | any exception | reads HTTP code/status/details; extracts retry hint | `ClassifiedError(kind, is_retryable, is_project_wide, retry_after)` | never raises |
| `core/auth.py:verify_service_token` | header, expected scope | JWT checks (§7) | `ServiceClaims` | `AiError` 401/503 |
| `core/errors.py:handle_validation_error` | Pydantic error | list field + problem type only | 422 JSON | none |
| `PythonAiClient.postJson` | request descriptor | sign → fetch → classify | parsed JSON (unknown) | `PythonAiError` |
| `PythonCoachChatService.generateCoachResponse` | same as Node's service | Python → validate → map; or bounded fallback | `CoachResponse` | `AppError` |
| `GeminiRuntimeService.recordExternalUsage` | usage event | compute cost from the pricing table, insert ledger row | `void` | rejects if DB write fails (adapter ignores it) |
| `env.ts:aiBackendIssues` | parsed env | require URL + 32-char secret in Python mode | list of problems | startup stops if non-empty |

---

## 11. How to run and test locally

### One-time setup

```bash
cd ai-backend
uv venv .venv                                  # creates ai-backend/.venv (gitignored)
uv pip install --python .venv/bin/python -e ".[dev]"
cp .env.example .env                           # then fill in the two values (see below)
```

### Start Python

```bash
cd ai-backend
set -a; source .env; set +a
.venv/bin/uvicorn onusfit_ai.main:app --host 127.0.0.1 --port 8000
curl http://127.0.0.1:8000/health/live        # -> {"status":"ok",...}
```

### Enable Python mode in Node (local only)

Add to `backend/.env` (never commit it):

```
COACH_CHAT_BACKEND=PYTHON_GEMINI
AI_BACKEND_URL=http://127.0.0.1:8000
AI_BACKEND_SERVICE_SECRET=<the same 32+ char value as AI_SERVICE_JWT_SECRET>
```

Restart Node. To go back: remove the line or set `NODE_GEMINI`. No data migration either way.

### Run all the tests

```bash
# Python (59 tests) + lint + types
cd ai-backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check . && .venv/bin/mypy

# Node (whole suite; includes the 70 new tests)
cd backend && npm run typecheck && npm test
```

New Node tests: `tests/unit/ai/python-ai-client.test.ts`, `tests/unit/coach/python-coach-chat-service.test.ts`, `coach-chat-python-integration.test.ts`, `coach-chat-prompt-parity.test.ts`, `tests/unit/config/ai-backend-env.test.ts`.
New Python tests: `tests/test_auth.py`, `test_coach_chat_api.py`, `test_coach_chat_parsing.py`, `test_coach_chat_prompt.py`, `test_gemini_client.py`, `test_health.py`.

### Try the failure behavior yourself

1. Stop Python, send a coach message in Python mode → you still get an answer (Node fallback). Node logs a `Python coach chat failed` warning with `kind: "unreachable"`.
2. Start Python with a wrong `AI_SERVICE_JWT_SECRET` → Python answers 401 → Node falls back; no chat content is in either log.

---

## 12. What to study first

1. **Pydantic**: read `contracts/coach_chat.py` and `tests/test_coach_chat_api.py::test_invalid_requests_are_rejected_without_echoing_input`. Try adding a field and watch a test fail.
2. **FastAPI `Depends`**: read `api/coach_chat.py` and `core/auth.py:require_scope`. Why can a test replace `get_llm`?
3. **Async Python**: `llm/gemini.py:_call` (`asyncio.timeout`) and `tests/test_gemini_client.py::test_timeout_is_not_retried_and_maps_to_504`.
4. **JWT basics** (header.payload.signature, HS256, `exp`, `aud`) then `tests/test_auth.py`.
5. **Prompt parity as a testing technique**: golden files shared by two languages.
6. **The "dispatched" idea** (§9) — a good interview story about billing-safe fallbacks.

### Interview explanation (30 seconds)

"I moved LLM inference for our chat feature into a FastAPI service without touching the product API. Node stays the system of record — auth, quota, persistence — and calls Python with a 30-second signed token. Python builds the prompt, calls Gemini with one fallback model and a total deadline, and returns validated JSON. It's behind a config flag that defaults off, falls back to the original Node path only when Python itself is the problem, and a cross-language golden-file test proves the prompts are identical. I verified the real Node→Python→Gemini path end to end."

---

## 13. Known gaps (so you are not surprised)

- **Not deployed, not enabled by default.** Production has no Python service yet; hosting, private networking and secrets are undecided.
- **Gemini key:** Python reads its own `GEMINI_API_KEY`. Keys saved in the Admin console are used only by the Node path (open decision O1 in `docs/ai/PYTHON_MIGRATION_READINESS.md`). Model *names* do come from the admin settings.
- **Failures are not in the usage table:** only successful Python calls are recorded; Python-side failures appear in logs only.
- **Request id:** Node generates a `chat-…` id for each Python call; it is not yet the HTTP request id.
- **Replay cache and cooldown are in-memory**, fine for one Python instance, not for several.
- **JS vs Python formatting edge cases:** numbers use `js_num`; water litres use `:.1f` (can differ from JS `toFixed(1)` only at exact rounding ties). Covered by the golden files for the tested data.
- **Streaming, tools, memory writing, RAG, agents:** deliberately not included.
