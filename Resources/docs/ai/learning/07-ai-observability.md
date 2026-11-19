# Learning guide 07 — AI observability: structured logs, correlation ids, error categories

**Branch:** `development`. **Builds on:** [02 Python-only architecture](02-python-only-ai-architecture.md) and [06 coach insights](06-python-coach-insights.md). After Phases 7–8 every AI feature runs in Python and Node keeps auth, quota, cache and the database. That split has a cost: **one user request now crosses two services**, and before this change nothing joined their logs. This guide is about seeing what happened, without ever logging what the user said.

**Nothing user-visible changed.** Same routes, same responses, same quota and refund rules, same cache, same prompts and models. Only log lines, one request header and an optional logger argument were added. No database change, no new dependency, no paid service.

---

## 1. What already existed (so nothing was rebuilt)

| Capability | Where | Notes |
|---|---|---|
| JSON logs with a redact list | Node: `shared/logging/logger.ts` (pino) | Reused and extended. |
| One access line per HTTP request, request id echoed as `X-Request-Id` | Node: `middleware/request-context.ts` (pino-http) | The id is also `requestId` in the error envelope. Reused. |
| Usage ledger: tokens, cost, duration, per call | table `gemini_usage_events`, admin screens | **Unchanged.** Written only for *successful* Python calls. |
| Plain-text metadata line per AI call + key/JWT masking | Python: `core/logging.py` | Replaced by JSON lines; the masking stays as the last line of defence. |
| Failure kinds (`PythonAiErrorKind`), `dispatched` flag | Node: `shared/ai/python-ai-client.ts` | Reused as the input of the new classifier. |

**Gaps found:** the HTTP request id and the AI call id were unrelated (`chat-…` is made up inside each adapter), so a Node line and a Python line could not be joined; Python wrote plain text and logged nothing for auth failures, validation failures or the first (failed) Gemini attempt except one warning; coach insights **cache hits and deterministic fallbacks were silent**, and a fallback is itself cached for 10 minutes, so it could be served again with no trace; there was no common vocabulary for "why did it fail"; Node's log carried only total tokens.

## 2. The design in one picture

```
Phone ── X-Request-Id? ──► Node (pino-http: req.id = correlationId)
                             │  bindRequestCorrelation (AsyncLocalStorage)
                             │  … use case … callPythonAi
                             │      X-Correlation-Id: <req.id>     ← new
                             │      X-Request-Id:     <aiRequestId> ← unchanged (ledger id, token `rid`)
                             ▼
                          Python (RequestObservabilityMiddleware → context vars)
                             every line carries correlationId, aiRequestId, feature
```

**Two ids, one name each, everywhere (headers, code, logs, docs):**

- `correlationId` — the HTTP request id. Equal to pino-http's `req.id`, the `X-Request-Id` the app gets back and `requestId` in the error envelope: a user can quote one id and you find everything. Absent outside HTTP.
- `aiRequestId` — the id of one AI call. It is the usage-ledger `request_id`, the service token's `rid` claim and Python's `traceId`. **Unchanged on purpose:** `pino-http` reuses a client's `X-Request-Id`, so using it as the ledger id could collide when a client retries.

Node reads the id from AsyncLocalStorage (the same pattern as the existing AI usage context), so no use case or port signature changed. Python binds the ids to `contextvars` in one pure ASGI middleware, so *every* line written while handling a request has them, including lines from deep inside the Gemini client.

## 3. Events (the same field names in both services)

| Event | Written by | When |
|---|---|---|
| `ai.call.completed` | Node `callPythonAi`, Python use case | Python/Gemini answered with a valid reply |
| `ai.call.failed` | Node `callPythonAi` | the call failed (any reason) |
| `ai.request.failed` | Python error handlers | Python refused or failed a request: auth, validation, Gemini errors |
| `ai.gemini.attempt_failed`, `ai.gemini.model_skipped` | Python Gemini client | a model attempt failed (and whether the backup is tried next); a cooling-down primary was skipped |
| `ai.cache` | Node insights use case | `cache` = `hit` · `joined_inflight` · `miss` (+`reason`) · `stored` (+`servedFrom`) |
| `ai.deterministic_fallback` | Node insights adapter | `reason` = `insufficient_data` · `ai_call_failed` · `unusable_ai_output` |
| `http.request`, `http.unhandled_error` | Python middleware | one access line (health checks skipped); an uncaught exception, by **type only** |

