# OnusFit AI Engineering Guide: Phase 1 — Stage 2
## Gemini Native Structured Outputs for AI Coach Chat
### AI கோச் சாட் நேட்டிவ் ஸ்ட்ரக்சர்டு அவுட்புட்ஸ் — பொறியியல் ஆவணம்

> **Component**: `ai-backend` (`POST /internal/v1/ai/coach/chat`) & `backend` (Node.js Gateway integration)  
> **Status**: Completed, Verified & Hardened (Phase 1 Stage 2.1)

---

## 1. Architecture Changes

In Stage 2, AI Coach Chat was migrated from unconstrained prompt-based JSON text generation and markdown stripping to **Gemini Native Structured Outputs**:
- **Prompt Isolation**: Preserved 100% prompt parity and golden file compliance (`build_prompt` and system rules remain identical).
- **Constrained Decoding**: Gemini is passed `response_mime_type="application/json"` and `response_schema=GeminiCoachReplyOutput`.
- **Defensive Ingestion**:
  - In structured mode (`AI_COACH_CHAT_STRUCTURED_OUTPUTS=true`), valid parsed objects or strictly validated JSON text resolve to `outcome="ok"`.
  - Malformed JSON, arbitrary prose, empty candidates, or invalid field types are strictly rejected with controlled errors (`PROVIDER_ERROR`).
  - In legacy mode (`AI_COACH_CHAT_STRUCTURED_OUTPUTS=false`), unconstrained responses fall back to `parse_coach_output` (`outcome="unstructured"`).
- **Safety & Disclaimers**: Preserved `medicalNote: bool` detection, medical symptom safety guidance, and memory source injection (`"AI Memory"`).
- **Clean Architecture Boundaries**: Maintained pure application layer without web framework or SDK imports; exceptions raised via pure `LlmServiceError`.

---

## 2. Schema Design

### Generation Schema: `GeminiCoachReplyOutput`
Located in `ai-backend/src/onusfit_ai/features/coach/application/schemas.py`:

```python
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class GeminiCoachReplyOutput(BaseModel):
    """Generation schema for Gemini Native Structured Outputs in Coach Chat."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    text: str
    follow_ups: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    medical_note: bool = False
```

### Schema Compatibility & Wire Contract Mapping

| Python Domain (`CoachChatResult`) | Generation Schema (`GeminiCoachReplyOutput`) | Wire JSON (`to_camel`) | Node.js Zod (`pythonChatResponseSchema`) | Mobile Contract (`CoachResponse`) |
| :--- | :--- | :--- | :--- | :--- |
| `text: str` | `text: str` | `"text"` | `z.string()` | `text: string` |
| `follow_ups: list[str]` | `follow_ups: list[str]` | `"followUps"` | `z.array(z.string())` | `followUps: string[]` |
| `sources: list[str]` | `sources: list[str]` | `"sources"` | `z.array(z.string())` | `sources: string[]` |
| `medical_note: bool \| None` | `medical_note: bool` | `"medicalNote"` | `z.boolean().nullish()` | `medicalNote?: boolean` |
| `blocks: list \| None = None` | *(Excluded from LLM)* | `"blocks": null` | `z.array(...).nullish()` | *(Blocks untouched)* |

> **Audit M5 Compliance**: `blocks` is deliberately excluded from Gemini's schema. The model is never asked to generate blocks; `blocks` remains `None` to prevent unvetted actions or writes.

---

## 3. Files Changed

1. **`ai-backend/src/onusfit_ai/features/coach/application/schemas.py`** *(New)*:
   - Defined `GeminiCoachReplyOutput` with camelCase aliasing.
2. **`ai-backend/src/onusfit_ai/features/coach/application/__init__.py`** *(Modified)*:
   - Exported `GeminiCoachReplyOutput` and `is_coach_chat_structured_output_enabled`.
3. **`ai-backend/src/onusfit_ai/features/coach/application/chat.py`** *(Modified)*:
   - Integrated `GeminiCoachReplyOutput` with `llm.generate_text`.
   - Added `is_coach_chat_structured_output_enabled()` rollback toggle.
   - Added candidate `finish_reason` safety and truncation handling.
   - Implemented strict structured validation vs. legacy parsing.
4. **`ai-backend/tests/test_coach_chat_structured.py`** *(New)*:
   - 19 focused unit and integration tests covering structured response, field compatibility, history, fitness context, Tamil/Tanglish, defensive fallbacks, safety blocks, truncation, failover, and rollback.
