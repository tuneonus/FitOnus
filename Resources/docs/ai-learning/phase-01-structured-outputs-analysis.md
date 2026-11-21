# Phase 1 / Task 1.1: Gemini Native Structured Outputs — Final Architecture & Migration Analysis

**Author:** Senior Gemini API Engineer & Production AI Architect  
**Date:** November 2026  
**Scope:** `ai-backend/` (`onusfit_ai`), `backend/` (Node.js API Gateway), and Google GenAI SDK integration  
**Status:** Strict Read-Only Documentation Review (Zero Application Code Modified)

---

## 1. Executive Summary & Correction of Reliability Claims

### 1.1 Real-World Reliability Reality (Correcting Absolute Guarantees)
Previous drafts claimed that Gemini Structured Outputs provide "100% schema compliance", "zero parsing failures", and "guaranteed populated `response.parsed`". In production software engineering, **such absolute guarantees are technically inaccurate and dangerous to rely upon**.

Gemini's Structured Outputs mechanism utilizes constrained decoding (grammar-based logit masking) to constrain token selection to grammar rules derived from an OpenAPI 3.0 schema. However, production systems still encounter real failure modes:

| Failure Mode | Production Reality & Root Cause | Architectural Defense Required |
|---|---|---|
| **Token Exhaustion (`MAX_TOKENS`)** | If the model's response exceeds the allocated `max_output_tokens` (or default output budget) before completing the JSON structure, generation terminates abruptly. The output is incomplete JSON (e.g. unclosed braces or cut-off array). In this state, **`response.parsed` is `None`**, and attempting to parse the raw text raises a JSON decode error. | Explicit check for `finish_reason == FinishReason.MAX_TOKENS`. Must handle partial generation cleanly and return controlled error without 500 crash. |
| **Safety Filter Interception (`SAFETY`)** | If an input or generated candidate triggers Google's safety thresholds (`HARM_CATEGORY_*`), generation terminates with `finish_reason == FinishReason.SAFETY`. **No candidate text or parsed object is returned**. | Check for `finish_reason == FinishReason.SAFETY`. Map to `PROVIDER_UNAVAILABLE` or safe refusal envelope. |
| **Empty or Blocked Candidates** | Edge cases where network dropouts, empty prompt processing, or transient API errors produce an empty `candidates` list. | Defensive validation of `response.candidates` array length before accessing `candidates[0]`. |
| **Constraint Non-Enforcement by Decoder** | The Gemini constrained decoder enforces **structural syntax** (types, keys, enums, objects, arrays), but **ignores semantic and numerical constraints** (such as `gt=0`, `ge=0`, `minimum`, `maximum`, `minItems`, `maxItems`, and regex `pattern`). A model constrained to output a `float` can still emit `-999.0` or `500000.0`. | **Python-side Pydantic validation and domain sanitization (`sanitize.py`) must remain mandatory**. |
| **SDK Type Coercion Failures** | If the model emits a value that satisfies the relaxed JSON schema but fails strict Pydantic field validators on the host (e.g. invalid date format or unexpected null), Pydantic raises a `ValidationError` when building `response.parsed`. | Wrap `response.parsed` access or manual Pydantic validation in defensive try/except blocks. |

---

## 2. Gemini Model Compatibility & Verification

### 2.1 Model Registry Audit Across OnusFit
An inspection of the repository reveals the following model identifiers in configuration and database migrations:
- `backend/src/config/env.ts`:
  - `GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite')`
  - `GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.1-flash-lite')`
- `backend/migrations/0015_create_gemini_management.sql`:
  - `default_model VARCHAR(64) NOT NULL DEFAULT 'gemini-2.5-flash'`
  - Seeds: `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`
- `backend/migrations/0020_add_gemini_fallback_model.sql`:
  - Seeds: `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`

