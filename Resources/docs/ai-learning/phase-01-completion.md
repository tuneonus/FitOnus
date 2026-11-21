# OnusFit Phase 1 Completion: Gemini Native Structured Outputs
## Master Engineering Architecture & Production Implementation Guide

> **Phase**: Phase 1 — Gemini Native Structured Outputs  
> **Status**: Completed, Hardened & Verified  
> **Components**: `ai-backend` (Python FastAPI + `google-genai`), `backend` (Node.js Gateway + PostgreSQL Ledger), `mobile` (React Native Expo)

---

## 1. Executive Summary & Architectural Overview

Phase 1 establishes **Gemini Native Structured Outputs** across all production AI capabilities in OnusFit. By migrating from unconstrained free-text LLM generation and regex/JSON heuristic post-parsing to native JSON schema decoding constrained at the model token sampler (`response_mime_type="application/json"` with `response_schema`), OnusFit completely eliminates JSON syntax malformations, unclosed markdown code blocks, and field hallucination vulnerabilities.

### System Architecture & Trust Boundaries

```text
 ┌────────────────────────────────────────────────────────┐
 │           Mobile App (React Native Expo Router)        │
 └──────────────────────────┬─────────────────────────────┘
                            │ HTTPS (Bearer JWT)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │            Node.js API Gateway (Express 5 + TS)        │
 │  - Authentication & Rate Limiting                      │
 │  - Quota Pre-Check & Gating (Atomic Redis/PG)          │
 │  - User Fitness Context Aggregation                    │
 │  - PostgreSQL Gemini Usage Ledger (Awaited Insert)     │
 │  - Internal Service JWT Minting (HS256 with 'rid')     │
 └──────────────────────────┬─────────────────────────────┘
                            │ Mutual Internal HTTP (X-Correlation-Id)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │          Python AI Microservice (FastAPI + Pydantic)    │
 │  - Stateless Generation Orchestration                  │
 │  - Strict Pydantic v2 Schema Constraints               │
 │  - Defensive Parsing & Fallback Layers                 │
 │  - Multimodal Audio/Image Safe Decoding                │
 │  - Domain Limit Sanitization (Macros & Calories)       │
 │  - Error Serialization with Consumed Usage Metadata    │
 └──────────────────────────┬─────────────────────────────┘
                            │ google-genai SDK (v0.1.1+)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │              Google Gemini API (Flash-Lite / Pro)      │
 │  - Constrained Decoding at Sampler Level               │
 └────────────────────────────────────────────────────────┘
```

---

## 2. Production AI Features Migrated in Phase 1

| Feature | Endpoint | Primary / Fallback Model | Structured Schema | Feature Toggle Flag |
| :--- | :--- | :--- | :--- | :--- |
| **Speech Transcription** | `POST /internal/v1/ai/speech/transcribe` | `gemini-2.0-flash-lite` | `GeminiTranscribeOutput` | `AI_SPEECH_STRUCTURED_OUTPUTS` |
| **Coach Chat** | `POST /internal/v1/ai/coach/chat` | `gemini-2.5-flash-lite` / `gemini-2.0-flash-lite` | `GeminiCoachReplyOutput` | `AI_COACH_CHAT_STRUCTURED_OUTPUTS` |
| **Coach Insights** | `POST /internal/v1/ai/coach/insights` | `gemini-2.5-flash-lite` / `gemini-2.0-flash-lite` | `GeminiCoachInsightsOutput` | `AI_COACH_INSIGHTS_STRUCTURED_OUTPUTS` |
| **Voice Meal** | `POST /internal/v1/ai/meals/parse-voice` | `gemini-2.5-flash-lite` / `gemini-2.0-flash-lite` | `GeminiVoiceMealOutput` | `AI_VOICE_MEAL_STRUCTURED_OUTPUTS` |
| **Meal Photo** | `POST /internal/v1/ai/meals/analyze-photo` | `gemini-2.5-flash-lite` / `gemini-2.0-flash-lite` | `GeminiPhotoMealOutput` | `AI_PHOTO_MEAL_STRUCTURED_OUTPUTS` |
| **Workout Generator** | *Architectural Placeholder* | *Deferred to future phase* | *N/A (No-op placeholder)* | *N/A* |

---

## 3. Pydantic v2 Schemas & Data Contracts

