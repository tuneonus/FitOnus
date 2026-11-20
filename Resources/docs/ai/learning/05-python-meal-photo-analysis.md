# Learning guide 05 — Meal photo analysis moved to Python

**Branch:** `development`. **Builds on:** [02 Python-only architecture](02-python-only-ai-architecture.md), [03 voice meal](03-voice-meal-python-migration.md) and [04 speech transcription](04-python-speech-transcription.md). Same pattern, fourth feature, and the first one whose input is an **image**.

---

## 1. What the feature does

The user photographs a plate; the phone sends `POST /api/v1/nutrition/meal-photo/analyze` with `{image (base64), mimeType, mealType?, notes?}`. The API returns whether the photo contains food, a one-sentence summary, the detected foods (name, portion, kcal, protein, carbs, fat, fibre, confidence) and totals. The user then reviews the result and logs it with a separate call. **This endpoint stores nothing.**

**Public contract: unchanged.** Same request, same response, same status codes, same error codes, same quota behavior.

## 2. Who owns what

| Concern | Owner |
|---|---|
| Login, global rate limiter, request validation (mime allow-list, 10 MB cap), the AI gate (feature flag, per-user burst limit, daily quota, refund-if-not-dispatched) | **Node** (unchanged: `AnalyzeMealPhotoUseCase`) |
| Which Gemini models (admin "meal photo" setting, same as before) | Node → sent to Python |
| Image decoding and checking, prompt, Gemini vision call, primary + backup model, reply parsing, nutrition totals and rounding | **Python** |
| Token ledger (`feature = meal_photo`) | Python reports, Node writes (now attributed to the user, same as before) |

Removed from Node: `gemini-meal-photo-service.ts` (prompt + parser) and its wiring. **There is no Node Gemini fallback**: if Python is down the user gets a controlled 503 and the quota unit is refunded.

## 3. Request flow

```
Phone → POST /api/v1/nutrition/meal-photo/analyze {image, mimeType, mealType?, notes?}
  → Node: authenticate → zod (mime enum, notes ≤ 250) → AnalyzeMealPhotoUseCase
          (image present, ≤ 10 MB, mime allowed) → AiUsageGate.run('meal_photo')
  → PythonMealPhotoService.analyzePhoto()  (user id from the gate's request context)
  → callPythonAi → POST /internal/v1/ai/meals/analyze-photo
          (signed 30 s token, scope ai:meals:photo, X-Request-Id)
  → Python: verify token → validate body → decode base64 → check it is really an image
          → Gemini (image part first, then the prompt) → parse reply
  → Node: validate Python's reply → record usage → public response → phone
```

## 4. Validation, in layers (defense in depth)

| Layer | Rule | Failure |
|---|---|---|
| Node route (zod) | `image` non-empty, `mimeType` ∈ {jpeg, png, webp, heic} (default jpeg), `notes` ≤ 250 | `400 VALIDATION_FAILED`, nothing charged |
| Node use case | image not blank, base64 ≤ 10 MB (10 × 1024 × 1024 characters), mime allow-list | `400` / `413 PAYLOAD_TOO_LARGE`, nothing charged |
| Python contract (Pydantic) | same mime allow-list (exact, case-sensitive), same 10 MB cap, `notes` ≤ 250, `mealType` ≤ 200, deadline 1–30 s, no unknown fields (so no `userId`) | `422`, field **names** listed, values never echoed |
| Python image check (`shared/utils/image.py`) | accepts raw base64 or a `data:` URL; decoded bytes must start with a JPEG, PNG, WebP or HEIC/HEIF signature | `422 INVALID_REQUEST`, `dispatched: false` (Gemini never called, so Node refunds the unit) |

Two decisions worth knowing:

1. **The signature check looks at the bytes, not at the label.** The app has always sent `image/jpeg` by default and Gemini tolerates a mismatching label, so refusing a real photo because of its label would be a regression. What is refused is data that is not a supported image at all (corrupt upload, text, a GIF). Before, such data went to Gemini, failed there and still consumed the user's quota; now it is refused for free.
2. **A corrupt image reaches the user as the same controlled 503** ("Unable to analyze meal image right now. Please try again.") as any other failure, because Node maps a Python `422` to its generic "AI backend unavailable" message. The status class (503) is the same as before; only the refund behavior improved.

