# OnusFit AI Engineering Guide: Phase 1 — Stage 3
## Gemini Native Structured Outputs for Coach Insights
### கோச் இன்சைட்ஸ் நேட்டிவ் ஸ்ட்ரக்சர்டு அவுட்புட்ஸ் — பொறியியல் ஆவணம்

> **Component**: `ai-backend` (`POST /internal/v1/ai/coach/insights`) & `backend` (Node.js Gateway integration)  
> **Status**: Completed, Verified & Tested (Phase 1 Stage 3)

---

## 1. Architecture Summary

In Stage 3, Coach Insights was migrated from unconstrained prompt-based JSON generation to **Gemini Native Structured Outputs**:
- **Stateless AI Processing**: Node.js retains full ownership of caching (10-minute cache), user fitness context loading, quota gating, and PostgreSQL usage tracking. Python remains purely stateless.
- **Constrained Decoding**: Gemini is configured with `response_mime_type="application/json"` and `response_schema=GeminiCoachInsightsOutput`.
- **Defensive Extraction**: If `response.parsed` is missing, valid JSON in `response.text` is strictly validated with Pydantic. Malformed JSON, invalid enums, empty candidates, or missing fields are strictly rejected with a controlled HTTP 503 error (`PROVIDER_ERROR`).
- **Telemetry Preservation**: Any unparseable model response triggers `log_ai_call` with `outcome="unusable"` before raising an error, ensuring token tracking and call completion events are logged.
- **Legacy Parser Isolation**: Setting `AI_COACH_INSIGHTS_STRUCTURED_OUTPUTS=false` safely reverts to unconstrained generation and legacy `parse_insights_output` parsing.

---

## 2. Actual Generation Schema

Located in `ai-backend/src/onusfit_ai/features/coach/application/schemas.py`:

```python
class GeminiInsightItemOutput(BaseModel):
    """Single insight item in Gemini generation schema."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    id: str | None = None
    title: str = Field(description="Short punchy headline")
    description: str = Field(description="Evidence-based guidance")
    category: Literal["workout", "nutrition", "hydration", "goal", "recovery"] = "workout"
    priority: Literal["high", "medium", "low"] = "medium"
    severity: Literal["positive", "watch", "info"] = "info"
    action: str = "Ask Coach"
    question: str = "How can I improve my progress?"
    evidence: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "high"
    requires_device: bool = False


class GeminiCoachInsightsOutput(BaseModel):
    """Root generation schema for Gemini Native Structured Outputs in Coach Insights."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    greeting: str
    recommendation: str | None = None
    insights: list[GeminiInsightItemOutput] = Field(min_length=1)
```

---

## 3. Existing Contract Mapping

| Python Domain Model (`InsightItem` / `InsightsResult`) | Generation Schema (`GeminiCoachInsightsOutput`) | Wire JSON Key (`to_camel`) | Node.js Zod Contract (`pythonInsightsResponseSchema`) | Source |
| :--- | :--- | :--- | :--- | :--- |
| `greeting: str` | `greeting: str` | `"greeting"` | `z.string()` | Gemini |
| `recommendation: str \| None` | `recommendation: str \| None` | `"recommendation"` | `z.string().nullish()` | Gemini |
| `insights: list[InsightItem]` | `insights: list[...]` | `"insights"` | `z.array(...)` | Gemini |
| `item.id: str` | `item.id: str \| None` | `"id"` | `z.string()` | Gemini / Python fallback |
| `item.category` | `Literal["workout", ...]` | `"category"` | `z.enum([...])` | Gemini |
| `item.priority` | `Literal["high", ...]` | `"priority"` | `z.enum([...])` | Gemini |
| `item.severity` | `Literal["positive", ...]` | `"severity"` | `z.enum([...])` | Gemini |
| `item.requires_device: bool` | `requires_device: bool` | `"requiresDevice"` | `z.boolean()` | Gemini |
| `generated_at: str` | *(Python added)* | `"generatedAt"` | `z.string()` | Python (`_now_iso()`) |
| `has_sufficient_data: bool` | *(Python added)* | `"hasSufficientData"` | `z.boolean()` | Python (`True`) |

---

## 4. Files Changed

1. **`ai-backend/src/onusfit_ai/features/coach/application/schemas.py`** *(Modified)*:
   - Added `GeminiInsightItemOutput` and `GeminiCoachInsightsOutput` with camelCase aliases.
2. **`ai-backend/src/onusfit_ai/features/coach/application/__init__.py`** *(Modified)*:
   - Exported `GeminiCoachInsightsOutput`, `GeminiInsightItemOutput`, and `is_coach_insights_structured_output_enabled`.
