# TOPIC 03: Gemini API Integration — KT & Interview Master Guide

> **Module:** OnusFit AI Backend (`ai-backend/src/onusfit_ai/shared/llm/`)  
> **Source Target:** `gemini.py`, `ports.py`, `errors.py`, `dependencies.py`  
> **Learning Status:** COMPLETED  
> **Category:** Large Language Model (LLM) Integration & Resilience Engineering

---

## 1. Executive Summary & Architecture Overview

The OnusFit AI backend interacts directly with Google Gemini using the modern Google GenAI SDK (`google.genai`). Rather than making raw, unguarded API calls, OnusFit wraps Gemini in a resilient, circuit-broken, production-grade client (`GeminiClient`).

### Key Architecture Decisions:
1. **Asynchronous Execution (`sdk.aio`):** Uses non-blocking `sdk.aio.models.generate_content()` so concurrent user requests execute concurrently on the asyncio event loop.
2. **Circuit Breaker (`ModelCooldown`):** If a model fails with a transient error (e.g. 503 unavailable, 429 rate limit), it is placed in cooldown. Subsequent requests skip the broken model immediately without wasting network latency.
3. **Primary ➔ Fallback Routing:** If the primary model fails or is cooling down, the client seamlessly shifts to the fallback model within the remaining deadline budget.
4. **No Blind Retries (`attempts=1`):** SDK-level auto-retries are explicitly disabled (`retry_options=types.HttpRetryOptions(attempts=1)`). In LLM architectures, uncoordinated retries double cost and exhaust quotas.
5. **Protocol Abstraction (`TextGenerator`):** Applications depend on a Python `Protocol` rather than the concrete SDK, allowing 100% offline unit tests with fake LLMs.

---

## 2. Code Reference & Implementation Details

### File: `ai-backend/src/onusfit_ai/shared/llm/gemini.py`

```python
class GeminiClient:
    """The real `TextGenerator` implementation interacting with Google Gemini."""

    async def generate_text(
        self,
        prompt: str,
        *,
        primary_model: str,
        fallback_model: str | None,
        deadline_s: float,
        media: MediaInput | None = None,
        schema: type[BaseModel] | None = None,
    ) -> LlmResult:
        sdk = self._sdk_client()
        started = self._clock()
        deadline = started + deadline_s

        # 1. Evaluate Model Cooldown Execution Plan
        plan = self._build_execution_plan(primary_model, fallback_model)

        # 2. Iterate through plan within deadline budget
        for index, (model, is_fallback) in enumerate(plan):
            remaining = deadline - self._clock()
            if remaining < _MIN_ATTEMPT_SECONDS:
                break

            try:
                response = await self._call(
                    sdk, model, prompt, min(remaining, self._attempt_timeout_s), media, schema=schema
                )
            except Exception as exc:
                last = classify_gemini_error(exc)
                if last.kind != "BAD_REQUEST":
                    self._cooldown.record_failure(model, last.retry_after_seconds)
                # ... check if fallback is possible ...
                continue

            self._cooldown.record_success(model)
            return LlmResult(
                text=(getattr(response, "text", None) or "").strip(),
                usage=_usage_from(response, model, is_fallback, ...),
                parsed=getattr(response, "parsed", None),
                finish_reason=...,
            )
```

---

## 3. Resilient LLM Execution Lifecycle

```text
Node.js Request (Budget: deadline_s = 15s)
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Evaluate Circuit Breaker (ModelCooldown)                 │
│    Is Primary Model (e.g. gemini-2.5-flash) in cooldown?    │
│    ├── NO  -> Plan = [ (primary, False), (fallback, True) ] │
│    └── YES -> Plan = [ (fallback, True) ] (Skip broken model)│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Attempt Primary Model                                    │
│    - Clamp timeout: min(remaining, 20.0s)                   │
│    - Disable SDK retries (attempts=1)                       │
│    - Call sdk.aio.models.generate_content()                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼ Success                             ▼ Transient Failure (503/429)
┌───────────────────────────┐         ┌───────────────────────────┐
│ Record Cooldown Success   │         │ Record Failure in Cooldown│
│ Extract Token Usage       │         │ Check: Remaining time > 1s│
│ Return LlmResult          │         │ Try Fallback Model        │
└───────────────────────────┘         └───────────────────────────┘
```

---

## 4. Error Classification & Fallback Strategy

Source: `ai-backend/src/onusfit_ai/shared/llm/errors.py`

