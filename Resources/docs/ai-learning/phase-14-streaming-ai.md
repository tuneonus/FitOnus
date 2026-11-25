# Phase 14: Streaming AI (SSE)

## Overview

Phase 14 adds end-to-end Server-Sent Events (SSE) streaming for the FitOnus AI Coach across:

1. **Mobile (`mobile/`)**: Expo-compatible SSE client (`fetch` `ReadableStream` + `XMLHttpRequest.onprogress` fallback), incremental response rendering, stop generation (`AbortController`), safe progress status labels, and automatic fallback to standard `POST /api/v1/coach/chat`.
2. **Node.js Gateway (`backend/`)**: Authenticated `POST /api/v1/coach/chat/stream` forwarding SSE streams with `AiUsageGate` quota enforcement, rate limiting, `Idempotency-Key` deduplication & replay without double-billing, output safety redaction, backpressure (`res.write` / `drain`), disconnect cancellation, and metadata-only observability.
3. **Python AI Backend (`ai-backend/`)**: `POST /internal/v1/ai/coach/chat/stream` streaming genuine incremental chunks from Google Gemini (`sdk.aio.models.generate_content_stream`) alongside Phase 09 (native), Phase 10 (LangGraph `astream`), and Phase 13 (multi-agent `astream`) execution pipelines, plus periodic SSE heartbeats, deadlines, and clean coroutine/stream cancellation.

All streaming endpoints are **disabled by default** via feature flags (`AI_COACH_STREAMING_ENABLED=false` across Python, Node.js, and `EXPO_PUBLIC_AI_COACH_STREAMING_ENABLED=false` on mobile). Existing non-streaming APIs (`/api/v1/coach/chat`, `/internal/v1/ai/coach/chat`, `wire_fields.json`) remain completely preserved.

---

## Architecture

```
Mobile UI (CoachScreen / CoachStore / sse-client.ts)
  │ POST /api/v1/coach/chat/stream (Accept: text/event-stream, Idempotency-Key)
  │ AbortSignal <── Stop button / New conversation
  ▼
Node.js Express Gateway (coach.controller.ts -> StreamCoachChatUseCase -> PythonCoachStreamService)
  ├─ Security: JWT auth, AI rate limiter, input Zod validation
  ├─ Flag & Quota: 422 FEATURE_DISABLED before quota; AiUsageGate + refund if undispatched
  ├─ Dedup: In-flight conflict guard + bounded replay cache (0 extra quota/LLM calls)
  ├─ Context & Persistence: CoachContextAssembler, idempotent user + final assistant DB save
  └─ Backpressure: Sequential write await + res.once('drain'), disconnect -> AbortController
  ▼
Python FastAPI AI Backend (coach_chat_stream.py -> stream_coach_reply)
  ├─ Auth: Signed HS256 service JWT (iss/aud/scope/rid), correlation & W3C traceparent
  ├─ Execution Modes:
  │    ├─ Direct streaming (prose prompt -> GeminiClient.generate_text_stream)
  │    ├─ Native Agent (stream_native_agent + ToolExecutor safe status labels)
  │    ├─ LangGraph Agent (compiled StateGraph astream + native fallback)
  │    └─ Multi-Agent (compiled Phase 13 StateGraph astream + A2A + Supervisor synthesis)
  └─ Heartbeats, deadline watchdog, asyncio.CancelledError cleanup, metadata telemetry
  ▼
Google Gemini SDK (`sdk.aio.models.generate_content_stream`)
```

---

## Typed SSE Event Contracts

Each SSE frame encodes `id: <seq>`, `event: <type>`, and `data: <json>\n\n` (Pydantic `extra="forbid"` on Python, Zod schemas in Node.js):

| Event | Fields | Purpose |
| --- | --- | --- |
| `start` | `type`, `traceId`, `seq`, `model`, `mode`, `conversationId?`, `timestamp` | Confirms stream open, selected mode (`direct`, `agent_native`, `agent_langgraph`, `multi_agent`), and conversation ID |
| `status` | `type`, `traceId`, `seq`, `stage`, `message`, `toolName?`, `agentRole?`, `timestamp` | Closed-label progress indicator (`Checking your recent workouts...`, `Preparing your personalized reply...`) without internal reasoning or raw tool results |
| `delta` | `type`, `traceId`, `seq`, `textDelta`, `timestamp` | Incremental text token delta (preserves whitespace boundaries; internal `part.thought` filtered out) |
| `complete` | `type`, `traceId`, `seq`, `result`/`response`, `usage?`, `timestamp` | Final validated structured Coach payload (`text`, `followUps`, `sources`, `toolCalls`, `medicalNote`, `citations`, `conversationId`) + token/timing usage |
| `error` | `type`, `traceId`, `seq`, `code`, `message`, `retryable`, `timestamp` | Sanitized error envelope using closed safe message mapping; never exposes stack traces, API keys, or internal URLs |
| `heartbeat` | `type`, `traceId`, `seq`, `timestamp` | Periodic keepalive emitted during slow tool/model pauses (`stream_heartbeat_interval_s`) |