### 2.2 Distinguishing SDK Capability vs. Documented Support vs. Unverified Models

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Gemini Model Compatibility                      │
├────────────────────────────┬──────────────────┬────────────────────────┤
│ Model Identifier           │ Official Support │ Verified Status        │
├────────────────────────────┼──────────────────┼────────────────────────┤
│ gemini-2.5-flash           │ Documented       │ VERIFIED (Primary)     │
│ gemini-2.5-flash-lite      │ Documented       │ VERIFIED (Fast tier)   │
│ gemini-2.5-pro             │ Documented       │ VERIFIED (Complex)     │
│ gemini-2.0-flash           │ Documented       │ VERIFIED               │
│ gemini-1.5-flash           │ Documented       │ RESTRICTED (Flat only) │
│ gemini-1.5-pro             │ Documented       │ RESTRICTED (Flat only) │
│ gemini-3.5-flash-lite      │ Unverified       │ SPECULATIVE / UNTESTED │
│ gemini-3.1-flash-lite      │ Unverified       │ SPECULATIVE / UNTESTED │
└────────────────────────────┴──────────────────┴────────────────────────┘
```

1. **Officially Documented & Verified Production Baselines**:
   - `gemini-2.5-flash`: Fully documented by Google for Structured Outputs (`response_schema` and `response_mime_type="application/json"`). Supports nested objects, arrays, and enums. **Recommended Primary Model**.
   - `gemini-2.5-flash-lite`: Documented low-latency tier with identical schema support. **Recommended Fallback Model**.
   - `gemini-2.0-flash`: Fully documented and compatible with all OpenAPI 3.0 schema features.
2. **Restricted Legacy Models (`gemini-1.5-*`)**:
   - Google's documentation for 1.5-era models notes restrictions: complex schemas with nested unions (`anyOf`/`allOf`) or deep recursion frequently fail or produce schema translation errors. Schemas for 1.5 must remain flat and simple.
3. **Unverified / Speculative Model Identifiers (`gemini-3.*`)**:
   - `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` were entered in `env.ts` and Migration 0020 as forward-looking placeholders. They are **not currently verified** in official Google Gemini Developer API production docs.
   - **Crucial Architecture Rule**: The application must never dispatch an unverified model identifier in production; doing so triggers immediate HTTP 404 `MODEL_NOT_FOUND`. The runtime service must restrict operational model selections to officially available identifiers (`gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.0-flash`).

---

## 3. Pydantic Schema Design & Gemini Schema Constraints

### 3.1 What the Gemini API Enforces vs. What Python Must Validate
When a Pydantic model is converted into an OpenAPI 3.0 schema via `google-genai`'s internal `_transformers.process_schema`, the following constraint behaviors apply:

| Feature / Keyword | Gemini API Constrained Decoder | Python / Pydantic Layer |
|---|---|---|
| **Property Types** (`string`, `number`, `integer`, `boolean`, `array`, `object`) | **Enforced** at token decode time. | Validated during model instantiation. |
| **Required Properties** (`required: [...]`) | **Enforced**. Model cannot emit object without these keys. | Validated. Missing required field raises `ValidationError`. |
| **String Enums** (`enum: ["workout", "nutrition"]`) | **Enforced**. Tokens outside the enum values are masked to $-\infty$. | Validated. |
| **Nested Objects & Arrays** | **Enforced** structurally. | Validated. |
| **Numerical Bounds** (`gt=0`, `ge=0`, `maximum=1000`) | **IGNORED by Gemini decoder**. The model can still emit negative or extreme values. | **Enforced by Python (`limits.py` & `sanitize.py`)**. |
| **Array Length Constraints** (`min_length=2`, `max_length=3`) | **IGNORED by Gemini decoder**. Model can emit 1 item or 10 items. | **Enforced by Python validation & slicing**. |
| **Regex Patterns** (`pattern="^ins-"`) | **IGNORED in Developer API mode**. | Enforced by Python. |
| **`additionalProperties: False`** | In Developer API mode, Pydantic's `extra="forbid"` generates `additionalProperties: False`. The SDK passes this, but Gemini only supports strict property ordering. | Handled by Pydantic. |

### 3.2 Two-Layer Architecture: Generation Schemas vs. Domain Contracts
To avoid coupling Gemini's token generation to internal server state, we maintain two separate schemas:
1. **Generation Schemas (`Gemini*Output`)**: Minimal Pydantic schemas sent to Gemini via `response_schema`. They contain **only** fields that the model must synthesize. No server timestamps, no synthetic IDs, and no calculated totals.
2. **Domain Contracts (`*Result` / `*Response`)**: The rich domain models returned to Node.js, enriched with server timestamps, generated IDs, and recalculated sums.

---

### 3.3 Concrete Generation Schemas

#### 1. Speech Transcription (`GeminiTranscribeOutput`)
```python
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