5. **`ai-backend/tests/test_coach_chat_api.py`** *(Modified)*:
   - Added `test_unstructured_model_reply_is_rejected_in_structured_mode` and verified legacy fallback test.

---

## 4. Error Handling & Defense Matrix (Hardened in Stage 2.1)

| Scenario | Mode | Condition | System Action | Final HTTP Status |
| :--- | :--- | :--- | :--- | :--- |
| **Safety Block** | Any | `finish_reason == "SAFETY"` | Immediately raises `LlmServiceError(code="PROVIDER_UNAVAILABLE")` | 503 |
| **Token Truncation** | Any | `finish_reason == "MAX_TOKENS"` | Immediately raises `LlmServiceError(code="PROVIDER_ERROR")` | 503 |
| **Missing `parsed`** | Structured | `response.parsed is None`, valid JSON in `text` | Strict JSON parse + `GeminiCoachReplyOutput.model_validate()` | 200 (outcome: `"ok"`) |
| **Malformed JSON / Prose** | Structured | Malformed JSON or plain prose in `response.text` | **Strict Rejection**: logs `unstructured` & raises `LlmServiceError(code="PROVIDER_ERROR")` | 503 |
| **Empty Response** | Structured | Empty or whitespace candidate | **Strict Rejection**: logs `unstructured` & raises `LlmServiceError(code="PROVIDER_ERROR")` | 503 |
| **Malformed JSON / Prose** | Legacy (`false`) | Malformed JSON or plain prose in `response.text` | Falls back to legacy parser `parse_coach_output(raw_text)` | 200 (outcome: `"unstructured"`) |
| **Primary 503 / 429** | Any | Gemini server busy / rate limited | Model put on cooldown; retries on fallback model with schema preserved | 200 (is_fallback: `true`) |
| **Timeout / Deadline** | Any | Exceeds deadline | Fails cleanly before Node timeout margin | 504 |

> **Hardening Rule**: In structured mode (`AI_COACH_CHAT_STRUCTURED_OUTPUTS=true`), the system **never** silently coerces malformed JSON or unconstrained prose into a successful response. It returns a controlled 503 error (`PROVIDER_ERROR`, `dispatched=True`) while logging failure telemetry with `outcome="unstructured"`. Legacy parser fallback behavior is preserved strictly when `AI_COACH_CHAT_STRUCTURED_OUTPUTS=false`.

---

## 5. Rollback Strategy

The Coach Chat structured output pipeline includes an environment variable toggle:
```bash
AI_COACH_CHAT_STRUCTURED_OUTPUTS=false
# Disabling values: "0", "false", "no", "off"
```
- **How it works**: Evaluated dynamically per request via `is_coach_chat_structured_output_enabled()`.
- **Runtime Impact**: Reverts `schema` passed to Gemini to `None`, running unconstrained generation and legacy `parse_coach_output` parsing.
- **Independence**: Does not affect Speech Transcription (`AI_SPEECH_STRUCTURED_OUTPUTS`), Coach Insights, or Meal Analysis.
- **Process Requirements**: In persistent process environments (such as Uvicorn workers or Docker containers), updating OS environment variables requires a process or worker reload for new values to take effect.

---

## 6. Test Baseline & Evidence

Latest verified test baseline:
- **Python Coach Chat & Regression Tests**:
  - `test_coach_chat_structured.py`: 19/19 passed
  - `test_coach_chat_api.py`: 23/23 passed
  - `test_coach_chat_parsing.py`: 7/7 passed
  - `test_coach_chat_prompt.py`: 8/8 passed
  - `test_observability.py`: 84/84 passed
  - `test_architecture.py`: 22/22 passed
  - `test_transcribe_structured.py`: 12/12 passed
  - `test_wire_contract.py`: 2/2 passed
- **Full Backend Regression Suite**:
  - Python AI Backend: **701 passed**, 1 warning (HMAC key length in test token generator) in 16.13s
  - Node.js AI Backend: **160 passed** (10 test files) in 4.34s

---

## 7. Known Limitations

1. **Medical Advice Boundary**: Structured Outputs validate the structure (`medicalNote: bool`), not the clinical accuracy of the advice. Deterministic prompt guidance, `medicalNote` flagging, and disclaimer blocks remain mandatory.
2. **Context Window / Token Budget**: Coach Chat carries up to 20 chat turns and 30 user fitness memories. In high-context conversations, output tokens must be guarded against `MAX_TOKENS` truncation.