All structured generation schemas are defined in pure Pydantic v2 models under feature `application/schemas.py` modules, utilizing camelCase serialization to maintain seamless contract compatibility with Node.js and Mobile TypeScript types.

### A. Meals (Voice & Photo) Schemas (`onusfit_ai.features.meals.application.schemas`)

```python
class GeminiDetectedFoodItemOutput(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    name: str = Field(default="Food Item", description="Standard Food Name")
    portion_description: str | None = Field(default=None, description="e.g. 2 pieces · 160 g")
    serving_weight_g: float | None = Field(default=None, description="Weight in grams")
    serving_unit: str | None = Field(default=None, description="piece, cup, bowl, etc.")
    serving_size: float | None = Field(default=None, description="Portion count")
    calories: float = Field(default=0.0, description="Estimated energy in kcal")
    protein_g: float = Field(default=0.0, description="Protein in grams")
    carbs_g: float = Field(default=0.0, description="Carbohydrates in grams")
    fat_g: float = Field(default=0.0, description="Fat in grams")
    fiber_g: float | None = Field(default=None, description="Dietary fiber in grams")
    confidence: Literal["high", "medium", "low"] = "medium"

class GeminiVoiceMealOutput(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    transcript: str = Field(default="", description="Transcribed or confirmed speech text")
    detected_language: Literal["en", "ta", "tanglish"] = "en"
    confidence: Literal["high", "medium", "low"] = "medium"
    unclear_reason: str | None = None
    items: list[GeminiDetectedFoodItemOutput] = Field(default_factory=list)

class GeminiPhotoMealOutput(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    is_food: bool = Field(default=True, description="Whether image contains food")
    summary: str = Field(default="Analyzed meal photo", description="Short 1-sentence summary")
    confidence: Literal["high", "medium", "low"] = "medium"
    unclear_reason: str | None = None
    items: list[GeminiDetectedFoodItemOutput] = Field(default_factory=list)
```

### B. Defensive Extraction & Sanitization

1. **Extraction Hierarchy**:
   - `llm_result.parsed`: Direct validated Pydantic model returned by Gemini SDK.
   - `dict` validation: If parsed is a dict, validates through `.model_validate(dict)`.
   - `text` fallback: If `parsed` is absent, strips markdown code fences (````json ... ````) and strictly parses with `strict_json_loads` before validation.
   - Failure: If model output is invalid, raises `LlmServiceError(code="PROVIDER_ERROR", dispatched=True, usage=llm_result.usage)` (503 HTTP), preventing hallucinated partial objects from reaching users.
2. **Domain Sanitization Layer** (`meals/domain/sanitize.py`):
   - Every nutrient value is bounded to safe human limits: Calories ($0 \le \text{kcal} \le 5000$), Macros ($0 \le g \le 500$), Serving Weight ($0 < g \le 5000$).
   - If any value is clamped due to hallucination, item confidence is downgraded to `"low"` with an advisory notice.
   - Deterministic food IDs are generated matching `voice-food-{timestamp}-{index}` and `ai-food-{timestamp}-{index}`.

---

## 4. Provider Usage Ledger & Reliability Architecture (WP1)

### The Core Problem Solved
Previously, if a provider call failed after being dispatched (e.g., Gemini `finish_reason="SAFETY"`, token truncation `MAX_TOKENS`, or malformed structured response), consumed API tokens were not recorded in PostgreSQL. Additionally, fire-and-forget promise chains (`.catch(() => undefined)`) risked silent usage drops during container shutdown.

### Hardened Implementation
1. **Python Telemetry Attachment**:
   - `LlmServiceError` carries optional `usage: LlmUsage | None`.
   - In `features/coach/chat.py`, `features/coach/insights.py`, `features/meals/voice.py`, and `features/meals/photo.py`, usage is attached on `SAFETY`, `MAX_TOKENS`, and parse errors.
   - In `shared/errors/errors.py`, `handle_llm_error` serializes camelCase `usage` object in 503 HTTP responses:
     ```json
     {
       "error": {
         "code": "PROVIDER_ERROR",
         "message": "...",
         "dispatched": true,
         "usage": {
           "model": "gemini-2.5-flash-lite",
           "isFallback": false,
           "inputTokens": 500,
           "outputTokens": 50,
           "cachedTokens": 0,
           "thinkingTokens": 10,
           "totalTokens": 560,
           "durationMs": 780
         }
       }
     }
     ```
