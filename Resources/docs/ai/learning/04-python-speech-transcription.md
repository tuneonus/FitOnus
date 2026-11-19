# Learning guide 04 — Speech transcription moved to Python

**Branch:** `development`. **Builds on:** [02 Python-only architecture](02-python-only-ai-architecture.md) and [03 voice meal](03-voice-meal-python-migration.md). Same pattern, third feature, plus one clean-up that removes repeated code.

---

## 1. What the feature does

The voice coach records a clip on the phone (`audio/m4a`) and calls `POST /api/v1/coach/transcribe`. The API returns `{transcript, detectedLanguage}` (`en`, `ta` or `tanglish`). The text is then used as a normal chat message. Nothing is stored by this endpoint.

**Public contract: unchanged.** Request `{audio: {mimeType, base64}}`, response `{success, data: {transcript, detectedLanguage}, message}`.

## 2. A deliberate decision: no new quota gate

Unlike chat and voice meal, **transcription never had an AI quota gate** (no feature flag, no daily quota, no per-user burst limit). Only login and the coach route's rate limiter (`rateLimiters.aiCoach`) protect it. You asked to preserve that, so it is preserved: the migration adds no gate, and the tests prove Python is called with no quota context.

Consequence worth knowing: a logged-in user can still transcribe up to the rate limiter's budget without touching their daily AI quota. If you want that closed later, it is a small, separate change (a new quota action type needs a database setting, so it needs its own approval).

Because there is no gate, the adapter cannot read the user id from the gate's request context (that context does not exist here). `PythonSpeechTranscriber.transcribe(userId, audio)` takes the id **explicitly from the authenticated session** in the controller. It still goes only into the signed token, never into the request body.

## 3. Who owns what

| Concern | Owner |
|---|---|
| Login, route rate limiter, request validation (format, 15 MB cap) | Node |
| Which Gemini models (admin "coach" model setting, same as before) | Node → sent to Python |
| Audio decoding for Gemini, prompt, Gemini call, model fallback, reply parsing | **Python** |
| Token ledger | Python reports, Node writes (label `coach_chat`, as before, now attributed to the user instead of a null user) |

Removed from Node: `GeminiClient.transcribeAudio` (its prompt and parser). Still on Node Gemini at that time: meal photo (since moved, see guide 05) and coach insights.

## 4. Request flow

```
Phone → POST /api/v1/coach/transcribe {audio}
  → Node: authenticate → rate limiter → validate (format, ≤ 15 MB base64)
  → PythonSpeechTranscriber.transcribe(userId, audio)
  → POST /internal/v1/ai/speech/transcribe (signed 30 s token, scope ai:speech:transcribe)
  → Python: verify token → re-validate audio → decode → Gemini (clip + prompt) → parse
  → Node: validate reply → record usage → {transcript, detectedLanguage} → phone
```

## 5. Validation (both sides, on purpose)

Node (`coach.schemas.ts`, using `shared/ai/audio-input.ts`) and Python (`core/audio.py`, `contracts/common.py`) apply the **same rules**:

- MIME type must *contain* one of `m4a, mp4, aac, wav, webm, ogg, mpeg, 3gpp` (so `audio/x-m4a` and `audio/mp4; codecs=…` pass; `audio/flac`, `image/png`, `video/quicktime` do not). This is the rule voice meal always used, now shared.
- At most 15 MB of base64 text. (In the real app the global JSON body limit can answer `413` first; the schema cap is a second line of defense.)
- Python also rejects invalid base64 (`422`, Gemini never called) and accepts a `data:<mime>;base64,` prefix.

Why twice? Python never assumes its caller validated. A bug or a leaked token in Node must not let arbitrary payloads reach Gemini.

## 6. Errors, timeouts

Same mapping as chat and voice (`toPublicAiError`), with the message the app has always received for transcription: *"Unable to transcribe spoken audio right now. Please try again."*

| Situation | Result |
|---|---|
| Invalid format / too large / empty | `400 VALIDATION_FAILED` (Node), Python never called |
| Python down, wrong secret, Python misconfigured, bad reply | `503 SERVICE_UNAVAILABLE` + the message above |
| Timeout (Node → Python, or Gemini inside Python) | `503` "AI request timed out. Please try again." |
| Gemini rate limit / daily quota | `429 RATE_LIMITED` / `AI_QUOTA_EXCEEDED` |

Time budget: mobile waits **35 s**; Node's HTTP timeout is the configured value (default 25 s, max 28 s); Python's Gemini deadline is 1.5 s shorter. No retries: one call to Python, at most primary + one backup model inside Python.

## 7. Characterization-first (again)

Before deleting `transcribeAudio`, a throwaway script ran the real Node method over **21 raw model replies** (plain JSON, fenced, Tamil script, missing fields, numbers/booleans/arrays/objects as transcript, prose, empty string, `null`, `NaN`, truncated JSON…) and captured the 571-character prompt. These are `tests/fixtures/transcribe/{parse_cases.json,prompt.golden.txt}`. The Python port reproduces every one. Interesting Node behavior it preserves: a reply that is not JSON is **used as the transcript** (with language `en`); a JSON `null` reply becomes the text `"null"`.

## 8. Files

**Python (`ai-backend/src/onusfit_ai/`)**

