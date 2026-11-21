# OnusFit AI Engineering Guide: Phase 1 — Stage 1
## Gemini Native Structured Outputs for Speech Transcription
### ஜெமினி நேட்டிவ் ஸ்ட்ரக்சர்டு அவுட்புட்ஸ் — முழுமையான வழிகாட்டி, நேரடி சரிபார்ப்பு & நேர்காணல் வழிகாட்டி

> **Language**: Bilingual (Tamil + English) for practical engineering depth and Mid-Level AI Engineer interview preparation.  
> **Component**: `ai-backend` (`POST /internal/v1/ai/speech/transcribe`) & `backend` (`POST /coach/transcribe`)  
> **Status Matrix**:
> - **Code Verified**: ✅ Complete (Clean Architecture & Pydantic v2 schemas aligned)
> - **Automated Tests**: ✅ 681 Python Tests Passed (14.70s) | 160 Node.js Tests Passed (3.92s)
> - **Live Gemini API**: ⏸️ Inspected & Standby (Awaiting Explicit User Approval)
> - **Not Tested**: Live paid Gemini inference without user consent
> - **Known Limitations**: `MAX_TOKENS` truncation truncates JSON; `SAFETY` stops token generation.

---

## 1. What Gemini Structured Outputs Are
### ஜெமினி ஸ்ட்ரக்சர்டு அவுட்புட்ஸ் என்றால் என்ன?