Neither side logs the image, the notes, or the model's reply. Python logs metadata only (prompt version, model, outcome, item count, image **byte count**, tokens, duration); a test proves it with `caplog`.

## 5. Errors, timeouts, quota

Same mapping as every migrated feature (`toPublicAiError`), with the wording the app has always received for photo analysis.

| Situation | Public result | Quota unit |
|---|---|---|
| Python unreachable, wrong/missing service secret (`401`), Python refuses the request (`422`), Python not configured | `503 SERVICE_UNAVAILABLE` + "Unable to analyze meal image right now. Please try again." | **refunded** (Gemini provably not called) |
| Timeout (Node → Python, or Gemini inside Python) | `503` "AI request timed out. Please try again." | consumed, no retry |
| Gemini rate limit / project daily quota | `429 RATE_LIMITED` / `AI_QUOTA_EXCEEDED` | consumed |
| Both Gemini models failed | `503 AI_UNAVAILABLE` | consumed |
| Python reply does not match the contract | `503` | consumed |
| Gemini answered, but not with usable JSON | `200`, `isFood: false`, "Unable to parse food analysis" (**exactly what Node always returned**) | consumed |

**Time budget.** The app waits **30 s**. Node's HTTP call to Python is capped at **27 s** (`MEAL_PHOTO_MAX_TIMEOUT_MS`, even if `AI_BACKEND_TIMEOUT_MS` is set higher); Python's total Gemini deadline is **1.5 s shorter (25.5 s)** and covers primary *and* backup. One Gemini attempt is limited to `GEMINI_ATTEMPT_TIMEOUT_S` (default 20 s; Node used 25 s for images, see §10). Nothing retries: one call to Python, at most primary + one backup model inside it.

**Model fallback** lives in Python's `shared/llm/gemini.py` (shared by all features): rate-limit/overload on the primary → the same image and prompt go to the backup model; auth errors and project-wide daily quota never try the backup. The admin console's primary/backup names for `meal_photo` still decide *which* models.

## 6. Characterization-first

Before deleting `GeminiMealPhotoService`, a throwaway script ran the **real Node class** over **49 raw model replies** and 7 prompt inputs and saved the output (the script lives outside the repo). The fixtures are `tests/fixtures/meal_photo/{parse_cases.json (48 cases), prompt_cases.json (7 cases)}`. The Python port reproduces every one (ids and timestamps normalised).

Quirks of the Node parser that are deliberately **preserved**, because the app's numbers depend on them:

- `isFood: "false"` (a string) still counts as food; only the JSON value `false` means no food. `isFood: false` **with** items means no food. Missing `isFood` with items means food.
- An empty or non-array `items` means no food, with the default reason "No clear food detected in image."
- A reply that is not JSON, JSON `null`, or contains a `null` item is "not formatted correctly" (`isFood: false`, "Unable to parse food analysis"). A JSON array/number/string root is simply "no food".
- Numbers use JavaScript's `Number(x) || 0` (`"300.6"` → 301, `"abc"` → 0, `true` → 1, `[]` → 0); kcal and grams are clamped at 0; `Math.round` rounds halves **up** (Python's `round` would not); totals are added left to right (Python's `sum()` can differ in the last decimal).
- `servingWeightG` 0/missing → 100; `servingUnit` → "serving"; `servingSize` → 1; name → "Food Item N"; `brand` is always "AI Estimate"; ids look like `ai-food-<ms>-<index>`.
- Overall confidence is 0.9 / 0.5 / 0.75 for `high` / `low` / anything else. The success result has **no** `unclearReason` key, even if the model supplied one.

One deliberate difference: a model reply containing an infinite number (`1e999`). Node serialised it as `null` on the wire; Python treats the reply as unusable (`parse_failed`). It cannot be represented in the response anyway.

While porting, a real gap in the shared helper `core/js_compat.js_num` showed up: JavaScript prints `1e21` as `"1e+21"` and `0.00001` as `"0.00001"`, Python printed `1000000000000000000000` and `1e-05`. `js_num` now follows JavaScript (tests added); voice meal benefits too.

## 7. Files

**Python (`ai-backend/src/onusfit_ai/`)**

- `shared/utils/image.py` — **`decode_image_base64`**, **`looks_like_supported_image`**. *Input:* base64 text or data URL. *Output:* bytes. *Errors:* `AiError` 422, `dispatched=false`, message never echoes the input. *Tests:* `test_image_rules.py` (16).
- `shared/contracts/common.py` — new **`ImageInput`** (mime allow-list, 10 MB cap); `DetectedFoodItem` and `Confidence` moved here from `voice_meal.py` because photo and voice share them (no behavior change).
- `features/meals/domain/photo.py` — **`AnalyzeMealPhotoRequest`** (`image`, `mealType?`, `notes?`, `model`, `deadlineMs`), **`MealPhotoResult`**, **`AnalyzeMealPhotoResponse`** (`outcome: ok | no_food | parse_failed`, `result`, `usage`, `traceId`). The `outcome` flag is new: Node's "not formatted correctly" answer used to look exactly like "no food", now it can be counted.
- `features/meals/application/prompts/meal_photo.py` — **`build_prompt(meal_type, notes)`**, version `meal_photo_v1_node_parity`; verbatim port, compared with the 7 golden prompts (`test_meal_photo_prompt.py`, 9 tests).
- `features/meals/application/photo_parsing.py` — **`parse_meal_photo_output(raw)`** → `(result, outcome)`, never raises (`test_meal_photo_parsing.py`, 65 tests incl. the 48 goldens).
- `features/meals/application/photo.py` — **`analyze_meal_photo(request, llm, trace_id)`**: decode image → `llm.generate_text(prompt, media=image)` → parse; logs metadata only.
- `features/meals/presentation/meal_photo.py` — **`POST /internal/v1/ai/meals/analyze-photo`**, scope `ai:meals:photo` (chat, voice and transcription tokens are refused). Registered in `main.py`.
- `features/meals/application/parsing.py` — `now_iso` and `one_decimal` made public so the photo parser reuses them instead of copying.
- `shared/llm/gemini.py` — **unchanged**: it already sends any `MediaInput` (image or audio) to both models.

**Node (`backend/src/`)**

- `modules/nutrition/infrastructure/python-meal-photo-service.ts` — **`PythonMealPhotoService`** implements the existing `MealPhotoAnalyzer` port, built on `callPythonAi`. *Input:* `(image, mealType?, notes?)`; the user id comes from the gate's request context, never from input. *Output:* the exact `MealPhotoAnalysisResult` the app parses (optional keys absent, never `null`). *Errors:* one `AppError`.
- `modules/nutrition/index.ts`, `container.ts` — the module now takes `mealPhotoAnalyzer` instead of `geminiClient`; the container builds `PythonMealPhotoService` (models via `resolveModelsFor('meal_photo')`). The Node `GeminiClient` is no longer created in the container.
- `AnalyzeMealPhotoUseCase`, the controller, routes and schemas are **unchanged**.
- Deleted: `gemini-meal-photo-service.ts`.

## 8. Tests

- **Python:** 367 pass (was 218): meal photo prompt (9), parsing (65), API (47), image rules (16), and `js_num` (+13).
  The API tests cover: success; data-URL; the four formats; 7 unsupported labels; 10 MB over/at the limit; 6 malformed images; 11 invalid requests that must not echo input; wrong scopes; missing/wrong token; a photo without food; malformed Gemini reply; structured Gemini errors; no private data in logs; and, with the **real `GeminiClient` over a fake SDK**: image sent to the backup model when the primary is overloaded, both models failing, rate limit, a hanging call timing out once without retry, and a missing key being non-billable.
- **Node:** `tests/unit/nutrition/meal-photo-python-integration.test.ts` (34) drives the **real use case + real quota gate + real HTTP client** against a fake Python server: one call and one unit per success; body shape and token scope; deadline capped under the mobile timeout; usage row (`meal_photo`, attributed to the user); every failure row of §5 with refund-vs-consume; validation, disabled feature and exhausted quota never reach Python; and the real route/controller (`200` envelope, the exact `data` keys, `400`s, `503` with nothing internal in the body). Existing `meal-photo.test.ts` and gating tests pass unchanged except for the type of the mocked service.

## 9. Run and test

```bash
cd ai-backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check . && .venv/bin/mypy
cd backend    && npm run typecheck && npx vitest run tests/unit && npm run build
```

## 10. Known gaps and notes

- **Python attempt timeout is 20 s** (Node used 25 s per image attempt). The total deadline (25.5 s) still fits the app's 30 s; a slow image could fail on the primary at 20 s and have only ~5 s for the backup.
- Large photos: base64 JSON travels Node → Python (about 33% bigger than the bytes). Multipart was proposed in the readiness assessment but not needed at the 10 MB cap; revisit if latency shows it.
- The `mealType` is not length-limited by Node's public schema; Python rejects more than 200 characters (the app only sends a short fixed list). Notes keep Node's 250 limit.
- `GeminiClient.generateFromImage` and `generateFromAudio` are now unused by production code (older unit/integration tests still exercise them). Both were removed, together with those tests, in Phase 8 (2026-11-19).
- Only successful Python calls are recorded in the usage table (as for the other migrated features).
- The prompt still interpolates the user's notes verbatim (parity first, see readiness decision O7); hardening it against prompt injection is a separate, evaluated change.
- Not tested: HEIC and WebP photos with real Gemini, very large (near 10 MB) photos, Tamil-language notes, and the Android app end to end. The HTTP integration tests that need PostgreSQL (`ai-usage.http.test.ts`, `ai-rate-limit.http.test.ts`) **were not run** (no Docker here). By reading them, their meal-photo expectations should still hold: the test app points `AI_BACKEND_URL` at a closed port, so an admitted photo request now fails with "Python unreachable" (503 `SERVICE_UNAVAILABLE`, unit refunded, no ledger row), which is exactly what they assert (they used to get it from "no Gemini key configured"). Run them where Docker is available.

## 11. Verification status

| Check | Status |
|---|---|
| Python tests, Ruff, mypy | run (367 passed) |
| Node typecheck, unit tests (1462), build | run |
| **Real Gemini image analysis** | **Done on 2026-11-19.** Through a real Express route + real quota gate + the Node adapter + a real `uvicorn` + real Gemini (`gemini-3.5-flash-lite`). Photo: a design-asset picture of an Indian thali already in the repo (`mobile/assets/images/dd64297a-….jpg`, no people, nothing personal). Result: `200`, valid against the public schema, six items (jeera rice, paneer tikka, dal tadka, naan, cucumber raita, kachumber salad), 1230 kcal total, about 8.7 s. A non-food picture (a gym-bench design asset) came back as `isFood: false` with a reason, about 5.5 s. Each call used one quota unit and wrote one `meal_photo` usage row. The throwaway scripts and the service secret were not saved in the repo; the Gemini key came from the local, git-ignored `backend/.env` and was never printed. **Not** a test on a phone, and the nutrition estimates were not checked against a dietitian. |

## 12. What to study

1. **Characterize before you port** — 49 recorded replies caught quirks no one would have guessed (`"false"` is food; `Math.round` halves; `1e21`).
2. **A port is a chance to make a silent failure visible** — the `outcome` flag, with the public answer unchanged.
3. **Refuse cheap-to-detect garbage before the expensive call** — an image signature check saves a billable Gemini call (and the user's quota).
4. **Image as model input** — base64 → bytes → a `Part` placed before the prompt; the same `MediaInput` the audio features use.
5. **Budgeting time across processes** — mobile 30 s > Node HTTP 27 s > Python deadline 25.5 s > one Gemini attempt 20 s.

**Interview line:** "I moved image-based meal analysis to a Python service without changing the API, the quota rules or the error messages. I first recorded 49 replies from the old parser, ported its exact rounding and edge cases, added an image-signature check so corrupt uploads cost nothing, and proved model fallback, timeouts and refunds with tests plus one real Gemini run."