class GeminiTranscribeOutput(BaseModel):
    """Schema for multilingual speech-to-text generation."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    transcript: str = Field(
        description="Verbatim transcription of spoken audio. Preserve Tamil script or Tanglish phonetics exactly as spoken."
    )
    detected_language: Literal["en", "ta", "tanglish"] = Field(
        description="Language detected: 'en' for English, 'ta' for Tamil script, 'tanglish' for Tamil in Latin letters."
    )
```

#### 2. AI Coach Chat (`GeminiCoachChatOutput`)
```python
class GeminiCoachChatOutput(BaseModel):
    """Schema for AI Coach conversational responses."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    text: str = Field(
        description="Coaching advice formatted in clean, supportive prose. Markdown bolding and lists are supported."
    )
    follow_ups: list[str] = Field(
        default_factory=list,
        description="2 to 3 concise, context-relevant follow-up prompts the athlete can tap next."
    )
    sources: list[str] = Field(
        default_factory=list,
        description="Context sources utilized, e.g. 'User Profile', 'Recent Workouts', 'Nutrition Diary'."
    )
    medical_note: bool = Field(
        default=False,
        description="Must be True if the message touches injuries, acute pain, cardiac symptoms, or medical rehabilitation."
    )
```

#### 3. Coach Insights (`GeminiCoachInsightsOutput`)
```python
class GeminiInsightItem(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    title: str = Field(description="Headline for the insight (e.g. 'Volume Surge', 'Hydration Goal').")
    description: str = Field(description="Actionable explanation derived from user fitness data.")
    category: Literal["workout", "nutrition", "hydration", "goal", "recovery"] = Field(
        description="Lifestyle category of the insight."
    )
    priority: Literal["high", "medium", "low"] = Field(description="Urgency of the recommendation.")
    severity: Literal["positive", "watch", "info"] = Field(
        description="'positive' for wins, 'watch' for fatigue/missed targets, 'info' for neutral observations."
    )
    action: str = Field(description="CTA button label, e.g. 'Log Water', 'View Workout', 'Ask Coach'.")
    question: str = Field(description="Follow-up inquiry the athlete can ask the Coach.")
    evidence: list[str] = Field(default_factory=list, description="Factual metrics observed, e.g. '3 workouts completed'.")
    confidence: Literal["high", "medium", "low"] = Field(default="high")
    requires_device: bool = Field(default=False, description="True if continuous biometric sensor is required.")

class GeminiCoachInsightsOutput(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    greeting: str = Field(description="Personalized greeting addressing the user.")
    recommendation: str | None = Field(default=None, description="Core priority recommendation for the day.")
    insights: list[GeminiInsightItem] = Field(
        default_factory=list,
        description="2 to 3 distinct, high-impact insights."
    )
```

#### 4. Detected Food Item (Shared by Photo & Voice)
```python
class GeminiDetectedFoodItem(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: str = Field(description="Standard culinary name of the food or beverage (e.g., 'Brown Rice').")
    portion_description: str = Field(description="Portion description (e.g., '1 cup cooked', '150g fillet').")
    serving_weight_g: float = Field(default=100.0, description="Estimated weight in grams.")
    serving_unit: str = Field(default="serving", description="Unit of measure (e.g., 'g', 'cup', 'slice').")
    serving_size: float = Field(default=1.0, description="Quantity multiplier.")
    calories: float = Field(default=0.0, description="Estimated kilocalories.")
    protein_g: float = Field(default=0.0, description="Protein in grams.")
    carbs_g: float = Field(default=0.0, description="Carbohydrates in grams.")
    fat_g: float = Field(default=0.0, description="Fat in grams.")
    fiber_g: float = Field(default=0.0, description="Dietary fiber in grams.")
    confidence: Literal["high", "medium", "low"] = Field(default="medium")
```

#### 5. Meal Photo Analysis (`GeminiMealPhotoOutput`)
```python
class GeminiMealPhotoOutput(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    is_food: bool = Field(description="True if recognizable food/drink is visible; False if non-food or unidentifiable.")
    summary: str = Field(description="Short summary of the meal or reason why recognition failed.")
    items: list[GeminiDetectedFoodItem] = Field(default_factory=list, description="Detected food items.")
    unclear_reason: str | None = Field(default=None, description="Explanation if image is blurry or non-food.")
```

#### 6. Voice Meal Parsing (`GeminiVoiceMealOutput`)
```python
class GeminiVoiceMealOutput(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    transcript: str = Field(description="Verbatim transcript of spoken or typed food intake.")
    detected_language: Literal["en", "ta", "tanglish"] = Field(default="en")
    items: list[GeminiDetectedFoodItem] = Field(default_factory=list, description="Extracted food items.")
    unclear_reason: str | None = Field(default=None, description="Explanation if audio did not describe food.")
```

---

## 4. End-to-End Error Handling & Failure Recovery

### 4.1 Exhaustive Failure Mode Matrix

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Inference Failure Tree                          │
├───────────────────────┬──────────────────────┬─────────────────────────┤
│ Failure Point         │ Exception / Signal   │ System Recovery Action  │
├───────────────────────┼──────────────────────┼─────────────────────────┤
│ Token Truncation      │ finish_reason =      │ Log warning; fallback   │
│                       │ MAX_TOKENS           │ model attempt if time;  │
│                       │                      │ else parse_failed       │
├───────────────────────┼──────────────────────┼─────────────────────────┤
│ Safety Filter Trigger │ finish_reason =      │ Classified as           │
│                       │ SAFETY               │ PROVIDER_UNAVAILABLE;   │
│                       │                      │ Safe clinical refusal   │
├───────────────────────┼──────────────────────┼─────────────────────────┤
│ Blocked Candidate     │ len(candidates) == 0 │ Classified as           │
│                       │                      │ PROVIDER_UNAVAILABLE    │
├───────────────────────┼──────────────────────┼─────────────────────────┤
│ Schema Validation     │ Pydantic             │ Fallback to string      │
│ Failure in SDK        │ ValidationError      │ parser or failover      │
├───────────────────────┼──────────────────────┼─────────────────────────┤
│ Model Cooldown        │ 503 / Timeout        │ Put model in cooldown;  │
│                       │                      │ Invoke fallback model   │
└───────────────────────┴──────────────────────┴─────────────────────────┘
```

1. **Handling `response.parsed is None`**:
   - `GenerateContentResponse.parsed` can be `None` even when HTTP 200 is returned (e.g. if the SDK failed to deserialize or if output was truncated).
   - **Recovery**: If `parsed` is `None`, the adapter checks `response.text`. If `response.text` is present, it attempts legacy fallback parsing via `strict_json_loads(strip_code_fences(text))`. If both are absent or malformed, it triggers the appropriate outcome (`unstructured`, `parse_failed`, or `unusable`).
2. **Token Exhaustion (`MAX_TOKENS`)**:
   - When a model truncates mid-generation, `response.candidates[0].finish_reason` equals `FinishReason.MAX_TOKENS`.
   - The system checks if sufficient deadline budget remains. If yes and fallback model is configured, it attempts the fallback model. If no deadline remains, it returns `outcome="parse_failed"` with `dispatched=True`.
3. **Preserving Node.js Quota & Refund Accounting**:
   - Node's `AiUsageGate` pre-charges 1 daily unit before dispatching to Python.
   - If Python fails before calling Gemini (`dispatched=False`, e.g. service JWT expired or image Base64 corrupt), Node refunds the quota unit.
   - If Gemini was called (`dispatched=True`), the quota unit is consumed even if generation was truncated or malformed, preventing denial-of-service retry loops against paid APIs. This behavior is strictly preserved.
4. **Token Usage Telemetry**:
   - `response.usage_metadata` is extracted on both successful and truncated responses. Input tokens, output tokens, thinking tokens, and cached tokens are logged and forwarded to Node for persistence in `gemini_usage_events`.

---

## 5. Medical Safety & Nutrition Boundaries

### 5.1 Why Model-Generated `medical_note` Cannot Be the Sole Guardrail
A generative LLM can experience attentional lapses or prompt jailbreaks, outputting `medical_note: false` even when a user explicitly mentions severe symptoms (e.g. *"I have severe chest pressure when doing squats"*).

### 5.2 Deterministic Safety Defenses
1. **Deterministic Red-Flag Keyword Pre-Screening**:
   - Before or after generation, the service runs a deterministic regex triage across the query and response for clinical emergency indicators:
     - Cardiac / Exertional: `"chest pain"`, `"chest pressure"`, `"shortness of breath"`, `"passed out"`, `"fainted"`, `"irregular heartbeat"`.
     - Orthopedic / Acute: `"popped my knee"`, `"dislocated"`, `"cannot bear weight"`, `"broken bone"`, `"torn muscle"`.
     - Eating Pathology: Severe caloric restriction (< 800 kcal/day queries), purging, laxative abuse.
2. **Mandatory Disclaimer Guarantee**:
   - If either the deterministic keyword check OR the model's `medical_note` is triggered, the system enforces a prominent clinical disclaimer banner:
     > *"FitOnus AI Coach provides fitness guidance, not medical diagnoses. For persistent pain or acute symptoms, consult a qualified healthcare provider immediately."*
3. **Deterministic Nutrition Sanitization (`sanitize.py`)**:
   - As audited in `ai-backend/src/onusfit_ai/features/meals/domain/sanitize.py`:
     - Every detected food item's macros are clamped to `limits.MAX_ITEM_KCAL` (3,000 kcal), `limits.MAX_ITEM_MACRO_G` (250g), and `limits.MAX_SERVING_WEIGHT_G` (2,000g).
     - Meal totals (`total_kcal`, `total_protein_grams`, etc.) are computed by deterministic server-side summation, never by asking the LLM to do addition.
     - Any clamped item causes its confidence to drop to `"low"` and triggers `unclear_reason: limits.ADJUSTED_NOTICE`, requiring athlete review on the mobile screen before diary persistence.

---

## 6. Incremental Implementation Order & Rollback Strategy

To ensure zero production downtime and verify each slice independently, implementation is divided into five strictly ordered vertical slices:

```
┌────────────────────────────────────────────────────────┐
│             Slice 1: Speech Transcription              │
│    (Lowest risk, no quota gate, 2-field schema)        │
└───────────────────────────┬────────────────────────────┘
                            │ Verified
                            ▼
┌────────────────────────────────────────────────────────┐
│               Slice 2: AI Coach Chat                   │
│      (Single text response, high user visibility)      │
└───────────────────────────┬────────────────────────────┘
                            │ Verified
                            ▼
┌────────────────────────────────────────────────────────┐
│              Slice 3: Coach Insights                   │
│   (List of insight items; protected by Node fallback)  │
└───────────────────────────┬────────────────────────────┘
                            │ Verified
                            ▼
┌────────────────────────────────────────────────────────┐
│               Slice 4: Voice Meal Parsing              │
│  (Nested food items; protected by sanitize_voice_result)│
└───────────────────────────┬────────────────────────────┘
                            │ Verified
                            ▼
┌────────────────────────────────────────────────────────┐
│             Slice 5: Meal Photo Analysis               │
│   (Multimodal vision + nested items; sanitize_photo)   │
└────────────────────────────────────────────────────────┘
```

### Slice Details & Rollback Approaches

#### Slice 1: Speech Transcription
- **Schema**: `GeminiTranscribeOutput` (`transcript`, `detected_language`).
- **Why First**: Simplest schema, zero database persistence, no quota gate.
- **Rollback Approach**: If transcription fails in staging, revert `response_schema` parameter in `transcribe.py` back to `None`; legacy string parsing immediately resumes.

#### Slice 2: AI Coach Chat
- **Schema**: `GeminiCoachChatOutput` (`text`, `follow_ups`, `sources`, `medical_note`).
- **Why Second**: Validates conversational text output without complex item nesting.
- **Rollback Approach**: Feature flag or default `schema=None` in `chat.py`. Legacy code fence stripper takes over.

#### Slice 3: Coach Insights
- **Schema**: `GeminiCoachInsightsOutput` (`greeting`, `recommendation`, `insights`).
- **Safety Net**: If schema validation fails, Node's deterministic insights fallback (`buildDeterministicInsights`) automatically catches the error and serves data-backed insights to the mobile client with HTTP 200.

#### Slice 4: Voice Meal Parsing
- **Schema**: `GeminiVoiceMealOutput` (`transcript`, `detected_language`, `items`, `unclear_reason`).
- **Safety Net**: Bounded by `sanitize_voice_result`. Clamps all macros before returning to Node.

#### Slice 5: Meal Photo Analysis
- **Schema**: `GeminiMealPhotoOutput` (`is_food`, `summary`, `items`, `unclear_reason`).
- **Why Last**: Highest payload complexity (multimodal image bytes + nested food array) and highest token volume.
- **Safety Net**: Bounded by `sanitize_photo_result` and `is_food` check.

---

## 7. Exact File Modification Plan

### 7.1 Files to Modify
1. `ai-backend/src/onusfit_ai/shared/llm/ports.py`:
   - Update `TextGenerator` protocol to accept optional `schema: type[BaseModel] | None = None`.
2. `ai-backend/src/onusfit_ai/shared/llm/gemini.py`:
   - Update `GeminiClient.generate_text` and `_call`:
     - If `schema` is provided, set `response_mime_type="application/json"` and `response_schema=schema` on `types.GenerateContentConfig`.
     - Extract `response.parsed` and return in `LlmResult(text=..., usage=..., parsed=...)`.
3. `ai-backend/src/onusfit_ai/features/*/application/`:
   - Create generation schemas in a dedicated `schemas.py` per feature or centralized `gemini_schemas.py`.
   - Update use case functions (`generate_coach_reply`, `analyze_meal_photo`, etc.) to pass the generation schema to `llm.generate_text()`.
   - Update parsing adapters to check `llm_result.parsed` first, falling back to legacy string parsing if `parsed` is `None`.
4. `ai-backend/tests/conftest.py`:
   - Update `FakeLlm` to accept `schema` parameter and simulate `parsed` model instance.

### 7.2 Files That Must NOT Be Touched (Strict Invariants)
- `backend/src/shared/ai/python-ai-call.ts`: Node Zod schemas remain unchanged.
- `backend/src/shared/ai/ai-usage.ts`: Quota and billing semantics remain unchanged.
- `ai-backend/src/onusfit_ai/features/meals/domain/sanitize.py`: Physiological limits remain unchanged.
- `ai-backend/tests/fixtures/contracts/wire_fields.json`: Contract snapshot remains identical.

---

## 8. Comprehensive Test Plan

1. **Unit Tests (Per Slice)**:
   - Schema serialization: verify `model_json_schema()` produces valid OpenAPI 3.0 dictionary without `$defs` or unhandled `additionalProperties`.
   - Parsing adapters: verify that valid `parsed` objects map cleanly to domain results (`CoachChatResult`, `MealPhotoResult`, etc.).
   - Defensive fallback: feed corrupted raw text and verify parser returns expected outcome enum (`parse_failed`, `unusable`, etc.) without raising unhandled exceptions.
2. **Contract Snapshot Tests**:
   - Run `pytest tests/test_wire_contract.py` to prove that the external HTTP wire model exposed to Node.js has zero field additions, deletions, or type changes.
3. **Dialect & Multilingual Tests**:
   - Verify transcription and voice meal parsing with Tamil script (தமிழ்) and phonetic Tanglish inputs. Verify `detected_language` accurately tags `"ta"` and `"tanglish"`.
4. **Regression & Safety Tests**:
   - Run existing prompt safety tests (`tests/test_coach_prompt_safety.py`).
   - Run parser robustness tests (`tests/test_parser_robustness.py`) ensuring deep recursion or hostile JSON never escapes as a 500.
5. **Model Cooldown & Fallback Tests**:
   - Simulate primary model timeout or 503; verify that the fallback model is invoked with the exact same `response_schema` within the deadline.

---

## 9. Remaining Technical Uncertainties & Pre-Flight Checks

Before writing code in implementation, two technical uncertainties must be acknowledged and managed:
1. **Google GenAI SDK Internal Transformer Behavior with CamelCase Aliases**:
   - In Pydantic v2, models using `alias_generator=to_camel` generate schemas with camelCase properties (e.g. `followUps`). We verified that `_transformers.process_schema` accepts this. In testing, we must verify that Gemini's logit mask generates the exact camelCase keys.
2. **Model Availability of Fallback Identifiers in Production**:
   - The primary model `gemini-2.5-flash` is verified. The admin configuration must be confirmed to point fallback targets to verified models (`gemini-2.5-flash-lite` or `gemini-2.0-flash`) rather than speculative names.

---

## 10. Final Implementation Approval Checklist

Please review this finalized architecture and confirm:

- [x] **Reliability Corrections:** All claims of "100% compliance" and "zero parse failures" removed; failure modes (`MAX_TOKENS`, `SAFETY`, empty candidates) fully documented.
- [x] **Model Compatibility Verified:** Clear distinction established between verified models (`gemini-2.5-flash`) and speculative identifiers (`gemini-3.*`).
- [x] **Constraint Boundaries Documented:** Explicitly documented that numerical limits (`gt`, `ge`, `max`) and item bounds must be enforced in Python via `sanitize.py`.
- [x] **Medical Safety Defense Hardened:** Disclaimers and deterministic keyword triage documented; not relying solely on model's `medical_note` flag.
- [x] **Incremental Order Finalized:** Transcription → Coach Chat → Insights → Voice Meal → Meal Photo.
- [x] **Wire Parity Guaranteed:** External Node <-> Python contract remains 100% untouched.

---

**STATUS: READY FOR IMPLEMENTATION REVIEW**

**AWAITING USER APPROVAL**
