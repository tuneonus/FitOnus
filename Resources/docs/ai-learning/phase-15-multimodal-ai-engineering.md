# Phase 15 — Multimodal AI Engineering

This guide documents the multimodal AI upgrades delivered in Phase 15 across `ai-backend`, `backend`, and `mobile` while running in parallel with Phase 13 on the `development` branch.

---

## 1. Architecture & Reused Modules

Rather than introducing new standalone model clients or duplicate AI gateways, Phase 15 strengthens and composes FitOnus's existing abstractions:

- **Gemini Model & Port Abstraction** (`ai-backend/src/onusfit_ai/shared/llm/ports.py`, `ai-backend/src/onusfit_ai/shared/llm/gemini.py`):
  - Reuses the existing configured primary/fallback Gemini models and `TextGenerator` protocol.
  - Extends `TextGenerator.generate_text` to accept `MediaInput | Sequence[MediaInput]`, optional `max_output_tokens`, separated `system_instruction`, and `user_id`.
  - Adds pre-flight multimodal token budget estimation (`estimate_multimodal_input_tokens`) blocking over-budget requests before calling Gemini (`dispatched=False`).
  - Adds per-user concurrency-safe in-flight request deduplication (`_inflight` keyed by SHA-256 `user:<user_id>` + request + media hash, disabled when `user_id` is empty/whitespace) with waiter refcounting so cancelling one caller preserves surviving waiters and cancels the underlying SDK task when the last waiter leaves.

- **Media Validation & Privacy Hygiene** (`ai-backend/src/onusfit_ai/shared/utils/image.py`, `audio.py`, `text.py`):
  - **Images**: Validates JPEG, PNG, WebP, and HEIC signatures, rejects SVGs/HTML/PDFs/ZIPs/AVIF brands and appended trailer polyglots, parses SOF/IHDR/VP8 pixel headers to reject `>8192 px` or `>40 MP` decompression bombs, and strips JPEG EXIF/XMP/COM segments (`strip_jpeg_exif_metadata`) before media leaves the service.
  - **Audio**: Validates MIME classes and decodes containers, blocks disguised image/document/script payloads, enforces a `12 MiB` decoded byte cap, and inspects WAV/MP4/Ogg-Opus container headers to refuse recordings exceeding `65 s` before Gemini billing.
  - **Text Hygiene**: Adds `sanitize_multimodal_user_text` (angle brackets, backticks, role header neutralization, invisible bidi/zero-width stripping) and `redact_sensitive_text` (API keys, Bearer tokens, JWTs, emails).

- **Speech & Meal Intelligence** (`ai-backend/src/onusfit_ai/features/speech/` & `features/meals/`):
  - Hardened prompts (`transcribe_v2_multimodal_hardened`, `voice_meal_v2_multimodal_hardened`, `meal_photo_v2_multimodal_hardened`) with richer Tamil/Tanglish counters (`oru..anju`, `arai`, `kaal`, `kinnam`, `karandi`, `thattu`, `tumbler`), IFCT 2017 / USDA food grounding, untrusted-data boundaries, and explicit portion-uncertainty rules.
  - Sanitizer (`features/meals/domain/sanitize.py`) adds Atwater energy-macro consistency checks, impossible macro-density detection, output redaction, medical diagnosis/prescription claim filtering, and item-to-overall confidence calibration.
  - Unified Multimodal Workflow (`features/meals/domain/multimodal.py`, `features/meals/application/multimodal.py`, `features/meals/application/prompts/multimodal_meal.py`): combines `text`, `audio`, and EXIF-stripped `image` parts with sanitized dietary preferences and allergies into one structured workflow.

- **Node Gateway Pre-Quota Guards** (`backend/src/shared/ai/audio-input.ts`, `analyze-meal-photo.ts`, `parse-voice-meal.ts`, `python-speech-transcriber.ts`):
  - Adds `inspectSafeBase64Payload` and stricter MIME normalization before `AiUsageGate` quota consumption or Python RPC calls, refusing empty/disguised payloads free of quota cost.