Key fields of `ai.call.completed`: `feature`, `endpoint` (Node), `correlationId`, `aiRequestId`, `success`, `outcome`, `errorCategory`, `model`, `modelFallbackUsed`, `durationMs` (Node round trip) and `geminiDurationMs`, `inputTokens`, `outputTokens`, `cachedTokens`, `thinkingTokens`, `totalTokens`. `ai.call.failed` has `errorCategory`, `errorKind`, `errorCode`, `httpStatus`, `retryAfterSeconds`, `dispatched`, `durationMs`.

`success` is `false` when the model answered but its output was unusable (`unusable`, `parse_failed`, `unstructured`). `no_food` is a valid answer, not a failure.

### Error categories (one vocabulary, same words in Node and Python)

| Category | Means | Typical cause |
|---|---|---|
| `gemini_timeout` | Gemini did not answer in time | slow model |
| `gemini_rate_limited` | 429 per minute | traffic burst |
| `gemini_quota_exhausted` | daily quota used | needs billing/quota action |
| `gemini_unavailable` | 503, or both models failed | Google overload |
| `gemini_auth` | Gemini rejected the key, or Python has none | wrong/missing `GEMINI_API_KEY` |
| `gemini_error` | any other Gemini failure | |
| `python_unavailable` | Python unreachable or answered 502/503/504 | down, restarting, **cold start** |
| `python_timeout` | Python did not answer before Node's deadline | cold start, slow Gemini |
| `auth_failure` | service token rejected, or no secret in Python | secrets differ between the two services |
| `invalid_ai_response` | reply broke the contract, or output unusable | model returned prose |
| `invalid_request` | Python rejected Node's body | contract drift between deploys |
| `internal_error` | anything else (a 500) | a bug |

The mapping is a pure function (`classifyPythonAiError`, `category_for_error_code`) and is tested for every kind and code.

## 4. Decisions worth understanding

1. **A cached fallback must be recognisable.** `buildDeterministicInsights` returns a plain object that is cached like any other. Adding a field would change the public response, so the adapter records the answer's origin in a `WeakMap` (`tagResponseSource`) and the use case reads it on a cache hit → `servedFrom: ai | deterministic_fallback | welcome`. The cache keys, TTL, de-duplication and stored values are untouched.
2. **The category must reach the fallback event, but the public error must not change.** Same technique: `tagAiErrorCategory` remembers the category of the thrown `AppError` out of band.
3. **Only metadata, by construction.** Events are built by typed functions that accept numbers, booleans and closed lists. Error *text* (Python's, Gemini's) is never logged, only the code and category. The user id is not logged at all (the ledger already attributes tokens to users).
4. **Python: three layers.** `log_event` is the only way to write an event; `clean_fields` keeps primitives only, truncates text and masks fields with sensitive *names* (exact names, so `totalTokens` and `promptVersion` stay); `redact` masks anything shaped like a Google key, bearer token or JWT in the final line. JSON also escapes newlines, so a user cannot forge a log line.
5. **Node: redact paths are the second line of defence** (`apiKey`, `authorization`, `prompt`, `context`, `base64`, `email`, …, top level and one level down).
6. **Unhandled Python errors are logged by type and re-raised**, so Starlette's own 500 reply (what Node's client already handles) is unchanged. I deliberately did *not* add a JSON 500 handler: that would change a response.
7. **Failures are not written to the ledger.** Doing so would change usage-recording semantics (and admin numbers), which this phase must not do. Failures live in the logs.
8. **Where the correlation middleware sits.** It is registered after `express.json()`. I assumed body parsers lose AsyncLocalStorage context and wrote that in a comment; **I then tested it and it is not true on this stack** (Node 22, Express 5: both orders work). The comment was corrected. Keeping it after body parsing costs nothing and cannot depend on that detail, and the tests fail if the binding is removed.

## 5. Using the logs in Render

Render's log search is a text search (field-level JSON filtering was not verified), so search for literal text from the compact JSON:

| Question | Search for |
|---|---|
| Everything about one user request | the id from the app's `X-Request-Id` (both services) |
| Why are insights "generic"? | `ai.deterministic_fallback` (see `reason` and `errorCategory`) |
| Is a *cached* answer a fallback? | `"servedFrom":"deterministic_fallback"` (on `ai.cache` events with `"cache":"hit"`; the `stored` event shows when it entered the cache) |
| Is Python down or just asleep? | `"errorCategory":"python_unavailable"` / `python_timeout` (free tier: cold start) |
| Are we out of Gemini quota? | `gemini_quota_exhausted` |
| Do the two services share a secret? | `auth_failure` |
| Is the backup model carrying traffic? | `"modelFallbackUsed":true` or `ai.gemini.model_skipped` |

Set `LOG_FORMAT=text` on the Python service for readable local output; the default is `json`.

## 6. What was proven (and how)

| Requirement | Evidence |
|---|---|
| Correlation id propagation | through the **real `createApp` stack** with a JSON body: the client's `X-Request-Id` arrives at a fake Python as `X-Correlation-Id`; generated and unsafe ids; six concurrent requests stay apart; the test fails when the binding is removed (checked). Python side: ids on every line, not leaking into the next request, unsafe ids ignored. |
| Structured metadata | exact-shape assertions on every event; all five Python features log the same fields |
| Redaction | sentinel strings in messages, contexts, images, audio, e-mail, plus a fake Google key, bearer token and JWT inside error text, across success, unusable, provider failure, bad token and invalid body on **all five endpoints**. **Mutation-checked:** two deliberate leaks were each caught. |
| Error classification | every kind/code, over real HTTP for Node (including a non-JSON 502 and a hard timeout) and through the real Gemini client with a fake SDK for Python |
| Cache and fallback events | miss → call → stored; hit; fallback → stored → *hit that says fallback*; unusable output; no-data welcome; in-flight join; force refresh; TTL expiry |
| Behavior preserved | every existing Node test (1537) and every existing Python test passes unchanged, **except two Python startup/logging tests that asserted the old plain-text log line** and were updated to the new format. Quota/refund (`dispatched`), ledger writes, public error shape and the 500 reply are asserted again |

Totals: Node 1537 → **1629** tests, Python 488 → **571**; typecheck, build, Ruff and mypy clean; ESLint 0 errors on every file changed (older lint errors elsewhere in `backend/` are untouched and not counted here).

## 7. Verification status

Run: all the checks above on the development machine, with fake Gemini and a fake Python server. **Not run:** real Gemini, a real Render deploy, a phone, the PostgreSQL integration tests (no Docker here). The sample lines in the Phase 9 report come from real runs of the code, not hand-written.

## 8. Known gaps

- **No metrics and no alerts.** You can search logs; nothing counts or notifies. The next step is a log-based alert on `ai.deterministic_fallback` rate and `errorCategory` (Render notifications or a free uptime check), not a new service.
- **Failures are only in logs**, not in `gemini_usage_events` (see decision 7).
- **Uvicorn's own access and traceback lines are not structured** and are not correlated; its traceback for an unhandled exception can contain the exception text. The service's own lines never do.
- **Cache events are per Node instance** (the cache is in memory), so with several instances a "miss" can be another instance's hit.
- **Log retention** is whatever Render plan keeps; nothing is exported.
- **Speech transcription** is recorded under `feature=coach_chat` on the Node side (that is how the ledger labels it); the `endpoint` field tells it apart. Python logs it as `transcribe`.
- No tracing, evals or prompt/response capture (the last is intentional: it is a privacy decision).

## 9. What to study

1. **Correlation beats volume.** One id that appears in every line of both services is worth more than many detailed lines.
2. **Log the category, not the message.** Provider text is where secrets and user content leak.
3. **Make the safe thing the only thing.** Typed event builders plus redaction plus tests that plant sentinels.
4. **Verify your assumptions.** I wrote a confident comment about a Node quirk; a ten-second experiment showed it was wrong.
5. **Observe without changing behavior.** Out-of-band tags (WeakMaps) let logs know things the public API must not.

**Interview line:** "I made a two-service AI path debuggable without touching its behavior: one correlation id across Node and Python, a single error vocabulary, and events that tell a cached fallback from a fresh AI answer. Privacy is enforced by construction and by tests that plant sentinel strings and mutation-check that a deliberate leak is caught."
