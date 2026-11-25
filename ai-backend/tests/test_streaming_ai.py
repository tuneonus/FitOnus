"""Comprehensive offline test suite for Phase 14: Streaming AI (SSE)."""

from __future__ import annotations

import asyncio
import json
import sys
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from types import SimpleNamespace
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import pytest
from pydantic import ValidationError
from tests.conftest import FakeLlm, load_request, make_token

from onusfit_ai.features.coach.application.agent_streaming import (
    stream_langgraph_agent,
    stream_multi_agent,
    stream_native_agent,
)
from onusfit_ai.features.coach.application.stream_telemetry import StreamingMetricsRegistry
from onusfit_ai.features.coach.application.streaming import (
    is_coach_streaming_enabled,
    stream_coach_reply,
)
from onusfit_ai.features.coach.domain.chat import CoachChatRequest, UserFitnessContext
from onusfit_ai.features.coach.domain.streaming import (
    CoachStreamConfig,
    safe_agent_progress_message,
    safe_tool_progress_message,
    validate_stream_output_safety,
)
from onusfit_ai.features.mcp.application.a2a import A2AMediator
from onusfit_ai.shared.config.config import get_settings
from onusfit_ai.shared.contracts.common import ModelSelection
from onusfit_ai.shared.contracts.streaming import (
    StreamDeltaEvent,
    StreamErrorEvent,
    StreamStartEvent,
    StreamStatusEvent,
    format_sse_frame,
    sanitize_stream_delta,
    sanitize_stream_error_message,
)
from onusfit_ai.shared.llm.errors import ModelCooldown
from onusfit_ai.shared.llm.gemini import GeminiClient
from onusfit_ai.shared.llm.ports import LlmServiceError


def _parse_sse_frames(raw_text: str) -> list[dict[str, Any]]:
    frames: list[dict[str, Any]] = []
    for block in raw_text.strip().split("\n\n"):
        if not block.strip():
            continue
        event_name = "message"
        data_lines: list[str] = []
        frame_id: str | None = None
        for line in block.splitlines():
            if line.startswith(":"):
                continue
            if line.startswith("event:"):
                event_name = line.split(":", 1)[1].strip()
            elif line.startswith("id:"):
                frame_id = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].strip())
        if data_lines:
            frames.append(
                {
                    "id": frame_id,
                    "event": event_name,
                    "data": json.loads("\n".join(data_lines)),
                }
            )
    return frames


def _sample_coach_request(message: str = "How were my workouts?") -> CoachChatRequest:
    return CoachChatRequest(
        message=message,
        context=UserFitnessContext.model_validate(
            {
                "profile": {
                    "displayName": "Ravi",
                    "age": 31,
                    "sex": "male",
                    "primaryGoal": "hypertrophy",
                },
                "todayNutrition": {
                    "caloriesConsumed": 1900,
                    "proteinGrams": 135,
                    "carbsGrams": 190,
                    "fatGrams": 60,
                    "waterIntakeMl": 2100,
                    "calorieTarget": 2400,
                    "proteinTarget": 160,
                },
                "recentWorkouts": [],
                "todayPlannedWorkout": None,
                "activeGoals": [],
                "latestWeightKg": 76.0,
            }
        ),
        model=ModelSelection(primary="gemini-3.5-flash-lite", fallback="gemini-3.1-flash-lite"),
        deadline_ms=10_000,
    )


def _fake_stream_chunk(
    text: str | None = None,
    *,
    thought: bool = False,
    finish_reason: str | None = None,
    function_calls: list[SimpleNamespace] | None = None,
    usage: tuple[int, int] = (20, 5),
) -> SimpleNamespace:
    parts: list[SimpleNamespace] = []
    if text is not None:
        parts.append(SimpleNamespace(text=text, thought=thought, function_call=None))
    for fc in function_calls or []:
        parts.append(SimpleNamespace(text=None, thought=False, function_call=fc))
    content = SimpleNamespace(role="model", parts=parts)
    candidate = SimpleNamespace(content=content, finish_reason=finish_reason)
    meta = SimpleNamespace(
        prompt_token_count=usage[0],
        candidates_token_count=usage[1],
        cached_content_token_count=0,
        thoughts_token_count=0,
        total_token_count=usage[0] + usage[1],
    )
    return SimpleNamespace(candidates=[candidate], usage_metadata=meta)