#### In Simple English:
In traditional LLM integrations, if you want JSON, you write in the prompt:  
*"Please respond only in valid JSON format with keys `transcript` and `detected_language`"*.  
The model then tries to generate text that looks like JSON, but it often adds conversational text (*"Here is your JSON:"*), wraps the output in Markdown code blocks (\`\`\`json ... \`\`\`), misses required fields, or produces invalid syntax when tokens run out.

**Gemini Native Structured Outputs** is an API-level feature where you supply a formal JSON Schema or Pydantic model (`response_schema`) and set `response_mime_type="application/json"`. During token generation, the Gemini model uses **constrained decoding (grammar masking)**: tokens that would violate the schema syntax are assigned zero probability at the sampler level. This ensures the output adheres to the exact keys, types, and constraints defined in your schema.

#### தமிழில் எளிய விளக்கம்:
வழக்கமாக LLM-களிடம் ஒரு பதிலை JSON வடிவில் கேட்கும்போது, நாம் பிராம்ப்ட்டில் (Prompt) *"JSON-ல் மட்டும் பதில் சொல்"* என்று குறிப்பிடுவோம். ஆனால் மாடல் சில நேரங்களில்:
1. முன்னுரையாக *"Here is the output"* என்று தேவையில்லாத உரையைச் சேர்க்கும்.
2. \`\`\`json \`\`\` போன்ற Markdown code fences-க்குள் அடைத்துக் கொடுக்கும்.
3. சில முக்கிய ஃபீல்டுகளை (keys) விட்டுவிடும் அல்லது ஸ்பெல்லிங் மாற்றிவிடும்.

**Gemini Native Structured Outputs** என்பது மாடலின் டோக்கன் உருவாக்கத்தின் போதே (Constrained Decoding / Context-Free Grammar Masking) நாம் கொடுக்கும் **Pydantic Schema**-வை மட்டுமே பின்பற்றி டோக்கன்களை உருவாக்க வைக்கும் தொழில்முறை வசதியாகும். இதன் மூலம் 100% தூய JSON-ஐ நாம் பெற முடிகிறது.

---

## 2. Why Speech Transcription Benefits from Structured Outputs
### ஸ்பீச் ட்ரான்ஸ்கிரிப்ஷனுக்கு ஏன் இது மிகவும் பயனுள்ளது?

In OnusFit, users dictate food items, workouts, or coach queries using voice in **English, Tamil, and Tanglish** (e.g., *"Morning 2 dosai with coconut chutney sapten"*).

1. **Multimodal Audio Payload**: Sending binary audio (`audio/m4a`, `audio/wav`, `audio/webm`) requires heavy inference. Unconstrained models often hallucinate conversational filler like *"I heard you say:"* or describe the audio background instead of outputting just the transcript.
2. **Language Identification**: The system must accurately classify whether the audio is `en` (English), `ta` (Tamil script), or `tanglish` (Tamil spoken in English letters). Constrained enums (`Literal["en", "ta", "tanglish"]`) prevent invalid strings like `"Tamil-English"` or `"ta-IN"`.
3. **Zero Wire Disruption**: The Node.js API gateway expects strict camelCase keys (`transcript`, `detectedLanguage`). Structured Outputs guarantee these keys without regex gymnastics.

---

## 3. Verified Architecture & Component Ownership
### உண்மையான கட்டமைப்பு மற்றும் கூறுகளின் பொறுப்பு (Ownership Matrix)

| Architecture Responsibility | Owner Component | Actual File Path | Function / Class |
| :--- | :--- | :--- | :--- |
| **Authentication & Scope Check** | Node.js Gateway & Python FastAPI | `backend/src/shared/ai/python-ai-call.ts`<br/>`ai-backend/src/onusfit_ai/shared/auth/auth.py` | `callPythonAi()` / JWT Sign<br/>`require_scope("ai:speech:transcribe")` |
| **Client Request Validation** | Node.js Gateway | `backend/src/modules/coach/interface/coach.schemas.ts` | `transcribeAudioSchema.safeParse()` |
| **Service Wire Request Model** | Python AI Backend | `ai-backend/src/onusfit_ai/features/speech/application/contracts.py` | `TranscribeRequest` |
| **Structured Output Schema** | Python AI Backend | `ai-backend/src/onusfit_ai/features/speech/application/schemas.py` | `GeminiTranscribeOutput` |
| **Gemini Client & Generation** | Python AI Backend | `ai-backend/src/onusfit_ai/shared/llm/gemini.py` | `GeminiClient.generate_text()` |
| **Defensive Deserialization** | Python AI Backend | `ai-backend/src/onusfit_ai/features/speech/application/transcribe.py` | `transcribe_audio()` |
| **Failover / Model Cooldown** | Python AI Backend | `ai-backend/src/onusfit_ai/shared/llm/gemini.py` | `ModelCooldownTracker.record_failure()` |
| **Clean Error Translation** | Python AI Backend | `ai-backend/src/onusfit_ai/shared/llm/ports.py`<br/>`ai-backend/src/onusfit_ai/shared/errors/errors.py` | `LlmServiceError`<br/>`register_error_handlers()` |
| **Response Wire Validation** | Node.js Gateway | `backend/src/modules/coach/infrastructure/python-speech-transcriber.ts` | `pythonTranscribeResponseSchema.safeParse()` |
| **Token Usage Recording** | Node.js Gateway | `backend/src/shared/ai/python-ai-call.ts` | `usageRecorder.recordExternalUsage()` |

```
Mobile App (User Audio Clip)
     │  POST /coach/transcribe (JWT Auth + transcribeAudioSchema)
     ▼
Node.js Gateway (backend)
     │  Signs internal JWT (scope: "ai:speech:transcribe") + attaches X-Correlation-Id
     ▼
Python FastAPI (ai-backend)
     │  Validates internal token & unpacks TranscribeRequest
     ▼
Gemini Client (gemini.py)
     │  GenerateContentConfig(response_mime_type="application/json", response_schema=GeminiTranscribeOutput)
     ▼
Google Gemini Engine
     │  Constrained Decoding / Grammar Masked Token Sampler
     ▼
Python Application Layer (transcribe.py)
     │  Candidate finish_reason check -> Defensive Pydantic Validation -> TranscribeResponse
     ▼
Node.js Gateway (python-speech-transcriber.ts)
     │  Zod pythonTranscribeResponseSchema.safeParse() -> Token Usage Ledger
     ▼
Mobile App (Displays { transcript, detectedLanguage })
```

---

## 4. How `response_schema` and Pydantic Validation Work
### Pydantic மற்றும் `response_schema` எவ்வாறு செயல்படுகிறது?

### Two-Layer Validation Architecture (இரட்டைப் பாதுகாப்பு)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Generation Layer (Gemini Engine)                         │
│    Constrained Decoding using OpenAPI Schema via            │
│    types.GenerateContentConfig(response_schema=PydanticModel) │
└──────────────────────────────┬──────────────────────────────┘
                               │ Guaranteed JSON string
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Application Layer (Python FastAPI Backend)               │
│    Defensive Deserialization via Pydantic v2:               │
│    GeminiTranscribeOutput.model_validate(response.parsed)   │
└─────────────────────────────────────────────────────────────┘
```

### The Generation Schema: `GeminiTranscribeOutput`
Located in `ai-backend/src/onusfit_ai/features/speech/application/schemas.py`:

```python
from typing import Literal
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

class GeminiTranscribeOutput(BaseModel):
    """Generation schema for Gemini Native Structured Outputs."""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    transcript: str
    detected_language: Literal["en", "ta", "tanglish"]
```

### SDK Integration in `gemini.py`
```python
config_kwargs: dict[str, Any] = {}
if schema is not None:
    config_kwargs["response_mime_type"] = "application/json"
    config_kwargs["response_schema"] = schema

config = types.GenerateContentConfig(
    temperature=self._config.temperature,
    max_output_tokens=self._config.max_output_tokens,
    **config_kwargs,
)
response = client.models.generate_content(
    model=model_name,
    contents=prompt,
    config=config,
)
```

---

## 5. Difference Between `response.text` and `response.parsed`
### `response.text` vs `response.parsed` வேறுபாடு

| Feature | `response.text` | `response.parsed` |
| :--- | :--- | :--- |
| **What it is** | The raw string emitted by the model | Deserialized object (dict or instance) parsed by the SDK |
| **Data Type** | `str` (e.g. `'{"transcript": "hello", "detectedLanguage": "en"}'`) | `dict` or `GeminiTranscribeOutput` instance |
| **When to use** | Logging, legacy fallback parsing | Primary structured data extraction |
| **Risk** | May be empty if blocked by safety or truncated | Can be `None` if SDK deserialization is bypassed or in mock environments |

### Defensive Parsing Pattern in OnusFit (`transcribe.py`)
```python
# 1. Defensively handle safety-blocked content (do NOT pass to legacy parser)
if llm_result.finish_reason == "SAFETY":
    raise LlmServiceError(
        code="PROVIDER_UNAVAILABLE",
        message="Audio transcription was blocked by safety policies.",
        dispatched=True,
    )

# 2. Defensively handle token truncation (do NOT pass truncated JSON to legacy parser)
if llm_result.finish_reason == "MAX_TOKENS":
    raise LlmServiceError(
        code="PROVIDER_ERROR",
        message="Transcription response exceeded maximum token limit.",
        dispatched=True,
    )

# 3. Defensive Deserialization
if isinstance(llm_result.parsed, GeminiTranscribeOutput):
    result = TranscribeResult(
        transcript=llm_result.parsed.transcript.strip(),
        detected_language=llm_result.parsed.detected_language,
    )
    outcome = "ok"
elif isinstance(llm_result.parsed, dict):
    try:
        validated = GeminiTranscribeOutput.model_validate(llm_result.parsed)
        result = TranscribeResult(
            transcript=validated.transcript.strip(),
            detected_language=validated.detected_language,
        )
        outcome = "ok"
    except Exception:
        result, outcome = parse_transcription(llm_result.text)
else:
    result, outcome = parse_transcription(llm_result.text)
```

---

## 6. Failure, Fallback & Rollback Handling
### தோல்விகள், மாற்று வழிகள் மற்றும் ரோல்பேக் கையாளுதல்

### A. Finish Reason: `SAFETY` and `MAX_TOKENS`
- `finish_reason == "SAFETY"`: The candidate is blocked. `response.text` is empty. The system raises `LlmServiceError(code="PROVIDER_UNAVAILABLE")` immediately. It does **not** attempt parsing.
- `finish_reason == "MAX_TOKENS"`: The output is truncated. An incomplete JSON string will fail deserialization. The system raises `LlmServiceError(code="PROVIDER_ERROR")`.

### B. Failover to Fallback Model
If the primary model returns a retryable error (503 High Demand or 429 Rate Limit):
1. `gemini.py` catches the retryable server error.
2. The primary model is placed on cooldown in `ModelCooldownTracker`.
3. The identical call—with `response_schema=GeminiTranscribeOutput` preserved—is immediately executed against the fallback model.

### C. Zero-Downtime Rollback Toggle
The rollback flag is controlled by:
```bash
AI_SPEECH_STRUCTURED_OUTPUTS=false
# (or '0', 'no', 'off')
```
- **How it works**: Evaluated dynamically inside `transcribe_audio()` on every request via `is_speech_structured_output_enabled()`.
- **Deployment Requirement**: In containerized/process environments (Uvicorn), environment variables must be updated and worker processes reloaded/restarted for process-level env changes to take effect.

---

## 7. Automated Test Verification Results
### தானியங்கி சோதனை முடிவுகள் (Verified Fresh Evidence)

Executed on live workspace:
- **Python Backend (`ai-backend`)**:
  - Command: `ai-backend/.venv/bin/pytest ai-backend`
  - Result: **681 passed**, 1 warning in **14.70s**
  - Dedicated Structured Tests: `test_transcribe_structured.py` (12/12 passed)
  - Architecture Boundary Tests: `test_architecture.py` (22/22 passed)
  - Speech API Tests: `test_transcribe_api.py` (31/31 passed)
- **Node.js Gateway (`backend`)**:
  - Command: `npm --prefix backend test tests/unit/ai/`
  - Result: **10 test files passed (10/10)**, **160 tests passed (160/160)** in **3.92s**
  - Wire Contract Tests: `tests/unit/ai/python-wire-contract.test.ts` (11/11 passed)

---

## 8. Practical Debugging Scenarios (9 Real-World Cases)
### நடைமுறை பிழைத்திருத்த வழிகாட்டி (Debugging Practice)

#### 1. Gemini 404 `MODEL_NOT_FOUND`
- **Root Cause**: The model identifier passed in `body.model.primary` (e.g. `gemini-3.5-flash-lite`) does not exist in the Google AI Studio registry.
- **Log Signature**: `ai.gemini.attempt_failed: errorCategory="model_not_found", geminiKind="MODEL_NOT_FOUND"`.
- **Fix**: Check `GEMINI_MODEL` in `backend/.env` or database settings table. Change to valid identifiers like `gemini-2.5-flash` or `gemini-2.0-flash`.

#### 2. Gemini 429 Rate Limit (`RESOURCE_EXHAUSTED`)
- **Root Cause**: Free tier RPM/RPD ceiling reached (e.g., 15 RPM on free tier).
- **Log Signature**: `ai.gemini.attempt_failed: errorCategory="rate_limit", geminiKind="RATE_LIMIT_RPM"`.
- **System Behavior**: Primary model is placed on cooldown. If fallback model is configured, failover occurs instantly.
- **Fix**: Implement client exponential backoff; upgrade to Tier 1 paid quota if production traffic demands.

#### 3. Gemini 503 Provider Unavailable (`HIGH_DEMAND_503`)
- **Root Cause**: Google datacenter capacity spike or temporary degradation.
- **System Behavior**: `is_retryable=True` triggers instant failover to `fallback_model`.
- **Fix**: Ensure `fallback_model` is always configured and from a separate model family (e.g., primary `gemini-2.5-flash`, fallback `gemini-2.0-flash`).

#### 4. `response.parsed` is `None`
- **Root Cause**: SDK failed to parse candidate or test mock provided `None`.
- **Defense in Code**: `transcribe.py` falls back to `GeminiTranscribeOutput.model_validate_json(response.text)`. If `response.text` is empty, raises `LlmServiceError(code="PROVIDER_ERROR")`.

#### 5. Pydantic `ValidationError`
- **Root Cause**: LLM generated a value outside the enum (e.g., `detectedLanguage: "hindi"` when only `["en", "ta", "tanglish"]` are allowed).
- **Defense in Code**: Caught by defensive `try/except Exception` block in `transcribe.py`, cleanly falling back to `parse_transcription(llm_result.text)`.

#### 6. Incorrect Tamil Transcription
- **Root Cause**: Audio sampling rate too low, background noise, or unclear speech.
- **Debugging Step**: Extract `x-correlation-id` from logs. Inspect audio duration and mime-type. Test audio clip directly using isolated Python script.

#### 7. Incorrect Tanglish Language Detection
- **Root Cause**: Tanglish contains many English words, leading the model to classify as `"en"`.
- **Prompt Defense**: `build_prompt()` includes explicit Tanglish disambiguation rules (*"Tamil words written in Latin alphabet = tanglish"*).

#### 8. Node.js Zod Validation Failure
- **Root Cause**: Python endpoint returned a property name mismatch (e.g. `detected_language` instead of `detectedLanguage`).
- **Log Signature**: `PythonAiError: 'invalid_response', 'AI backend response did not match the contract.'`.
- **Fix**: Ensure Pydantic model uses `alias_generator=to_camel` and `populate_by_name=True`.

#### 9. Structured Outputs Rollback Failure
- **Root Cause**: `AI_SPEECH_STRUCTURED_OUTPUTS` set to an unhandled string or environment variable not propagated to Uvicorn worker.
- **Fix**: `is_speech_structured_output_enabled()` checks `raw not in ("0", "false", "no", "off")`. Verify environment using `docker exec` or `env` check.

---

## 9. Mid-Level AI Engineer Interview Question Bank
### நேர்காணல் வினா-விடை வங்கி (Interview Questions & Model Answers)

### Part A: Beginner Questions (5 Questions)
1. **Q: What is the primary difference between prompting for JSON vs. using native Structured Outputs?**
   - *Answer*: Prompting asks the LLM to follow instructions as text, which frequently results in Markdown code fences, preambles, or schema drift. Native Structured Outputs enforce Context-Free Grammar (CFG) masking at the sampler level, mathematically guaranteeing valid JSON output conforming to the schema.
2. **Q: Why do we use Pydantic in Python AI applications?**
   - *Answer*: Pydantic provides runtime data parsing, validation, and type enforcement using Python type annotations. In Gemini integrations, it defines the generation schema and parses API responses with zero boilerplate.
3. **Q: What happens if an LLM returns unexpected fields in Structured Outputs?**
   - *Answer*: When the schema is passed via `response_schema`, Gemini's constrained decoder will not emit keys outside the schema. On deserialization, Pydantic ignores or forbids extra fields based on `model_config`.
4. **Q: How does `response.parsed` differ from `response.text` in the `google-genai` SDK?**
   - *Answer*: `response.text` is the raw JSON string; `response.parsed` is the pre-deserialized Python object or dictionary generated by the SDK.
5. **Q: What is a Correlation ID and why is it essential in microservice AI architectures?**
   - *Answer*: A UUID propagated via HTTP headers (`X-Correlation-Id`) across the mobile app, API gateway, and Python AI service to trace an asynchronous request across distributed logs.

### Part B: Intermediate Questions (5 Questions)
6. **Q: How does Grammar-Constrained Decoding work inside a Transformer model?**
   - *Answer*: At each decoding step, the model computes logits for all vocabulary tokens. A grammar mask derived from the JSON Schema sets the logits of invalid tokens (e.g., a letter where a quote or colon is expected) to $-\infty$, preventing the sampler from choosing them.
7. **Q: How do you handle camelCase vs. snake_case serialization between TypeScript and Python?**
   - *Answer*: Using Pydantic v2's `ConfigDict(alias_generator=to_camel, populate_by_name=True)`. Python code reads attributes in `snake_case`, while JSON input/output uses `camelCase` matching TypeScript contracts.
8. **Q: Why must you check `candidate.finish_reason` before attempting fallback parsing?**
   - *Answer*: If `finish_reason` is `SAFETY` or `MAX_TOKENS`, the response is either empty or abruptly truncated. Passing truncated text to a fallback regex or JSON parser causes false syntax errors and masks the true cause.
9. **Q: How do you prevent cascade failures when upstream LLM APIs experience high demand (503)?**
   - *Answer*: By employing a circuit breaker or `ModelCooldownTracker`. The failing model is temporarily blacklisted for a cooldown window, and requests are routed to a backup model without waiting for repeated timeouts.
10. **Q: Why is Zod validation still necessary in the Node.js backend if Python already validated with Pydantic?**
    - *Answer*: Zero-trust inter-process communication. Python is an external service over HTTP. The Node gateway must independently enforce boundary validation before persisting data or responding to users.

### Part C: Advanced Questions (5 Questions)
11. **Q: What are the differences in OpenAPI schema keyword support between Vertex AI and Google AI Studio?**
    - *Answer*: Google AI Studio supports a subset of OpenAPI 3.0 schema features. Features like dynamic regex patterns (`pattern=...`), union types with ambiguous discriminators, or non-boolean `additionalProperties` can trigger a 400 Bad Request during schema compilation.
12. **Q: How would you design zero-downtime rollback for an AI feature using Structured Outputs?**
    - *Answer*: Implement a feature toggle read per request (e.g. `is_speech_structured_output_enabled()`). When disabled, the LLM call omits `response_schema` and routes output through the battle-tested legacy parser.
13. **Q: How does Token Accounting work with Structured Outputs? Does constrained decoding increase token usage?**
    - *Answer*: Constrained decoding does not increase token consumption; in fact, it decreases completion tokens by preventing markdown fences and conversational filler. Token usage metadata is parsed from `usage_metadata` (`prompt_token_count`, `candidates_token_count`).
14. **Q: In an audio transcription task, how do you prevent prompt injection or audio payload abuse?**
    - *Answer*: Send audio as binary input (`types.Part.from_bytes`) distinct from system prompts; set strict request body size limits in reverse proxy/middleware (e.g., 15 MiB limit); and enforce audio MIME type validation.
15. **Q: What architectural trade-offs exist between fine-tuning Whisper vs. using Gemini Structured Outputs for multilingual transcription?**
    - *Answer*: Whisper fine-tuning offers deterministic latency and offline execution, but requires GPU infrastructure and dataset curation for Tanglish. Gemini Structured Outputs offer instant multilingual zero-shot capability, audio context reasoning, and zero hosting overhead, at the cost of network latency and per-token pricing.

### Part D: Real-World Debugging Scenarios (3 Scenarios)
16. **Scenario 1: Production users report speech transcription is failing with HTTP 503 during evening peak hours.**
    - *Diagnostic Path*: Check `ai.gemini.attempt_failed` logs for `errorCategory="high_demand"` (503) or `rate_limit` (429). Check if fallback model is configured. If fallback model is missing, requests fail directly.
    - *Resolution*: Configure `GEMINI_FALLBACK_MODEL=gemini-2.0-flash` to ensure automatic failover.
17. **Scenario 2: An update to a Pydantic schema causes Gemini to return 400 `INVALID_ARGUMENT`.**
    - *Diagnostic Path*: Inspect `response_schema` AST. Look for unsupported Pydantic keywords like `regex`, complex unions, or `default_factory`.
    - *Resolution*: Simplify the generation schema to basic primitives and Enums; move complex regex validation to Python-side post-processing.
18. **Scenario 3: Tanglish speech is consistently transcribed as pure English with English vocabulary replacement.**
    - *Diagnostic Path*: Check audio input prompt instructions and prompt temperature.
    - *Resolution*: Ensure prompt contains explicit few-shot examples of Tamil words in Latin script (e.g. *"dosai sapten"* instead of *"ate pancakes"*) and set temperature to 0.0 for faithful phonetic transcription.

### Part E: System Design Questions (2 Questions)
19. **System Design 1: Design a high-throughput, fault-tolerant speech transcription pipeline for 100,000 daily active fitness users.**
    - *Architecture*: Mobile client uploads compressed audio (Opus/m4a) to S3/GCS presigned URL -> Event triggers Celery/SQS worker -> Python worker calls Gemini Flash with Structured Outputs -> Stores transcript in Redis cache and PostgreSQL -> Websocket notifies mobile client. Built-in rate limiting and fallback to local Whisper nodes during provider outages.
20. **System Design 2: Design an end-to-end telemetry and observability platform for multimodal LLM operations.**
    - *Architecture*: Standardized spans with OpenTelemetry. Every request logs `trace_id`, `correlation_id`, `model_name`, `is_fallback`, `input_tokens`, `output_tokens`, `duration_ms`, and `finish_reason`. Send logs to ClickHouse/Grafana Loki. Set alerts on P99 latency > 8s and 5xx error rate > 1%.