3. **`ai-backend/src/onusfit_ai/features/coach/application/insights.py`** *(Modified)*:
   - Integrated `GeminiCoachInsightsOutput` into `generate_coach_insights`.
   - Added `is_coach_insights_structured_output_enabled()` rollback toggle.
   - Added `SAFETY` and `MAX_TOKENS` defensive guards.
   - Implemented strict structured response parsing and failure telemetry.
4. **`ai-backend/tests/test_coach_insights_structured.py`** *(New)*:
   - 22 automated tests covering structured output generation, category fidelity, Tamil/Tanglish, error conditions, and rollback.
5. **`ai-backend/tests/test_coach_insights_api.py`** *(Modified)*:
   - Updated legacy tests to test explicitly under `AI_COACH_INSIGHTS_STRUCTURED_OUTPUTS=false` and added structured-mode rejection tests.

---

## 5. Error Handling & Defense Matrix

| Scenario | Mode | Condition | System Action | Final HTTP Status |
| :--- | :--- | :--- | :--- | :--- |
| **Safety Block** | Any | `finish_reason == "SAFETY"` | Immediately raises `LlmServiceError(code="PROVIDER_UNAVAILABLE")` | 503 |
| **Token Truncation** | Any | `finish_reason == "MAX_TOKENS"` | Immediately raises `LlmServiceError(code="PROVIDER_ERROR")` | 503 |
| **Missing `parsed`** | Structured | `response.parsed is None`, valid JSON in `text` | Strict JSON parse + `GeminiCoachInsightsOutput.model_validate()` | 200 (outcome: `"ok"`) |
| **Malformed JSON / Prose** | Structured | Malformed JSON or plain prose in `response.text` | **Strict Rejection**: logs `unusable` & raises `LlmServiceError(code="PROVIDER_ERROR")` | 503 |
| **Empty Candidate** | Structured | Empty or whitespace response | **Strict Rejection**: logs `unusable` & raises `LlmServiceError(code="PROVIDER_ERROR")` | 503 |
| **Malformed JSON / Prose** | Legacy (`false`) | Malformed JSON or plain prose in `response.text` | Falls back to legacy parser `parse_insights_output` | 200 (outcome: `"unusable"`, result: `null`) |
| **Primary 503 / 429** | Any | Gemini server busy / rate limited | Model put on cooldown; retries on fallback model with schema preserved | 200 (is_fallback: `true`) |
| **Timeout / Deadline** | Any | Exceeds deadline | Fails cleanly before Node timeout margin | 504 |

---

## 6. Rollback Strategy

The Coach Insights structured output pipeline includes an environment variable toggle:
```bash
AI_COACH_INSIGHTS_STRUCTURED_OUTPUTS=false
# Disabling values: "0", "false", "no", "off"
```
- **How it works**: Checked dynamically per request via `is_coach_insights_structured_output_enabled()`.
- **Runtime Impact**: Reverts `schema` passed to Gemini to `None`, running unconstrained generation and legacy `parse_insights_output` parsing.
- **Independence**: Does not affect Coach Chat (`AI_COACH_CHAT_STRUCTURED_OUTPUTS`), Speech Transcription (`AI_SPEECH_STRUCTURED_OUTPUTS`), or Meal Analysis.
- **Process Requirements**: In persistent process environments (such as Uvicorn workers or Docker containers), updating OS environment variables requires a process or worker reload for new values to take effect.

---

## 7. Automated Test Results

- **Python Coach Insights & Regression Tests**:
  - `test_coach_insights_structured.py`: **22/22 passed**
  - `test_coach_insights_api.py`: **32/32 passed**
  - `test_coach_insights_parsing.py`: **42/42 passed**
  - `test_coach_insights_prompt.py`: **28/28 passed**
  - `test_coach_chat_structured.py`: **19/19 passed**
  - `test_coach_chat_api.py`: **23/23 passed**
  - `test_transcribe_structured.py`: **12/12 passed**
  - `test_architecture.py`: **22/22 passed**
  - `test_wire_contract.py`: **2/2 passed**
- **Full Backend Regression Suite**:
  - Python AI Backend: **724 passed**, 1 warning in 16.42s
  - Node.js AI Backend: **160 passed** (10 test files) in 3.65s

---

## 8. Known Limitations

1. **Wearable Sensor Hallucination**: Wearable/device metrics (such as HRV or sleep stages) are governed by strict prompt instructions; structured schema validates category strings (`workout`, `recovery`), but factual device availability is guarded by prompt grounding.
2. **Deterministic Fallback in Node**: If Python fails or returns `outcome="unusable"`, Node's `PythonCoachInsightsService` automatically catches the failure and builds deterministic rule-based insights, ensuring the end-user always receives meaningful fitness guidance.