class _FakeAsyncModels:
    def __init__(
        self,
        handler: Callable[[str, Any, Any], AsyncIterator[SimpleNamespace]],
    ) -> None:
        self._handler = handler
        self.closed_count = 0

    async def generate_content_stream(
        self,
        *,
        model: str,
        contents: Any,
        config: Any = None,
    ) -> AsyncIterator[SimpleNamespace]:
        gen = self._handler(model, contents, config)
        return gen


class _FakeStreamSdk:
    def __init__(
        self,
        handler: Callable[[str, Any, Any], AsyncIterator[SimpleNamespace]],
    ) -> None:
        self.models_impl = _FakeAsyncModels(handler)
        self.aio = SimpleNamespace(models=self.models_impl)


# --- 1-4: Contracts, Config, & Sanitization ----------------------------------------------


def test_sse_contracts_reject_extra_fields_and_format_wire_frames() -> None:
    with pytest.raises(ValidationError):
        StreamStartEvent(
            trace_id="tr-1",
            request_id="req-1",
            model="gemini-3.5-flash-lite",
            timestamp="2026-11-25T10:00:00Z",
            unexpected="boom",  # type: ignore[call-arg]
        )

    evt = StreamDeltaEvent(
        trace_id="tr-1",
        sequence=2,
        delta="Keep pushing ",
    )
    frame = format_sse_frame("delta", evt, event_id=2)
    assert frame.startswith("id: 2\nevent: delta\ndata: ")
    assert frame.endswith("\n\n")
    parsed = _parse_sse_frames(frame)
    assert parsed[0]["data"]["delta"] == "Keep pushing "


def test_sanitize_stream_delta_preserves_whitespace_and_strips_secrets() -> None:
    assert sanitize_stream_delta(" great job! ") == " great job! "
    redacted = sanitize_stream_delta(
        "Key AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz http://127.0.0.1:8000/v1 <thought>secret</thought> Keep going!"
    )
    assert "AIzaSy" not in redacted
    assert "127.0.0.1" not in redacted
    assert "<thought>" not in redacted
    assert "Keep going!" in redacted


def test_sanitize_error_message_and_tool_status_labels() -> None:
    err_msg = sanitize_stream_error_message(
        "PROVIDER_TIMEOUT",
        "ConnectError http://10.0.0.5:8000 Bearer secret-jwt",
    )
    assert err_msg == "AI request timed out. Please try again."
    assert safe_tool_progress_message("get_recent_workouts") == "Checking your recent workouts..."
    assert safe_tool_progress_message("unlisted_tool") == "Checking your fitness data..."
    assert (
        safe_agent_progress_message("nutrition") == "Evaluating nutrition and macro balance..."
    )


def test_streaming_feature_flag_defaults_disabled_and_validates_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("AI_COACH_STREAMING_ENABLED", raising=False)
    assert is_coach_streaming_enabled() is False

    monkeypatch.setenv("AI_COACH_STREAMING_ENABLED", "true")
    monkeypatch.setenv("AI_SERVICE_JWT_SECRET", "test-secret-test-secret-test-secret-123")
    cfg = get_settings()
    assert cfg.coach_streaming_enabled is True
    assert is_coach_streaming_enabled() is True


# --- 5-9: Gemini SDK Streaming ----------------------------------------------------------