| Error Kind | Cause | Retryable? | Triggers Fallback? |
|:---|:---|:---|:---|
| `UNAVAILABLE` | Gemini server 503 / 500 error | **Yes** | **Yes** (different model might succeed) |
| `RATE_LIMITED` | Model quota / TPM exceeded | **Yes** | **Yes** (fallback model has separate quota) |
| `BAD_REQUEST` | Malformed media, invalid prompt structure | **No** | **No** (same request will fail on all models) |
| `AUTH_ERROR` | Bad API Key | **No** | **No** (Fatal configuration failure) |
| `PROJECT_EXHAUSTED` | GCP Project-wide Daily RPD cap | **No** | **No** (All models under project are blocked) |

---

## 5. 15 Technical Interview Questions & Answers

### A. Beginner Level
1. **Q: What SDK does OnusFit use to communicate with Gemini?**
   *A:* The modern `google.genai` SDK (`genai.Client`), utilizing its asynchronous interface `sdk.aio`.
2. **Q: Why are Gemini API calls declared with `async/await`?**
   *A:* AI model calls are long network I/O operations (1 to 15s). Non-blocking async execution yields the event loop, allowing hundreds of other requests to be handled concurrently.
3. **Q: What are the two types of models configured in a typical request?**
   *A:* Primary model (e.g., `gemini-2.5-flash`) and Fallback model (e.g., `gemini-2.0-flash` or Pro).
4. **Q: What is a deadline budget?**
   *A:* A maximum time window (e.g., 15 seconds) passed from Node.js, within which both primary and fallback attempts must complete or abort.
5. **Q: Where does the Gemini API key come from?**
   *A:* It is read from `Settings.gemini_api_key` in `ai-backend/.env`, injected securely at runtime without being exposed to mobile clients.

### B. Intermediate Level
6. **Q: Why does OnusFit disable SDK-level retries (`retry_options=types.HttpRetryOptions(attempts=1)`)?**
   *A:* Because every token-generating attempt may be billed. Blind retries cause unbounded cost, risk quota exhaustion, and hide systemic failures from observability.
7. **Q: How does the `ModelCooldown` circuit breaker prevent cascading latency?**
   *A:* When a model encounters a transient error, it is recorded in a cooldown tracker. Future requests skip that model immediately instead of waiting for a 20-second timeout before falling back.
8. **Q: Why is `BAD_REQUEST` (400) excluded from recording a cooldown failure?**
   *A:* A 400 error is caused by a malformed request (e.g., corrupted image clip), not an unhealthy model. Triggering a cooldown for a 400 would allow a single user's bad upload to deny service to all other users.
9. **Q: How does OnusFit support multimodal input in the Gemini SDK?**
   *A:* By packing media bytes into `types.Part.from_bytes(data=media.data, mime_type=media.mime_type)` and placing the media part before the prompt text in `contents`.
10. **Q: What token metrics are extracted from Gemini's `usage_metadata`?**
    *A:* `prompt_token_count` (input), `candidates_token_count` (output), `cached_content_token_count` (cached), and `thoughts_token_count` (thinking tokens).

### C. Advanced Level
11. **Q: Why does OnusFit use a Python `Protocol` (`TextGenerator`) instead of coupling use cases to `GeminiClient`?**
    *A:* Inversion of Control. It allows use cases to be tested offline using a `FakeLLM` without real network calls, Gemini API keys, or cloud billing.
12. **Q: When is a fallback model NOT invoked even if the primary fails?**
    *A:* When the failure is non-retryable (e.g., `AUTH_ERROR`, `BAD_REQUEST`), when the failure is project-wide (GCP daily spend cap reached), or when remaining deadline is below `_MIN_ATTEMPT_SECONDS` (1.0s).
13. **Q: How does Gemini Native Structured Outputs work via `response_schema`?**
    *A:* Setting `response_mime_type="application/json"` and passing a Pydantic model to `response_schema` instructs Gemini's constrained decoding engine to guarantee syntactically valid JSON matching that exact schema.
14. **Q: What is the purpose of `_MIN_ATTEMPT_SECONDS = 1.0`?**
    *A:* It prevents initiating an outbound HTTP connection to Gemini when less than 1 second remains before the deadline, preventing wasted network bandwidth and uncollectible billing.
15. **Q: How does OnusFit prevent prompt data leakage in Gemini error logs?**
    *A:* By logging only sanitized categories and error kinds (`category_for_gemini_kind(last.kind)`), strictly suppressing raw provider exception strings that could contain echoed prompt fragments.

