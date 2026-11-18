# Learning guide 03 — Voice meal parsing moved to Python

**Branch:** `development`. **Builds on:** [02 Python-only architecture](02-python-only-ai-architecture.md). Same pattern as coach chat, applied to a second feature, and this time with a **characterization-first** migration: the old behavior was recorded as test data *before* the old code was deleted.

---

## 1. What the feature does

The user types or speaks what they ate ("rendu dosai sambar konjam chutney"). The app calls `POST /api/v1/nutrition/voice-meal/parse`; the API returns a list of foods with estimated calories and macros. It saves nothing: logging the meal is a separate request from the app.

**Public contract: unchanged** (`parseVoiceMealRequest` / `voiceMealResponseSchema` in `nutrition/interface/voice-meal.schemas.ts`).

## 2. Who owns what now

| Concern | Owner |
|---|---|
| Login, request validation (transcript or audio required, 15 MB audio cap, allowed audio formats) | Node (`ParseVoiceMealUseCase`) |
| Feature switch, burst limit, daily quota, refund-or-consume | Node (`AiUsageGate`) |
| Which Gemini models (admin console) | Node → sent to Python each call |
| **Prompt, Gemini call (text or audio), model fallback, parsing into food items, number rounding** | **Python** |
| Token/cost ledger | Python reports, Node writes (`feature = voice_meal`) |

Removed from Node: `gemini-voice-meal-service.ts` (prompt + parser). Still in Node Gemini: meal photo, transcription, coach insights, admin "test key".

## 3. Request flow

```
Phone → Node POST /nutrition/voice-meal/parse
  → ParseVoiceMealUseCase: validate → AiUsageGate (reserve 1 unit)
  → PythonVoiceMealService.parseVoiceMeal
  → POST /internal/v1/ai/meals/parse-voice  (signed 30 s token, scope ai:meals:voice)
  → Python: verify token → validate body → build prompt → Gemini (text, or clip + prompt) → parse → JSON
  → Node: validate reply → record usage → same JSON shape as before → phone
```

## 4. Errors, timeouts, quota

Same table as guide 02, with one voice-specific rule: **the mobile app gives up after 25 s** (`voice-meal-api.ts`), so Node caps its HTTP timeout at **22 s** (`VOICE_MEAL_MAX_TIMEOUT_MS`) and Python's Gemini deadline is 20.5 s. (Before the migration, a primary timeout plus a fallback attempt could take 40 s, longer than the app waited.)

| Situation | API result | Quota |
|---|---|---|
| Python down / bad token / Python misconfigured | `503 SERVICE_UNAVAILABLE` "Voice meal parsing is temporarily unavailable…" | refunded |
| Timeout | `503` "AI request timed out…" | consumed |
| Gemini rate limit / daily quota | `429 RATE_LIMITED` / `AI_QUOTA_EXCEEDED` | consumed |
| Model replied with unusable text | **`200`** with `items: []` and "not formatted correctly" (unchanged behavior) | consumed |

The last row is deliberate: changing it would change what the app shows. Python now labels it `outcome: "parse_failed"` (also `ok`, `no_food`) so the silent failure becomes countable in logs and a future dashboard.

## 5. The method: characterization-first

1. **Record** the old Node behavior as data: a throwaway script ran the *real* Node prompt builder and parser over 5 prompt inputs and 22 raw model replies (valid, fenced, prose, NaN, null items, string numbers…) and saved the results in `ai-backend/tests/fixtures/voice_meal/{prompt_cases,parse_cases}.json`.
2. **Port** the logic to Python.
3. **Prove** equality: `tests/test_voice_meal_prompt.py` and `tests/test_voice_meal_parsing.py` must reproduce every recorded result.
4. **Then delete** the Node code.

This is the "golden master" technique. It caught real language differences, all handled in `core/js_compat.py`:

| JavaScript behavior the app depended on | Python default | Helper |
|---|---|---|
| `Math.round(2.5) === 3` | `round(2.5) == 2` (banker's rounding) | `js_round` |
| `Number("abc") \|\| 0` → `0`; `Number("260")` → `260` | `float("abc")` raises | `js_number`, `number_or` |
| `reduce` adds floats left-to-right | `sum()` (3.12) uses compensated summation, so `0.1+0.2+0.3` can differ | explicit loop in `meals/parsing.py` |
| `[]` and `{}` are truthy | falsy | `js_truthy`, `js_or` |
| `String(true)` → `"true"`; `String(5.0)` → `"5"` | `"True"`; `"5.0"` | `js_string`, `js_num` |
| `JSON.parse('{"a":NaN}')` throws | `json.loads` accepts `NaN` | `parse_constant` rejects it |

## 6. Files

**Python (`ai-backend/src/onusfit_ai/`)**

- `prompts/voice_meal.py` — **`build_prompt(transcript, lang, meal_type)`**. *Input:* optional transcript, language hint, meal type. *Processing:* the 50-line prompt (English/Tamil/Tanglish quantity rules, JSON schema) with a `CONTEXT:` block listing only the hints that are non-empty. Generated from the Node source, then verified. *Output:* one string (same for the text and audio paths; the clip is sent separately). *Errors:* none. *Tests:* `test_voice_meal_prompt.py` (5 Node-rendered goldens).
- `contracts/voice_meal.py` — **`ParseVoiceMealRequest`** (transcript ≤ 2000 chars, optional audio `{mimeType, base64}`, lang, mealType, models, deadline; *at least a transcript or audio*, no unknown fields, so no `userId`) and **`ParseVoiceMealResponse`** (`outcome`, `result`, `usage`, `traceId`). *Errors:* Pydantic → 422 listing field names only. *Tests:* `test_voice_meal_api.py::test_invalid_requests_are_rejected_without_echoing_input`.
- `contracts/common.py` — `ModelSelection`, `Usage`, shared by chat and voice (moved out of the chat contract).
- `meals/parsing.py` — **`parse_voice_meal_output(raw, fallback_transcript)`**. *Input:* Gemini's raw text and the user's typed transcript. *Processing:* strip code fences → JSON → read items with JavaScript-style coercion and rounding → totals with one decimal → `ok` / `no_food` / `parse_failed`. *Output:* `(VoiceMealResult, outcome)`. *Errors:* never raises (bad JSON, null items, NaN → `parse_failed` result). *Tests:* `test_voice_meal_parsing.py` (22 goldens + outcome flags + rounding/summing/id tests).
- `meals/voice.py` — **`parse_voice_meal(request, llm, trace_id)`**. *Input:* validated request, an LLM object. *Processing:* build prompt → decode audio (raw base64 or `data:` URL) → `llm.generate_text(..., media=clip)` → parse → map usage; logs metadata only. *Output:* `ParseVoiceMealResponse`. *Errors:* invalid base64 → 422 (`dispatched:false`, Gemini never called); LLM errors propagate as `AiError`. *Tests:* `test_voice_meal_api.py` (text, audio, data URL, both, bad base64, no content in logs).
- `api/voice_meal.py` — **`parse_voice`**: `POST /internal/v1/ai/meals/parse-voice`, scope `ai:meals:voice` (a chat token is refused). *Tests:* `test_voice_meal_api.py::test_a_chat_scoped_token_cannot_call_the_voice_endpoint`.
- `llm/gemini.py` — new `MediaInput` and a `media` parameter: sends `[clip, prompt]` (same order as the old Node client) to the primary **and** the fallback model. *Tests:* `test_gemini_client.py` (audio order, audio on fallback).
- `core/js_compat.py` — the table in §5. *Tests:* `test_js_compat.py`.

**Node (`backend/src/`)**

- `modules/nutrition/infrastructure/python-voice-meal-service.ts` — **`PythonVoiceMealService`** implements the existing `VoiceMealParser` port. *Input:* transcript/audio/lang/mealType. *Processing:* get admin model names → signed POST (HTTP timeout ≤ 22 s) → zod-validate reply → record usage → map to the public result (null → absent key). *Output:* `VoiceMealParseResult`. *Errors:* one `AppError` via `toPublicAiError`; `markAiRequestDispatched()` only if Gemini may have been called. *Tests:* `python-voice-meal-service.test.ts`, `voice-meal-python-integration.test.ts`.
- `shared/ai/python-ai-errors.ts` — **`toPublicAiError`**: the failure-to-API-error table, now shared by chat and voice.
- `modules/nutrition/index.ts`, `container.ts` — voice parser injected as `voiceMealParser`; the Python client is built once and shared.
- Deleted: `gemini-voice-meal-service.ts`.

## 7. Run and test

```bash
# Python (same service as before; the new endpoint is mounted automatically)
cd ai-backend && set -a; source .env; set +a
.venv/bin/uvicorn onusfit_ai.main:app --host 127.0.0.1 --port 8000

# Tests
cd ai-backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check . && .venv/bin/mypy
cd backend    && npm run typecheck && npm test && npm run build
```

Requirements are unchanged: `AI_BACKEND_URL` and `AI_BACKEND_SERVICE_SECRET` in `backend/.env`, `AI_SERVICE_JWT_SECRET` and `GEMINI_API_KEY` in `ai-backend/.env`. The voice meal model comes from the admin console's "Voice meal" model setting.

## 8. What to study

1. **Golden-master / characterization testing** for migrations; read `test_voice_meal_parsing.py` next to `parse_cases.json`.
2. **Cross-language numeric semantics** (§5): why "same logic" in two languages is not the same result.
3. **Multimodal input**: how the audio clip travels (base64 in JSON → bytes → `Part.from_bytes`), and why the clip goes *before* the prompt.
4. **Outcome flags vs silent fallbacks**: preserving legacy behavior while making failure measurable.
5. **Token scopes**: one token per endpoint, so a leaked chat token cannot call voice parsing.

**Interview line:** "I migrated a multilingual voice-to-nutrition parser without changing the public API. Before touching it I recorded the old prompt and 22 parser behaviors as golden fixtures, ported to Python, and proved byte-for-byte parity, including JavaScript rounding and float-summation quirks, before deleting the old code."

## 9. Known gaps

- The audio path is covered by tests with fakes; I had no real audio sample to run against live Gemini (the typed-transcript path was verified live).
- Python's Gemini attempt limit is 20 s for audio (Node used 25 s), bounded further by the 22 s HTTP cap.
- Only successful Python calls are written to the usage table.
- `unclearReason` that is a non-string truthy value is converted to text (Node passed the raw value through and would have failed response validation).