@pytest.mark.asyncio
async def test_gemini_stream_yields_incremental_chunks_and_skips_thought_parts() -> None:
    calls: list[str] = []

    async def stream_handler(model: str, _contents: Any, _config: Any) -> AsyncIterator[SimpleNamespace]:
        calls.append(model)
        yield _fake_stream_chunk("Thinking secret...", thought=True)
        yield _fake_stream_chunk("Great ")
        yield _fake_stream_chunk("workout today!", finish_reason="STOP", usage=(35, 12))

    client = GeminiClient(
        "fake-api-key",
        sdk_client=_FakeStreamSdk(stream_handler),
        cooldown=ModelCooldown(),
    )
    deltas: list[str] = []
    final_chunk = None

    async for chunk in client.generate_text_stream(
        "How did I do?",
        primary_model="gemini-3.5-flash-lite",
        fallback_model="gemini-3.1-flash-lite",
        deadline_s=5.0,
    ):
        if chunk.text_delta:
            deltas.append(chunk.text_delta)
        if chunk.is_final:
            final_chunk = chunk

    assert calls == ["gemini-3.5-flash-lite"]
    assert deltas == ["Great ", "workout today!"]
    assert "Thinking secret" not in "".join(deltas)
    assert final_chunk is not None and final_chunk.usage is not None
    assert final_chunk.usage.total_tokens == 47


@pytest.mark.asyncio
async def test_gemini_stream_fallbacks_once_only_before_first_emitted_chunk() -> None:
    calls: list[str] = []

    async def pre_chunk_failure_handler(
        model: str, _contents: Any, _config: Any
    ) -> AsyncIterator[SimpleNamespace]:
        calls.append(model)
        if model == "gemini-3.5-flash-lite":
            raise RuntimeError("429 RESOURCE_EXHAUSTED on primary")
        yield _fake_stream_chunk("Recovered ", usage=(20, 4))
        yield _fake_stream_chunk("via fallback", finish_reason="STOP", usage=(20, 8))

    client = GeminiClient(
        "fake-api-key",
        sdk_client=_FakeStreamSdk(pre_chunk_failure_handler),
        cooldown=ModelCooldown(),
    )
    chunks: list[str] = []
    is_fb = False
    async for chunk in client.generate_text_stream(
        "Hello",
        primary_model="gemini-3.5-flash-lite",
        fallback_model="gemini-3.1-flash-lite",
        deadline_s=5.0,
    ):
        if chunk.text_delta:
            chunks.append(chunk.text_delta)
        is_fb = chunk.is_fallback

    assert calls == ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
    assert "".join(chunks) == "Recovered via fallback"
    assert is_fb is True


@pytest.mark.asyncio
async def test_gemini_stream_does_not_fallback_after_partial_chunk_emitted() -> None:
    calls: list[str] = []

    async def mid_stream_failure_handler(
        model: str, _contents: Any, _config: Any
    ) -> AsyncIterator[SimpleNamespace]:
        calls.append(model)
        yield _fake_stream_chunk("Partial start ")
        raise RuntimeError("503 service unavailable mid stream")

    client = GeminiClient(
        "fake-api-key",
        sdk_client=_FakeStreamSdk(mid_stream_failure_handler),
        cooldown=ModelCooldown(),
    )
    emitted: list[str] = []
    with pytest.raises(LlmServiceError):
        async for chunk in client.generate_text_stream(
            "Hello",
            primary_model="gemini-3.5-flash-lite",
            fallback_model="gemini-3.1-flash-lite",
            deadline_s=5.0,
        ):
            if chunk.text_delta:
                emitted.append(chunk.text_delta)

    assert calls == ["gemini-3.5-flash-lite"]
    assert emitted == ["Partial start "]