- **Mobile Capture, Uncertainty & Correction UX** (`mobile/src/features/nutrition/`, `voice-coach/`):
  - Preserves transient-only meal photo handling (`MEAL_PHOTO_QUALITY = 0.5`, zero disk/library persistence).
  - Adds dimension checks (`<= 8192 px` / `40 MP`) and note normalization in `meal-photo-upload.ts`, and `isAudioPayloadWithinLimit` in `voice-recording-limit.ts`.
  - `MealAnalysisScreen`: prevents concurrent duplicate calls (`analyzeLockRef`), displays `unclearReason` / low-confidence uncertainty banners even when items are present, and adds inline ingredient correction notes + re-analysis.
  - `VoiceMealEntryScreen`: adds duplicate-submit guards, audio size checks, detected language badge, editable transcript + re-parse, and `0.5x/1x/1.5x/2x` per-item portion controls.
  - `VoiceCoachScreen`: adds `inFlightRef` lock, 60-second recording cap, minimum duration validation, and audio payload size checks.

---

## 2. Offline Evaluation Coverage

The Phase 15 benchmark suite (`ai-backend/tests/evals/datasets/multimodal_benchmark.json`, `evaluators/multimodal.py`, `offline/test_multimodal_eval.py`) runs 52 offline cases (zero live Gemini calls) reusing `NutritionToleranceEvaluator` and `MultilingualAccuracyEvaluator` across:

- English voice nutrition parsing, silence, and transcription
- Tamil script (`தமிழ்`) and Tanglish food/quantity disambiguation
- Vision IFCT/USDA identification, non-food rejection, occlusion, and EXIF stripping
- Multi-modality fusion (`text` + `audio` + `image`)
- Portion uncertainty, Atwater mismatches, and hallucination bounds
- Malformed media, pixel bombs, over-long WAV audio, MIME spoofing, and polyglots
- Prompt injection, invisible Unicode overrides, secret redaction, and medical safety
- Token budgets, duplicate call coalescing, `MAX_TOKENS`, and `SAFETY` blocks

---

## 3. Finalized Integration & Multi-Agent Wiring

1. **FastAPI Route, Wire Contract, & Node Gateway**:
   - Mounted `POST /internal/v1/ai/meals/analyze-multimodal` (`SCOPE = "ai:meals:multimodal"`) in `ai-backend/src/onusfit_ai/main.py` with `FEATURE_BY_PATH` entry `"multimodal_meal"` in `shared/observability/observability.py`, updated `MAX_REQUEST_BODY_BYTES` in `body_limit.py`, and regenerated `ai-backend/tests/fixtures/contracts/wire_fields.json`.
   - Wired Node `backend/src/modules/nutrition/` (`multimodal-meal.types.ts`, `AnalyzeMultimodalMealUseCase`, `PythonMultimodalMealService`, `multimodal-meal.schemas.ts`, `POST /api/v1/nutrition/multimodal/analyze` with `MULTIMODAL_MEAL_BODY_LIMIT = 26mb`) and `container.ts`. Meters via `AiUsageGate` (`meal_photo` / `voice_meal`) with zero schema migrations and propagates caller `AbortSignal` through `PythonAiClient` (`dispatched: false` pre-fetch refund).
2. **Mobile E2E Integration** (`mobile/src/features/ai-coach/services/multimodal-meal-api.ts`, `MealAnalysisScreen.tsx`, `mobile/tests/multimodal-meal-e2e.test.ts`):
   - Routes note-enriched re-analysis through `MultimodalMealApi` and surfaces `uncertaintyNote` while preserving transient-only photo handling.
3. **Eval Runner Registry Integration**:
   - Registered `"multimodal": "multimodal_benchmark.json"` (52 cases) in `tests/evals/datasets/loader.py`, extracted `execute_multimodal_offline_case` into `tests/evals/evaluators/multimodal.py`, and integrated step `5f` into `tests/evals/runner.py` (`test_runner.py` total: 329 offline cases).
4. **Phase 13 Coach Multi-Agent Multimodal Integration**:
   - Added optional `image`/`audio` fields to `CoachChatRequest`, `AgentCapability.MULTIMODAL_ANALYSIS`, `MultimodalMealPort` in `features/coach/domain/multi_agent.py` + `shared/tools/multi_agent.py`, and `_MultimodalMealPortAdapter` in `main.py`.
   - `MultiAgentCoachExecutor` pre-validates and EXIF-strips attachments before budgets/LLM calls; `SupervisorRouter` routes multimodal queries to `NutritionAgent`; `NutritionAgent` invokes `MultimodalMealPort` under `CumulativeBudgetTracker` limits; `SupervisorAgent` avoids re-sending raw media when `multimodal_meal_analyzer` already ran.
5. **Documentation & Indexes**:
   - Linked in `Resources/docs/INDEX.md` and `Resources/docs/ai-learning/existing-ai-engineering/00-learning-index.md`.