---

## Configuration & Feature Flags

- **Python (`ai-backend/.env.example`)**:
  - `AI_COACH_STREAMING_ENABLED=false` (returns `503 FEATURE_DISABLED` with `dispatched=false` when disabled)
  - `stream_heartbeat_interval_s` (default `5.0`, validated `> 0`)
- **Node.js (`backend/.env.example`)**:
  - `AI_COACH_STREAMING_ENABLED=false` (returns `422 FEATURE_DISABLED` before quota consumption when disabled)
- **Mobile (`mobile/src/shared/constants/featureFlags.ts`)**:
  - `EXPO_PUBLIC_AI_COACH_STREAMING_ENABLED=false` (`AI_COACH_STREAMING_ENABLED` defaults to `false`; mobile continues using `POST /api/v1/coach/chat` until enabled)

---

## Security, Quota, Safety, & Reliability

1. **Authentication & Isolation**: User JWT verified in Node.js; short-lived HS256 service JWT (`iss`, `aud`, `scope: "ai:coach:chat"`, `rid`, `jti`) carries server-derived `userId` to Python.
2. **Quota & Ledger Idempotency**:
   - Disabled feature flag / validation errors fail before `AiUsageGate.run`.
   - Pre-stream rejections (`503 FEATURE_DISABLED`, `ECONNREFUSED`, `401`) leave `dispatched=false` so reserved daily quota units are refunded.
   - `PythonCoachStreamService` records `gemini_usage_events` at most once per `requestId`.
   - Concurrent identical `Idempotency-Key` / `clientMessageId` requests return `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` before quota reservation; completed replays return cached SSE events without re-billing.
3. **Output & Progress Safety**:
   - `part.thought` chunks are discarded in `GeminiClient.generate_text_stream`.
   - Redaction filters scrub `AIza...`, `sk-...`, `Bearer ...`, JWTs, internal URLs/IPs, and XML breakout tags (`<thought>`, `<system>`, `<context_manifest>`) in both Python and Node.js.
   - Agent progress status uses closed human-friendly maps (`SAFE_TOOL_STATUS_MESSAGES`, `SAFE_AGENT_STATUS_MESSAGES`) instead of raw tool inputs/outputs.
4. **Reliability & Fallback**:
   - Gemini fallback model is attempted **only** if primary fails before emitting any text chunk (`not emitted_any_chunk`).
   - LangGraph streaming falls back to `stream_native_agent` only on pre-delta graph failures.
   - Mobile falls back automatically to non-streaming `CoachApi.sendMessage` on pre-delta `422`/`503`/transport failures, preserves streamed partial responses on `Stop` or mid-stream drop, skips malformed JSON frames cleanly, and performs single-flight 401 token refresh.

---

## Performance & Observability

- **Python**: `StreamSessionTracker` & `StreamingMetricsRegistry` (`features/coach/application/stream_telemetry.py`) track TTFT (`ttftMs`), total latency (`durationMs`), active/completed/cancelled/failed stream counts, failure rate, and cancellation rate while emitting metadata-only `ai.stream.*` structured logs (`log_event`).
- **Node.js**: `NodeStreamTracker` & `NodeStreamMetricsCollector` (`shared/ai/streaming-observability.ts`) record TTFT, `p95TtftMs`, duration, malformed event count, cancellation rate, and failure rate without logging prompts, deltas, health metrics, or tokens.

### Limitations & Deferred Integrations

- **`FEATURE_BY_PATH` OpenAPI registration (Phase 17 coordination)**: `ai-backend/src/onusfit_ai/features/coach/presentation/coach_chat_stream.py` temporarily sets `include_in_schema=False` on `/internal/v1/ai/coach/chat/stream` so `shared/observability/observability.py` (edited concurrently by Phase 17) did not need overlapping edits to `FEATURE_BY_PATH`. Post-merge, add `"/internal/v1/ai/coach/chat/stream": "coach_chat"` to `FEATURE_BY_PATH` and remove `include_in_schema=False`.
- **Shared Node AI Metrics Bridge (Phase 17 coordination)**: Streaming metrics use standalone `NodeStreamMetricsCollector` rather than editing `backend/src/shared/ai/ai-metrics.ts`. Post-merge, `NodeStreamTracker` can optionally forward TTFT/stream counters into `defaultAiMetrics`.
- **Multi-instance Idempotency**: Node in-flight/replay deduplication is in-process (`Map`); multi-replica production deployments should either use sticky sessions or shared PostgreSQL idempotency leases when scaling out SSE traffic.