@pytest.mark.asyncio
async def test_gemini_stream_handles_safety_block_and_tool_calling_loop() -> None:
    async def safety_handler(_m: str, _c: Any, _cfg: Any) -> AsyncIterator[SimpleNamespace]:
        yield _fake_stream_chunk("", finish_reason="SAFETY")

    safety_client = GeminiClient(
        "fake-api-key",
        sdk_client=_FakeStreamSdk(safety_handler),
        cooldown=ModelCooldown(),
    )
    with pytest.raises(LlmServiceError) as exc_info:
        async for _chunk in safety_client.generate_text_stream(
            "Unsafe",
            primary_model="gemini-3.5-flash-lite",
            fallback_model=None,
            deadline_s=5.0,
        ):
            pass
    assert "safety" in exc_info.value.message.lower()

    turn = 0
    statuses: list[str] = []

    async def tool_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
        return {"tool": name, "days": args.get("days", 7), "count": 4}

    async def on_tool_status(name: str) -> None:
        statuses.append(name)

    async def tool_stream_handler(
        _m: str, _c: Any, _cfg: Any
    ) -> AsyncIterator[SimpleNamespace]:
        nonlocal turn
        turn += 1
        if turn == 1:
            fc = SimpleNamespace(name="get_recent_workouts", args={"days": 7})
            yield _fake_stream_chunk(None, function_calls=[fc], finish_reason="STOP")
        else:
            yield _fake_stream_chunk("You trained 4 times.", finish_reason="STOP", usage=(30, 10))

    tool_client = GeminiClient(
        "fake-api-key",
        sdk_client=_FakeStreamSdk(tool_stream_handler),
        cooldown=ModelCooldown(),
    )
    collected: list[str] = []
    final_tools: list[str] = []
    async for chunk in tool_client.generate_text_stream(
        "Check my workouts",
        primary_model="gemini-3.5-flash-lite",
        fallback_model=None,
        deadline_s=5.0,
        tools=[{"function_declarations": [{"name": "get_recent_workouts"}]}],
        tool_handler=tool_handler,
        on_tool_status=on_tool_status,
    ):
        if chunk.text_delta:
            collected.append(chunk.text_delta)
        if chunk.is_final:
            final_tools = [t.tool_name for t in chunk.tool_calls]

    assert statuses == ["get_recent_workouts"]
    assert "".join(collected) == "You trained 4 times."
    assert final_tools == ["get_recent_workouts"]


@pytest.mark.asyncio
async def test_gemini_stream_closes_generator_on_cancellation() -> None:
    closed = False

    class CancellableStream:
        def __aiter__(self) -> CancellableStream:
            return self

        async def __anext__(self) -> SimpleNamespace:
            await asyncio.sleep(0.01)
            return _fake_stream_chunk("Chunk ")

        async def aclose(self) -> None:
            nonlocal closed
            closed = True

    client = GeminiClient(
        "fake-api-key",
        sdk_client=_FakeStreamSdk(lambda _m, _c, _cfg: CancellableStream()),
        cooldown=ModelCooldown(),
    )
    stream = client.generate_text_stream(
        "Stream forever",
        primary_model="gemini-3.5-flash-lite",
        fallback_model=None,
        deadline_s=5.0,
    )
    first = await anext(stream)
    assert first.text_delta == "Chunk "
    await stream.aclose()
    assert closed is True


# --- 10-15: FastAPI SSE Endpoint, Heartbeats, Safety, & Privacy Logs --------------------


