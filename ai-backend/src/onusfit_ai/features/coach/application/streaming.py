"""Streaming AI Coach chat use case (Phase 14).

Coordinates feature flag checks, media validation, direct Gemini streaming,
native/LangGraph/multi-agent streaming, cancellation, deadlines, heartbeats,
output safety sanitization, and streaming observability.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from onusfit_ai.features.coach.application.agent.graph.executor import (
    get_configured_agent_engine,
)
from onusfit_ai.features.coach.application.agent_streaming import (
    _stream_llm_prose,
    stream_langgraph_agent,
    stream_multi_agent,
    stream_native_agent,
)
from onusfit_ai.features.coach.application.chat import (
    is_coach_agent_enabled,
    is_coach_chat_tools_enabled,
    is_multi_agent_enabled,
)
from onusfit_ai.features.coach.application.prompts.coach_chat_stream import (
    STREAMING_PROMPT_VERSION,
    build_streaming_prompt,
)
from onusfit_ai.features.coach.application.stream_telemetry import StreamSessionTracker
from onusfit_ai.features.coach.domain.chat import (
    CitationReference,
    CoachChatRequest,
)
from onusfit_ai.features.coach.domain.multi_agent import (
    A2AMediatorProtocol,
    MultimodalMealPort,
    WorkoutPlannerPort,
)
from onusfit_ai.features.coach.domain.streaming import (
    CoachStreamCompleteEvent,
    CoachStreamConfig,
    CoachStreamEvent,
    build_streaming_coach_result,
    safe_tool_progress_message,
)
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.contracts.streaming import (
    StreamDeltaEvent,
    StreamErrorEvent,
    StreamHeartbeatEvent,
    StreamStartEvent,
    StreamStatusEvent,
    is_retryable_stream_error,
    sanitize_stream_delta,
    sanitize_stream_error_message,
)
from onusfit_ai.shared.contracts.tools import TOOL_SOURCE_LABELS
from onusfit_ai.shared.llm.ports import LlmServiceError, LlmUsage, MediaInput, TextGenerator
from onusfit_ai.shared.llm.telemetry import log_ai_call
from onusfit_ai.shared.utils.audio import decode_audio_base64
from onusfit_ai.shared.utils.guardrails import strip_image_metadata
from onusfit_ai.shared.utils.image import decode_image_base64

logger = logging.getLogger("onusfit_ai.coach_chat.stream")


def is_coach_streaming_enabled() -> bool:
    """Feature flag for AI Coach SSE streaming (disabled by default, fail closed)."""
    raw = os.environ.get("AI_COACH_STREAMING_ENABLED") or os.environ.get(
        "COACH_STREAMING_ENABLED", "false"
    )
    norm = raw.strip().lower()
    if norm in ("1", "true", "yes", "on"):
        return True
    if norm in ("0", "false", "no", "off", ""):
        return False
    logger.warning("Invalid coach streaming feature flag value; failing closed to disabled")
    return False


def get_stream_heartbeat_interval_s() -> float:
    """Configured SSE heartbeat interval in seconds (clamped to safe bounds)."""
    raw = os.environ.get("AI_STREAM_HEARTBEAT_INTERVAL_S", "5.0").strip()
    try:
        val = float(raw)
    except ValueError:
        return 5.0
    return max(0.05, min(60.0, val))


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def validate_request_media(request: CoachChatRequest) -> list[MediaInput]:
    """Decode and EXIF-strip optional audio/image attachments before opening an SSE stream."""
    validated: list[MediaInput] = []
    if request.audio is not None:
        validated.append(
            MediaInput(
                mime_type=request.audio.mime_type,
                data=decode_audio_base64(request.audio.base64),
            )
        )
    if request.image is not None:
        raw_img = decode_image_base64(
            request.image.base64, claimed_mime_type=request.image.mime_type
        )
        validated.append(
            MediaInput(
                mime_type=request.image.mime_type,
                data=strip_image_metadata(raw_img),
            )
        )
    return validated


async def stream_coach_reply(
    request: CoachChatRequest,
    llm: TextGenerator,
    *,
    trace_id: str,
    user_id: str | None = None,
    tools: list[Any] | None = None,
    tool_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None = None,
    mcp_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None = None,
    discovered_tools: list[str] | None = None,
    a2a_mediator: A2AMediatorProtocol | None = None,
    workout_planner: WorkoutPlannerPort | None = None,
    multimodal_port: MultimodalMealPort | None = None,
    validated_media: list[MediaInput] | None = None,
    cancel_event: asyncio.Event | None = None,
    config: CoachStreamConfig | None = None,
) -> AsyncIterator[CoachStreamEvent]:
    """Yield typed `CoachStreamEvent` objects over the full request lifecycle.

    Guarantees:
    - Emits `start` first, then `status` / `delta` / `heartbeat`, and exactly one terminal
      `complete` or sanitized `error` event (unless cancelled by caller).
    - Enforces request deadline across all agent/LLM stages.
    - Propagates cooperative cancellation cleanly and aborts upstream Gemini generation.
    """
    stream_cfg = config or CoachStreamConfig(heartbeat_interval_s=get_stream_heartbeat_interval_s())
    media_list = validated_media if validated_media is not None else validate_request_media(request)

    multi_agent_on = is_multi_agent_enabled() and a2a_mediator is not None
    agent_on = is_coach_agent_enabled() and tool_handler is not None
    if multi_agent_on:
        mode = "multi_agent"
    elif agent_on and get_configured_agent_engine() == "native":
        mode = "agent_native"
    elif agent_on:
        mode = "agent_langgraph"
    else:
        mode = "direct"

    tracker = StreamSessionTracker(
        trace_id=trace_id,
        mode=mode,
        model=request.model.primary,
    )
    tracker.mark_started()

    queue: asyncio.Queue[CoachStreamEvent | None] = asyncio.Queue(
        maxsize=max(4, stream_cfg.max_queue_size)
    )
    seq_counter = [0]
    emitted_chars = [0]

    async def _emit(event: StreamStatusEvent | StreamDeltaEvent) -> None:
        if cancel_event is not None and cancel_event.is_set():
            raise asyncio.CancelledError("Stream cancelled")
        if isinstance(event, StreamDeltaEvent):
            if emitted_chars[0] >= stream_cfg.max_output_chars:
                return
            remaining_chars = stream_cfg.max_output_chars - emitted_chars[0]
            if len(event.delta) > remaining_chars:
                event = StreamDeltaEvent(
                    delta=event.delta[:remaining_chars],
                    sequence=event.sequence,
                    trace_id=event.trace_id,
                )
            emitted_chars[0] += len(event.delta)
            tracker.mark_delta()
        elif isinstance(event, StreamStatusEvent):
            tracker.mark_status()
        await queue.put(event)

    async def _produce() -> None:
        deadline_s = request.deadline_ms / 1000.0
        try:
            await queue.put(
                StreamStartEvent(
                    trace_id=trace_id,
                    request_id=trace_id,
                    model=request.model.primary,
                    timestamp=_now_iso(),
                )
            )
            async with asyncio.timeout(deadline_s):
                if multi_agent_on and a2a_mediator is not None:
                    result, usage, partial = await stream_multi_agent(
                        request=request,
                        llm=llm,
                        trace_id=trace_id,
                        user_id=user_id or "authenticated_user",
                        tool_handler=tool_handler,
                        mcp_handler=mcp_handler,
                        discovered_tools=discovered_tools,
                        a2a_mediator=a2a_mediator,
                        workout_planner=workout_planner,
                        multimodal_port=multimodal_port,
                        emit=_emit,
                        seq_counter=seq_counter,
                        validated_media=media_list,
                        cancel_event=cancel_event,
                    )
                    log_ai_call(
                        logger,
                        feature="coach_multi_agent",
                        trace_id=trace_id,
                        prompt_version="multi_agent_stream_v1",
                        outcome="ok",
                        usage=LlmUsage(
                            model=usage.model,
                            is_fallback=usage.is_fallback,
                            input_tokens=usage.input_tokens,
                            output_tokens=usage.output_tokens,
                            cached_tokens=usage.cached_tokens,
                            thinking_tokens=usage.thinking_tokens,
                            total_tokens=usage.total_tokens,
                            duration_ms=usage.duration_ms,
                        ),
                        tool_calls_count=len(result.tool_calls or []),
                    )
                    tracker.finalize_completed(
                        model=usage.model,
                        is_fallback=usage.is_fallback,
                        input_tokens=usage.input_tokens,
                        output_tokens=usage.output_tokens,
                        total_tokens=usage.total_tokens,
                        partial=partial,
                    )
                    await queue.put(
                        CoachStreamCompleteEvent(
                            outcome="ok",
                            result=result,
                            usage=usage,
                            trace_id=trace_id,
                            partial=partial,
                        )
                    )
                elif agent_on:
                    if get_configured_agent_engine() == "native":
                        agent_res = await stream_native_agent(
                            request=request,
                            llm=llm,
                            trace_id=trace_id,
                            user_id=user_id or "authenticated_user",
                            tool_handler=tool_handler,
                            emit=_emit,
                            seq_counter=seq_counter,
                            media=media_list or None,
                            cancel_event=cancel_event,
                        )
                    else:
                        agent_res = await stream_langgraph_agent(
                            request=request,
                            llm=llm,
                            trace_id=trace_id,
                            user_id=user_id or "authenticated_user",
                            tool_handler=tool_handler,
                            emit=_emit,
                            seq_counter=seq_counter,
                            media=media_list or None,
                            cancel_event=cancel_event,
                        )
                    usage_c = agent_res.usage or Usage(
                        model=request.model.primary,
                        is_fallback=False,
                        input_tokens=0,
                        output_tokens=0,
                        cached_tokens=0,
                        thinking_tokens=0,
                        total_tokens=0,
                        duration_ms=0,
                    )
                    log_ai_call(
                        logger,
                        feature="coach_agent",
                        trace_id=trace_id,
                        prompt_version="agent_stream_v1",
                        outcome="ok",
                        usage=LlmUsage(
                            model=usage_c.model,
                            is_fallback=usage_c.is_fallback,
                            input_tokens=usage_c.input_tokens,
                            output_tokens=usage_c.output_tokens,
                            cached_tokens=usage_c.cached_tokens,
                            thinking_tokens=usage_c.thinking_tokens,
                            total_tokens=usage_c.total_tokens,
                            duration_ms=usage_c.duration_ms,
                        ),
                        tool_calls_count=len(agent_res.tool_calls),
                    )
                    tracker.finalize_completed(
                        model=usage_c.model,
                        is_fallback=usage_c.is_fallback,
                        input_tokens=usage_c.input_tokens,
                        output_tokens=usage_c.output_tokens,
                        total_tokens=usage_c.total_tokens,
                    )
                    await queue.put(
                        CoachStreamCompleteEvent(
                            outcome="ok",
                            result=agent_res.response,
                            usage=usage_c,
                            trace_id=trace_id,
                        )
                    )
                else:
                    await _emit(
                        StreamStatusEvent(
                            stage="thinking",
                            message="Thinking about your fitness question...",
                            trace_id=trace_id,
                        )
                    )
                    prompt = build_streaming_prompt(
                        request.message,
                        request.context,
                        request.history,
                        request.memories,
                        request.knowledge,
                        has_media=bool(media_list),
                    )
                    effective_tools = tools if is_coach_chat_tools_enabled() else None
                    effective_tool_handler = tool_handler if is_coach_chat_tools_enabled() else None
                    media_arg: MediaInput | list[MediaInput] | None = (
                        media_list[0] if len(media_list) == 1 else (media_list or None)
                    )
                    stream_fn = getattr(llm, "generate_text_stream", None)
                    accumulated: list[str] = []
                    final_usage: LlmUsage | None = None
                    finish_reason: str | None = None
                    executed_tool_names: list[str] = []

                    if callable(stream_fn):
                        async def _on_tool(tool_name: str) -> None:
                            await _emit(
                                StreamStatusEvent(
                                    stage="tool_calling",
                                    message=safe_tool_progress_message(tool_name),
                                    tool_name=tool_name,
                                    trace_id=trace_id,
                                )
                            )

                        stream_iter = stream_fn(
                            prompt,
                            primary_model=request.model.primary,
                            fallback_model=request.model.fallback,
                            deadline_s=deadline_s,
                            media=media_arg,
                            schema=None,
                            tools=effective_tools,
                            tool_handler=effective_tool_handler,
                            user_id=user_id,
                            on_tool_status=_on_tool,
                        )
                        try:
                            async for chunk in stream_iter:
                                if cancel_event is not None and cancel_event.is_set():
                                    raise asyncio.CancelledError("Stream cancelled")
                                delta = sanitize_stream_delta(chunk.text_delta)
                                if delta:
                                    accumulated.append(delta)
                                    seq = seq_counter[0]
                                    seq_counter[0] += 1
                                    await _emit(
                                        StreamDeltaEvent(
                                            delta=delta, sequence=seq, trace_id=trace_id
                                        )
                                    )
                                if chunk.usage is not None:
                                    final_usage = chunk.usage
                                if chunk.finish_reason is not None:
                                    finish_reason = chunk.finish_reason
                                if chunk.tool_calls:
                                    executed_tool_names = [tc.tool_name for tc in chunk.tool_calls]
                        finally:
                            aclose = getattr(stream_iter, "aclose", None)
                            if callable(aclose):
                                try:
                                    await aclose()
                                except Exception:  # noqa: BLE001
                                    pass

                        if finish_reason == "SAFETY":
                            raise LlmServiceError(
                                code="PROVIDER_UNAVAILABLE",
                                message="Coach reply was blocked by safety policies.",
                                dispatched=True,
                                usage=final_usage,
                            )
                        llm_usage = final_usage or LlmUsage(
                            model=request.model.primary,
                            is_fallback=False,
                            input_tokens=0,
                            output_tokens=0,
                            cached_tokens=0,
                            thinking_tokens=0,
                            total_tokens=0,
                            duration_ms=0,
                        )
                        streamed_text = "".join(accumulated)
                    else:
                        streamed_text, llm_usage = await _stream_llm_prose(
                            llm=llm,
                            prompt=prompt,
                            primary_model=request.model.primary,
                            fallback_model=request.model.fallback,
                            deadline_s=deadline_s,
                            trace_id=trace_id,
                            emit=_emit,
                            seq_counter=seq_counter,
                            media=media_arg,
                            user_id=user_id,
                            cancel_event=cancel_event,
                        )

                    sources = ["Profile", "Today's Nutrition"]
                    for tn in executed_tool_names:
                        lbl = TOOL_SOURCE_LABELS.get(tn)
                        if lbl and lbl not in sources:
                            sources.append(lbl)
                    citations = (
                        [
                            CitationReference(
                                document_slug=k.document_slug,
                                document_title=k.document_title,
                                category=k.category,
                                chunk_index=k.chunk_index,
                                citation=k.citation,
                            )
                            for k in request.knowledge
                        ]
                        if request.knowledge
                        else None
                    )
                    coach_result = build_streaming_coach_result(
                        streamed_text=streamed_text,
                        request=request,
                        tool_calls=executed_tool_names,
                        sources=sources,
                        citations=citations,
                    )
                    log_ai_call(
                        logger,
                        feature="coach_chat",
                        trace_id=trace_id,
                        prompt_version=STREAMING_PROMPT_VERSION,
                        outcome="ok",
                        usage=llm_usage,
                        tool_calls_count=len(executed_tool_names),
                        memories_count=len(request.memories),
                        knowledge_count=len(request.knowledge),
                        history_turns=len(request.history),
                    )
                    partial = finish_reason == "MAX_TOKENS"
                    tracker.finalize_completed(
                        model=llm_usage.model,
                        is_fallback=llm_usage.is_fallback,
                        input_tokens=llm_usage.input_tokens,
                        output_tokens=llm_usage.output_tokens,
                        total_tokens=llm_usage.total_tokens,
                        partial=partial,
                    )
                    await queue.put(
                        CoachStreamCompleteEvent(
                            outcome="ok",
                            result=coach_result,
                            usage=Usage(
                                model=llm_usage.model,
                                is_fallback=llm_usage.is_fallback,
                                input_tokens=llm_usage.input_tokens,
                                output_tokens=llm_usage.output_tokens,
                                cached_tokens=llm_usage.cached_tokens,
                                thinking_tokens=llm_usage.thinking_tokens,
                                total_tokens=llm_usage.total_tokens,
                                duration_ms=llm_usage.duration_ms,
                            ),
                            trace_id=trace_id,
                            partial=partial,
                        )
                    )
        except asyncio.CancelledError:
            tracker.finalize_cancelled(reason="caller_cancelled")
            raise
        except TimeoutError:
            tracker.finalize_failed(code="PROVIDER_TIMEOUT", dispatched=True)
            await queue.put(
                StreamErrorEvent(
                    code="PROVIDER_TIMEOUT",
                    message=sanitize_stream_error_message("PROVIDER_TIMEOUT"),
                    dispatched=True,
                    retryable=True,
                    has_partial=seq_counter[0] > 0,
                    trace_id=trace_id,
                )
            )
        except LlmServiceError as exc:
            tracker.finalize_failed(code=exc.code, dispatched=exc.dispatched)
            await queue.put(
                StreamErrorEvent(
                    code=exc.code,
                    message=sanitize_stream_error_message(exc.code, exc.message),
                    dispatched=exc.dispatched,
                    retryable=is_retryable_stream_error(exc.code),
                    retry_after_seconds=exc.retry_after_seconds,
                    has_partial=seq_counter[0] > 0,
                    trace_id=trace_id,
                )
            )
        except Exception as exc:  # noqa: BLE001 - sanitize unexpected failures, never leak internals
            logger.warning("Unexpected streaming failure (%s)", type(exc).__name__)
            tracker.finalize_failed(code="INTERNAL_ERROR", dispatched=True)
            await queue.put(
                StreamErrorEvent(
                    code="INTERNAL_ERROR",
                    message=sanitize_stream_error_message("INTERNAL_ERROR"),
                    dispatched=True,
                    retryable=False,
                    has_partial=seq_counter[0] > 0,
                    trace_id=trace_id,
                )
            )
        finally:
            await queue.put(None)

    producer_task = asyncio.create_task(_produce())
    last_sent = time.monotonic()

    try:
        while True:
            if cancel_event is not None and cancel_event.is_set():
                tracker.finalize_cancelled(reason="client_disconnected")
                break
            timeout_left = max(
                0.01, stream_cfg.heartbeat_interval_s - (time.monotonic() - last_sent)
            )
            try:
                item = await asyncio.wait_for(queue.get(), timeout=timeout_left)
            except TimeoutError:
                if cancel_event is not None and cancel_event.is_set():
                    tracker.finalize_cancelled(reason="client_disconnected")
                    break
                tracker.mark_heartbeat()
                last_sent = time.monotonic()
                yield StreamHeartbeatEvent(timestamp=_now_iso(), trace_id=trace_id)
                continue

            if item is None:
                break
            last_sent = time.monotonic()
            yield item
    except asyncio.CancelledError:
        tracker.finalize_cancelled(reason="generator_cancelled")
        raise
    finally:
        if not producer_task.done():
            producer_task.cancel()
            try:
                await producer_task
            except (asyncio.CancelledError, Exception):
                pass