2. **Node.js Gateway Accounting (`backend/src/shared/ai/python-ai-call.ts`)**:
   - `PythonAiClient` extracts `error.usage` into `PythonAiError.info.usage`.
   - `callPythonAi` records usage for **both successful and failed** calls:
     ```typescript
     await recorder.recordExternalUsage({
       requestId,
       userId,
       feature,
       model,
       status: 'failed', // or 'success'
       isFallback,
       inputTokens,
       outputTokens,
       cachedTokens,
       totalTokens,
       durationMs,
       errorCategory: failure.info.code || failure.kind,
     });
     ```
3. **Database Ledger Await & Isolation**:
   - `recordExternalUsage` is explicitly awaited, guaranteeing execution before process termination.
   - Wrapped in dedicated `try/catch`: if the PostgreSQL insert fails (e.g. temporary DB lock or network drop), a structured event `ledger_persistence_failed` is logged with correlation IDs, but the client response is **never failed or aborted**.
4. **Dispatched State & Quota Protection**:
   - The moment an HTTP request reaches Python, `markAiRequestDispatched()` executes.
   - Quota units are **never refunded** once dispatched, preventing replay attacks or free API exhaustion via forced safety violations.
   - An invalid response format is classified as `invalid_response` and never converted into an untracked outcome.

---

## 5. Feature Toggles & Zero-Downtime Rollback Controls

Each feature is gated by an environment toggle that can instantly roll back to legacy string parsing without requiring code redeployment or container rebuilding:

| Toggle Variable | Default | True Behavior | False Behavior |
| :--- | :--- | :--- | :--- |
| `AI_SPEECH_STRUCTURED_OUTPUTS` | `true` | Gemini Native JSON Schema | Legacy regex/line-based speech parsing |
| `AI_COACH_CHAT_STRUCTURED_OUTPUTS` | `true` | Gemini Native `GeminiCoachReplyOutput` | Legacy JSON parsing with markdown stripping |
| `AI_COACH_INSIGHTS_STRUCTURED_OUTPUTS` | `true` | Gemini Native `GeminiCoachInsightsOutput` | Legacy 10-minute cached JSON parser |
| `AI_VOICE_MEAL_STRUCTURED_OUTPUTS` | `true` | Gemini Native `GeminiVoiceMealOutput` | Legacy regex meal parser (`parse_voice_meal_output`) |
| `AI_PHOTO_MEAL_STRUCTURED_OUTPUTS` | `true` | Gemini Native `GeminiPhotoMealOutput` | Legacy photo parser (`parse_meal_photo_output`) |

---

## 6. Verification & Automated Test Evidence

### Complete Test Results Summary

| Test Suite | Environment | Test Count | Result | Key Capabilities Verified |
| :--- | :--- | :--- | :--- | :--- |
| **Python Unit & API** | `ai-backend` (pytest) | **778 tests** | **100% Passed** | Structured output, multilingual (English, Tamil, Tanglish), safety, truncation, fallback, rollback, sanitization |
| **Node.js AI Observability** | `backend` (vitest) | **162 tests** | **100% Passed** | Correlation propagation, failed usage recording, ledger failure isolation, dispatched state preservation |
| **Wire Contract Verification** | Full Stack (`wire_fields.json`) | **11 tests** | **100% Passed** | Strict field & camelCase type compatibility across Node and Python models |
| **Backend TypeScript Check** | `backend` (`tsc --noEmit`) | Full Project | **0 Errors** | Type safety across repositories, controllers, services, and domain contracts |
| **Backend Modified Files Lint**| `backend` (eslint) | Modified Files | **0 Errors** | Clean lint verification on modified AI service, client, and test files |
| **Mobile TypeScript & Lint** | `mobile` (`tsc` + Expo lint) | Full Project | **0 Errors** | Mobile compatibility intact, zero breaking changes to client contracts |
| **Git Diff Inspection** | Workspace (`git diff --check`)| Full Repo | **0 Errors** | Clean whitespace, no merge conflicts or unintended edits |

---

## 7. Next Steps & Phase Transition

Phase 1 Structured Outputs is **100% Complete and Production Ready**.

The architecture is prepared for **Phase 2 — Gemini Function Calling (Tools)**:
- Workout generation will be implemented as an active tool call or native generator under Phase 2/3.
- All subsequent features will inherit the hardened usage accounting ledger and structured schema patterns proven in Phase 1.