def test_fastapi_stream_endpoint_returns_503_when_feature_flag_disabled(
    client: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_COACH_STREAMING_ENABLED", "false")
    token = make_token(scope="ai:coach:chat", sub="u-stream-1")
    body = load_request("full")
    res = client.post(
        "/internal/v1/ai/coach/chat/stream",
        json=body,
        headers={"Authorization": f"Bearer {token}", "X-Request-Id": "req-test-1"},
    )
    assert res.status_code == 503
    payload = res.json()
    assert payload["error"]["code"] == "FEATURE_DISABLED"
    assert payload["error"]["dispatched"] is False


def test_fastapi_stream_endpoint_streams_sse_events_and_enforces_scope(
    client: Any,
    fake_llm: FakeLlm,
    monkeypatch: pytest.MonkeyPatch,
    json_logs: Any,
) -> None:
    monkeypatch.setenv("AI_COACH_STREAMING_ENABLED", "true")
    monkeypatch.setenv("AI_COACH_AGENT_ENABLED", "false")
    monkeypatch.setenv("AI_MULTI_AGENT_ENABLED", "false")

    bad_token = make_token(scope="ai:embed", sub="u-stream-2")
    body = load_request("full")
    body["message"] = "SECRET_USER_PROMPT_SHOULD_NOT_LOG"
    forbidden_res = client.post(
        "/internal/v1/ai/coach/chat/stream",
        json=body,
        headers={"Authorization": f"Bearer {bad_token}", "X-Request-Id": "req-test-1"},
    )
    assert forbidden_res.status_code == 401

    token = make_token(scope="ai:coach:chat", sub="u-stream-2")
    fake_llm.stream_chunks = ["Keep up ", "the strong ", "training!"]
    res = client.post(
        "/internal/v1/ai/coach/chat/stream",
        json=body,
        headers={"Authorization": f"Bearer {token}", "X-Request-Id": "req-test-1"},
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")

    frames = _parse_sse_frames(res.text)
    events = [f["event"] for f in frames]
    assert events[0] == "start"
    assert "delta" in events
    assert events[-1] == "complete"
    delta_text = "".join(f["data"]["delta"] for f in frames if f["event"] == "delta")
    assert delta_text == "Keep up the strong training!"
    complete_frame = next(f for f in frames if f["event"] == "complete")
    assert complete_frame["data"]["result"]["text"] == "Keep up the strong training!"

    raw_logs = json_logs.text
    assert "SECRET_USER_PROMPT_SHOULD_NOT_LOG" not in raw_logs
    assert "Keep up the strong training!" not in raw_logs


def test_fastapi_stream_endpoint_preserves_non_streaming_coach_chat_route(
    client: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_COACH_STREAMING_ENABLED", "true")
    unauth_res = client.post("/internal/v1/ai/coach/chat", json={})
    assert unauth_res.status_code == 401
    assert unauth_res.json()["error"]["code"] == "AUTH_INVALID_TOKEN"


@pytest.mark.asyncio
async def test_stream_coach_reply_emits_heartbeats_and_sanitized_midstream_errors() -> None:
    req = _sample_coach_request("Give me a long plan")
    slow_llm = FakeLlm(stream_chunks=["Step 1 ", "Step 2"], stream_delay_s=0.06)
    cfg = CoachStreamConfig(heartbeat_interval_s=0.02)

    events = [
        e
        async for e in stream_coach_reply(
            req,
            slow_llm,
            trace_id="tr-hb-1",
            user_id="u-hb",
            config=cfg,
        )
    ]
    assert events[0].type == "start"
    assert any(e.type == "heartbeat" for e in events)
    assert events[-1].type == "complete"

    failing_llm = FakeLlm(
        stream_chunks=["Partial chunk", "Never"],
        stream_error=LlmServiceError(
            code="PROVIDER_TIMEOUT",
            message="Connect http://10.0.0.4:8000 failed",
            dispatched=True,
        ),
        stream_error_after_chunks=1,
    )
    err_events = [
        e
        async for e in stream_coach_reply(
            req,
            failing_llm,
            trace_id="tr-err-1",
            user_id="u-err",
        )
    ]
    assert isinstance(err_events[-1], StreamErrorEvent)
    assert err_events[-1].code == "PROVIDER_TIMEOUT"
    assert "10.0.0.4" not in err_events[-1].message


@pytest.mark.asyncio
async def test_stream_telemetry_tracks_ttft_latency_and_cancellation() -> None:
    registry = StreamingMetricsRegistry()
    req = _sample_coach_request("Quick check")
    cancel_event = asyncio.Event()
    llm = FakeLlm(stream_chunks=["One", "Two"], stream_delay_s=0.02)

    events: list[Any] = []
    async for evt in stream_coach_reply(
        req,
        llm,
        trace_id="tr-cancel-1",
        user_id="u-cancel",
        cancel_event=cancel_event,
    ):
        events.append(evt)
        if isinstance(evt, StreamDeltaEvent):
            cancel_event.set()

    assert cancel_event.is_set()
    assert not any(e.type == "complete" for e in events)

    registry.record(outcome="completed", duration_ms=520.0, ttft_ms=140.0, chunks=2)
    registry.record(outcome="cancelled", duration_ms=90.0)
    snap = registry.snapshot()
    assert snap["totalStreams"] == 2
    assert snap["cancellationRate"] == 0.5
    assert snap["ttftMs"]["avg"] == 140.0


# --- 16-20: Native Agent, LangGraph, Multi-Agent & Output Safety ------------------------


@pytest.mark.asyncio
async def test_native_agent_streaming_emits_safe_tool_status_without_leaking_results() -> None:
    req = _sample_coach_request("Analyze my workouts and nutrition from the last 7 days")
    llm = FakeLlm(stream_chunks=["Strong ", "upper body progression."])
    events: list[StreamStatusEvent | StreamDeltaEvent] = []
    seq = [0]

    async def emit(event: StreamStatusEvent | StreamDeltaEvent) -> None:
        events.append(event)

    async def tool_handler(tool_name: str, _args: dict[str, Any]) -> dict[str, Any]:
        return {
            "tool": tool_name,
            "secretDbId": "internal-row-999",
            "workouts": [{"name": "Bench 80kg", "durationMinutes": 45}],
        }

    exec_res = await stream_native_agent(
        request=req,
        llm=llm,
        trace_id="tr-native-1",
        user_id="u-native",
        tool_handler=tool_handler,
        emit=emit,
        seq_counter=seq,
    )
    assert exec_res.response.text == "Strong upper body progression."
    status_msgs = [e.message for e in events if isinstance(e, StreamStatusEvent)]
    assert any("workout" in m.lower() or "preparing" in m.lower() for m in status_msgs)
    assert all("internal-row-999" not in m for m in status_msgs)


@pytest.mark.asyncio
async def test_langgraph_stream_executes_and_falls_back_to_native_pre_delta() -> None:
    req = _sample_coach_request("How should I train upper body today?")
    llm = FakeLlm(stream_chunks=["Focus on ", "controlled reps today."])
    events: list[StreamStatusEvent | StreamDeltaEvent] = []

    async def emit(event: StreamStatusEvent | StreamDeltaEvent) -> None:
        events.append(event)

    async def tool_handler(name: str, _args: dict[str, Any]) -> dict[str, Any]:
        return {"tool": name, "ok": True}

    exec_res = await stream_langgraph_agent(
        request=req,
        llm=llm,
        trace_id="tr-lg-1",
        user_id="u-lg",
        tool_handler=tool_handler,
        emit=emit,
        seq_counter=[0],
    )
    assert exec_res.response.text == "Focus on controlled reps today."
    assert any(isinstance(e, StreamStatusEvent) for e in events)
    assert any(isinstance(e, StreamDeltaEvent) for e in events)


@pytest.mark.asyncio
async def test_multi_agent_streaming_with_medical_safety_escalation() -> None:
    req = _sample_coach_request("My chest hurts sharply when squatting, should I push through?")
    llm = FakeLlm(
        stream_chunks=[
            "Stop training immediately and consult a doctor ",
            "about chest pain before resuming exercise.",
        ]
    )
    events: list[StreamStatusEvent | StreamDeltaEvent] = []

    async def emit(event: StreamStatusEvent | StreamDeltaEvent) -> None:
        events.append(event)

    async def tool_handler(name: str, _args: dict[str, Any]) -> dict[str, Any]:
        return {"tool": name}

    res, _usage, _partial = await stream_multi_agent(
        request=req,
        llm=llm,
        trace_id="tr-ma-1",
        user_id="u-ma",
        tool_handler=tool_handler,
        a2a_mediator=A2AMediator(),
        emit=emit,
        seq_counter=[0],
    )
    assert "doctor" in res.text.lower()
    assert res.medical_note is True
    _, detected = validate_stream_output_safety("You have chest pain, talk to a doctor.")
    assert detected is True