- `prompts/transcribe.py` — **`build_prompt()`**. *Input:* none (the clip is the input). *Processing:* the fixed prompt (English/Tamil/Tanglish rules, "JSON only"), generated from the Node source. *Output:* string. *Errors:* none. *Tests:* `test_transcribe_prompt.py` (golden).
- `contracts/transcribe.py` — **`TranscribeRequest`** (`audio`, `model`, `deadlineMs`; no unknown fields, so no `userId`) and **`TranscribeResponse`** (`outcome: ok | unstructured`, `result`, `usage`, `traceId`). *Errors:* 422 listing field names, never values. *Tests:* `test_transcribe_api.py`.
- `contracts/common.py` — new **`AudioInput`** with the format validator and size cap, shared with voice meal.
- `core/audio.py` — **`is_supported_audio_mime`**, **`decode_audio_base64`**. *Errors:* invalid base64 → `AiError` 422, `dispatched=false`. *Tests:* `test_transcribe_api.py`, `test_voice_meal_api.py`.
- `speech/parsing.py` — **`parse_transcription(raw)`**. *Input:* Gemini's text. *Processing:* strip fences → strict JSON → `String(transcript || "").trim()`, `String(detectedLanguage || "en")`; if not JSON (or `null`), the whole text is the transcript. *Output:* `(result, outcome)`. *Errors:* never raises. *Tests:* `test_transcribe_parsing.py` (21 goldens + outcome flags).
- `speech/transcribe.py` — **`transcribe_audio(request, llm, trace_id)`**. *Processing:* decode audio → `llm.generate_text(prompt, media=clip)` → parse; logs metadata only (audio byte count, never content). *Output:* `TranscribeResponse`. *Errors:* propagates `AiError`. *Tests:* `test_transcribe_api.py` (success, data URL, formats, size limit, base64, scope, no-logging).
- `api/transcribe.py` — **`POST /internal/v1/ai/speech/transcribe`**, scope `ai:speech:transcribe` (chat and voice tokens are refused).
- `core/js_compat.py` — gained `strict_json_loads`, `js_prop`, `strip_code_fences`, now used by chat, voice and transcription parsers (one fence stripper instead of two).

**Node (`backend/src/`)**

- `modules/coach/infrastructure/python-speech-transcriber.ts` — **`PythonSpeechTranscriber`** implements the new `SpeechTranscriber` port. *Input:* `(userId, audio)`. *Output:* `{transcript, detectedLanguage}`. *Errors:* one `AppError`. *Tests:* `python-speech-transcriber.test.ts` (27 tests, including the real route and controller).
- `shared/ai/python-ai-call.ts` — **`callPythonAi`**: the part every adapter repeated (send once, mark dispatched, validate, record usage, map errors). Chat, voice meal and transcription now all use it; their existing tests passed unchanged.
- `shared/ai/audio-input.ts` — the shared format and size rules; the voice meal use case now uses it (same behavior and messages).
- `modules/coach/interface/coach.schemas.ts` — `transcribeAudioSchema` now checks format and size. `coach.controller.ts` — uses the transcriber and passes `actor.userId`.
- `container.ts`, `coach/index.ts` — wiring (`speechTranscriber` option).
- Deleted: `GeminiClient.transcribeAudio`, and its one old unit test.

## 9. Run and test

```bash
cd ai-backend && set -a; source .env; set +a
.venv/bin/uvicorn onusfit_ai.main:app --host 127.0.0.1 --port 8000   # the endpoint is mounted automatically

cd ai-backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check . && .venv/bin/mypy
cd backend    && npm run typecheck && npm test && npm run build
```

To try it for real you need an `.m4a` of your own voice (the app records the same format). Do not commit audio files.

## 10. What to study

1. **Where to validate** — defense in depth: Node for the user's benefit (clear 400s), Python because it must not trust its caller.
2. **Preserving a "missing" control** — why migrating a feature must not silently add or remove policy; the explicit-`userId` consequence of having no gate.
3. **Removing repetition only when tests exist** — `callPythonAi`: three adapters collapsed into one helper, guarded by 100+ tests.
4. **Audio as model input** — base64 → bytes → a clip `Part` placed before the prompt.
5. **Privacy** — what is logged (byte counts, outcome) vs never logged (audio, transcript); tested with `caplog`.

**Interview line:** "I migrated speech-to-text without changing the API or its policy. The endpoint had no quota gate, so I kept that as a documented decision, captured the old parser's behavior in 21 golden cases first, and validated the audio on both sides."

## 11. Verification status

| Check | Status |
|---|---|
| Python tests, Ruff, mypy | run, see the commit message |
| Node tests, typecheck, build | run |
| **Real Gemini audio transcription** | **Done.** A synthetic 5.5 s `.m4a` (made from a harmless sentence with `gTTS` and `ffmpeg` in a throwaway environment outside the repo) went through a real Express route → Node adapter → real `uvicorn` → real Gemini, and came back correctly. Not tested: Tamil or Tanglish speech, noisy or long recordings, other containers (webm, wav). |

## 12. Known gaps

- `GeminiClient.generateFromAudio` is now unused by production code (kept because older tests exercise the client's audio path). Meal photo has since migrated too (guide 05), so `generateFromImage` is unused as well; both were removed together with the tests that still exercised them in Phase 8 (2026-11-19).
- Python's Gemini attempt limit is 20 s (Node used 25 s), bounded further by the HTTP timeout.
- The usage ledger label is still `coach_chat` (the existing analytics grouping); a dedicated label needs a code change in the shared feature list.
- Usage is attributed to the user now; before, it was recorded with no user.
- Only successful Python calls are recorded in the usage table.
