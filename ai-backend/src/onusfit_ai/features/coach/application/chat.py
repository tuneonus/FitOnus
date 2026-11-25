"""AI Coach chat use case: prompt -> Gemini -> parsed reply.

Pure orchestration with no HTTP and no database, so it can be unit-tested with a fake LLM.
Everything stateful (conversation storage, quota, memory consent) stays in Node.
"""

import logging
import os
import time
from collections.abc import Awaitable, Callable
from typing import Any

from onusfit_ai.features.coach.application.agent.executor import AgentExecutor
from onusfit_ai.features.coach.application.agent.graph.executor import (
    LangGraphAgentExecutor,
    get_configured_agent_engine,
)
from onusfit_ai.features.coach.application.multi_agent.graph.executor import (
    MultiAgentCoachExecutor,
)
from onusfit_ai.features.coach.application.parsing import MEMORY_SOURCE, parse_coach_output
from onusfit_ai.features.coach.application.prompts.coach_chat import PROMPT_VERSION, build_prompt
from onusfit_ai.features.coach.application.schemas import GeminiCoachReplyOutput
from onusfit_ai.features.coach.domain.chat import (
    CitationReference,
    CoachChatRequest,
    CoachChatResponse,
    CoachChatResult,
)
from onusfit_ai.features.coach.domain.multi_agent import (
    A2AMediatorProtocol,
    MultimodalMealPort,
    WorkoutPlannerPort,
)
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.contracts.tools import TOOL_SOURCE_LABELS
from onusfit_ai.shared.llm.ports import LlmServiceError, LlmUsage, MediaInput, TextGenerator
from onusfit_ai.shared.llm.telemetry import log_ai_call
from onusfit_ai.shared.logging import (
    MultimodalObservabilityTracker,
    classify_media_validation_error,
)
from onusfit_ai.shared.utils.audio import decode_audio_base64
from onusfit_ai.shared.utils.image import decode_image_base64, strip_jpeg_exif_metadata
from onusfit_ai.shared.utils.js_compat import strict_json_loads, strip_code_fences
from onusfit_ai.shared.utils.media import InvalidMediaError

logger = logging.getLogger("onusfit_ai.coach_chat")


def is_coach_chat_structured_output_enabled() -> bool:
    """Feature-specific rollback toggle for coach chat structured outputs.

    When AI_COACH_CHAT_STRUCTURED_OUTPUTS is set to '0', 'false', 'no', or 'off',
    the coach chat feature reverts to unconstrained generation and legacy parsing.
    """
    raw = os.environ.get("AI_COACH_CHAT_STRUCTURED_OUTPUTS", "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


def is_coach_chat_tools_enabled() -> bool:
    """Feature flag for coach chat function calling tools.

    Defaults to 'false'. Enabled only when AI_COACH_CHAT_TOOLS is set to
    '1', 'true', 'yes', or 'on'.
    """
    raw = os.environ.get("AI_COACH_CHAT_TOOLS", "false").strip().lower()
    return raw in ("1", "true", "yes", "on")


def is_coach_agent_enabled() -> bool:
    """Feature flag for AI Coach Agent mode (Phase 09 & Phase 10).

    Defaults to 'false'. Enabled only when COACH_AGENT_ENABLED or
    AI_COACH_AGENT_ENABLED is set to '1', 'true', 'yes', or 'on'.
    """
    raw = os.environ.get("COACH_AGENT_ENABLED") or os.environ.get("AI_COACH_AGENT_ENABLED", "false")
    return raw.strip().lower() in ("1", "true", "yes", "on")


def is_multi_agent_enabled() -> bool:
    """Validated feature flag for Phase 13 Multi-Agent Coach orchestration.

    Fails closed ('false') when unset or invalid. Enabled only when
    AI_COACH_MULTI_AGENT_ENABLED or COACH_MULTI_AGENT_ENABLED is '1', 'true',
    'yes', or 'on'.
    """
    raw = os.environ.get("AI_COACH_MULTI_AGENT_ENABLED") or os.environ.get(
        "COACH_MULTI_AGENT_ENABLED", "false"
    )
    norm = raw.strip().lower()
    if norm in ("1", "true", "yes", "on"):
        return True
    if norm in ("0", "false", "no", "off", ""):
        return False
    logger.warning("Invalid multi-agent feature flag value; failing closed to disabled")
    return False


async def generate_coach_reply(
    request: CoachChatRequest,
    llm: TextGenerator,
    *,
    trace_id: str,
    user_id: str | None = None,
    tools: list[Any] | None = None,
    tool_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None = None,
    executor: AgentExecutor | LangGraphAgentExecutor | None = None,
    multi_agent_executor: MultiAgentCoachExecutor | None = None,
    mcp_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None = None,
    discovered_tools: list[str] | None = None,
    a2a_mediator: A2AMediatorProtocol | None = None,
    workout_planner: WorkoutPlannerPort | None = None,
    multimodal_port: MultimodalMealPort | None = None,
) -> CoachChatResponse:
    """Orchestrate coach reply generation: format prompt, call LLM with fallback, and parse reply.

    The LLM client is injected via the TextGenerator protocol to keep the use case testable
    without real network calls or Gemini credentials.
    """
    # Validate and EXIF-strip optional multimodal attachments once up front (422 before LLM/quota).
    validated_media: list[MediaInput] = []
    mm_tracker: MultimodalObservabilityTracker | None = None
    if request.audio is not None or request.image is not None:
        att_modality = (
            "multimodal"
            if request.audio is not None and request.image is not None
            else ("image" if request.image is not None else "audio")
        )
        mm_tracker = MultimodalObservabilityTracker(
            modality=att_modality,
            feature="coach_chat",
            trace_id=trace_id,
        )
        val_started = time.monotonic()
        total_media_bytes = 0
        exif_stripped = False
        last_mime = (
            request.image.mime_type
            if request.image
            else (request.audio.mime_type if request.audio else "application/octet-stream")
        )
        try:
            if request.audio is not None:
                decoded_audio = decode_audio_base64(request.audio.base64)
                total_media_bytes += len(decoded_audio)
                validated_media.append(
                    MediaInput(
                        mime_type=request.audio.mime_type,
                        data=decoded_audio,
                    )
                )
            if request.image is not None:
                raw_img = decode_image_base64(
                    request.image.base64, claimed_mime_type=request.image.mime_type
                )
                safe_img = strip_jpeg_exif_metadata(raw_img)
                total_media_bytes += len(safe_img)
                exif_stripped = len(safe_img) != len(raw_img)
                validated_media.append(
                    MediaInput(
                        mime_type=request.image.mime_type,
                        data=safe_img,
                    )
                )
        except InvalidMediaError as exc:
            mm_tracker.record_validation_failure(
                duration_ms=(time.monotonic() - val_started) * 1000.0,
                reason=classify_media_validation_error(str(exc)),
                byte_size=total_media_bytes,
            )
            raise
        if not is_multi_agent_enabled():
            mm_tracker.record_validation_success(
                duration_ms=(time.monotonic() - val_started) * 1000.0,
                byte_size=total_media_bytes,
                mime_type=last_mime,
                exif_stripped=exif_stripped,
            )

    # Phase 13: Coordinated Multi-Agent System behind validated disabled-by-default feature flag.
    if is_multi_agent_enabled():
        ma_exec = multi_agent_executor or MultiAgentCoachExecutor()
        ma_res = await ma_exec.execute(
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
            memory_consent_granted=bool(request.memories),
        )
        llm_usage = LlmUsage(
            model=ma_res.usage.model,
            is_fallback=ma_res.usage.is_fallback,
            input_tokens=ma_res.usage.input_tokens,
            output_tokens=ma_res.usage.output_tokens,
            cached_tokens=ma_res.usage.cached_tokens,
            thinking_tokens=ma_res.usage.thinking_tokens,
            total_tokens=ma_res.usage.total_tokens,
            duration_ms=ma_res.usage.duration_ms,
        )
        log_ai_call(
            logger,
            feature="coach_multi_agent",
            trace_id=trace_id,
            prompt_version="multi_agent_v1",
            outcome="ok",
            usage=llm_usage,
            tool_calls_count=len(ma_res.executed_tools),
        )
        return CoachChatResponse(
            outcome="ok",
            result=ma_res.response,
            usage=ma_res.usage,
            trace_id=trace_id,
        )

    # Phase 09 & 10: When AI Agent mode is enabled and tool execution is available,
    # delegate execution to the configured agent executor (LangGraph or native fallback).
    if is_coach_agent_enabled() and tool_handler is not None:
        agent_exec: AgentExecutor | LangGraphAgentExecutor
        if executor is not None:
            agent_exec = executor
        elif get_configured_agent_engine() == "native":
            agent_exec = AgentExecutor()
        else:
            agent_exec = LangGraphAgentExecutor()
        agent_res = await agent_exec.execute(
            request=request,
            llm=llm,
            trace_id=trace_id,
            user_id=user_id or "authenticated_user",
            tool_handler=tool_handler,
        )
        usage_contract = (
            agent_res.usage
            if agent_res.usage
            else Usage(
                model=request.model.primary,
                is_fallback=False,
                input_tokens=0,
                output_tokens=0,
                cached_tokens=0,
                thinking_tokens=0,
                total_tokens=0,
                duration_ms=0,
            )
        )
        llm_usage = LlmUsage(
            model=usage_contract.model,
            is_fallback=usage_contract.is_fallback,
            input_tokens=usage_contract.input_tokens,
            output_tokens=usage_contract.output_tokens,
            cached_tokens=usage_contract.cached_tokens,
            thinking_tokens=usage_contract.thinking_tokens,
            total_tokens=usage_contract.total_tokens,
            duration_ms=usage_contract.duration_ms,
        )
        log_ai_call(
            logger,
            feature="coach_agent",
            trace_id=trace_id,
            prompt_version="agent_v1",
            outcome="ok",
            usage=llm_usage,
            tool_calls_count=len(agent_res.tool_calls),
        )
        return CoachChatResponse(
            outcome="ok",
            result=agent_res.response,
            usage=usage_contract,
            trace_id=trace_id,
        )

    prompt = build_prompt(
        request.message,
        request.context,
        request.history,
        request.memories,
        request.knowledge,
    )

    use_structured = is_coach_chat_structured_output_enabled()
    schema = GeminiCoachReplyOutput if use_structured else None

    effective_tools = tools if is_coach_chat_tools_enabled() else None
    effective_tool_handler = tool_handler if is_coach_chat_tools_enabled() else None
    media_arg: MediaInput | list[MediaInput] | None = (
        validated_media[0] if len(validated_media) == 1 else (validated_media or None)
    )
    if media_arg is not None:
        prompt += (
            "\n[An attached meal image/audio clip is included; inspect it accurately "
            "and note estimation uncertainty.]"
        )

    try:
        llm_result = await llm.generate_text(
            prompt,
            primary_model=request.model.primary,
            fallback_model=request.model.fallback,
            deadline_s=request.deadline_ms / 1000,
            media=media_arg,
            schema=schema,
            tools=effective_tools,
            tool_handler=effective_tool_handler,
            user_id=user_id,
        )
    except LlmServiceError as exc:
        if mm_tracker is not None:
            mm_tracker.record_processing_completed(
                model=exc.usage.model if exc.usage else request.model.primary,
                outcome="error",
                processing_error=True,
                error_category={
                    "PROVIDER_TIMEOUT": "gemini_timeout",
                    "PROVIDER_RATE_LIMITED": "gemini_rate_limited",
                    "PROVIDER_QUOTA_EXHAUSTED": "gemini_quota_exhausted",
                    "PROVIDER_UNAVAILABLE": "gemini_unavailable",
                    "AI_UNAVAILABLE": "gemini_unavailable",
                    "PROVIDER_AUTH_ERROR": "gemini_auth",
                    "PROVIDER_NOT_CONFIGURED": "gemini_auth",
                }.get(exc.code, "gemini_error"),
            )
        raise

    # 1. Defensively handle safety-blocked content
    if llm_result.finish_reason == "SAFETY":
        if mm_tracker is not None:
            mm_tracker.record_processing_completed(
                model=llm_result.usage.model,
                outcome="safety_blocked",
                processing_error=True,
                error_category="gemini_unavailable",
            )
        raise LlmServiceError(
            code="PROVIDER_UNAVAILABLE",
            message="Coach reply was blocked by safety policies.",
            dispatched=True,
            usage=llm_result.usage,
        )

    # 2. Defensively handle token truncation
    if llm_result.finish_reason == "MAX_TOKENS":
        if mm_tracker is not None:
            mm_tracker.record_processing_completed(
                model=llm_result.usage.model,
                outcome="max_tokens",
                processing_error=True,
                error_category="gemini_error",
            )
        raise LlmServiceError(
            code="PROVIDER_ERROR",
            message="Coach reply exceeded maximum token limit.",
            dispatched=True,
            usage=llm_result.usage,
        )

    # 3. Resolve result and outcome
    result: CoachChatResult
    outcome: str
    executed_tools = (
        [tc.tool_name for tc in llm_result.tool_calls] if llm_result.tool_calls else None
    )

    if use_structured:
        parsed_output: GeminiCoachReplyOutput | None = None

        if isinstance(llm_result.parsed, GeminiCoachReplyOutput):
            parsed_output = llm_result.parsed
        elif isinstance(llm_result.parsed, dict):
            try:
                parsed_output = GeminiCoachReplyOutput.model_validate(llm_result.parsed)
            except Exception:
                parsed_output = None
        elif llm_result.text and llm_result.text.strip():
            # Defensive fallback: strict JSON parsing followed by Pydantic validation
            try:
                data = strict_json_loads(strip_code_fences(llm_result.text))
                if isinstance(data, dict):
                    parsed_output = GeminiCoachReplyOutput.model_validate(data)
            except Exception:
                parsed_output = None

        if parsed_output is None:
            if mm_tracker is not None:
                mm_tracker.record_processing_completed(
                    model=llm_result.usage.model,
                    outcome="parse_failed",
                    processing_error=True,
                    error_category="invalid_ai_response",
                )
            # Observability: log the unparseable attempt before raising controlled error
            log_ai_call(
                logger,
                feature="coach_chat",
                trace_id=trace_id,
                prompt_version=PROMPT_VERSION,
                outcome="unstructured",
                usage=llm_result.usage,
                tool_calls_count=len(executed_tools) if executed_tools else 0,
            )
            msg = (
                "Empty response from Coach Chat model in structured mode."
                if not llm_result.text or not llm_result.text.strip()
                else "Invalid structured response from Coach Chat model."
            )
            raise LlmServiceError(
                code="PROVIDER_ERROR",
                message=msg,
                dispatched=True,
                usage=llm_result.usage,
            )

        sources = list(parsed_output.sources)
        if request.memories and MEMORY_SOURCE not in sources:
            sources.append(MEMORY_SOURCE)
        if executed_tools:
            for name in executed_tools:
                source_label = TOOL_SOURCE_LABELS.get(name)
                if source_label and source_label not in sources:
                    sources.append(source_label)

        # Resolve grounded citations and verified sources
        citations: list[CitationReference] | None = None
        if request.knowledge:
            citations = []
            k_by_title = {k.document_title.lower(): k for k in request.knowledge}
            k_by_slug = {k.document_slug.lower(): k for k in request.knowledge}
            verified_sources: list[str] = []

            for s in sources:
                s_lower = s.strip().lower()
                matched = k_by_title.get(s_lower) or k_by_slug.get(s_lower)
                if not matched:
                    matched = next(
                        (
                            k
                            for title, k in k_by_title.items()
                            if title in s_lower or s_lower in title
                        ),
                        None,
                    )
                if matched:
                    if matched.document_title not in verified_sources:
                        verified_sources.append(matched.document_title)
                    is_duplicate = any(
                        c.document_slug == matched.document_slug
                        and c.chunk_index == matched.chunk_index
                        for c in citations
                    )
                    if not is_duplicate:
                        citations.append(
                            CitationReference(
                                document_slug=matched.document_slug,
                                document_title=matched.document_title,
                                category=matched.category,
                                chunk_index=matched.chunk_index,
                                citation=matched.citation,
                            )
                        )
                else:
                    verified_sources.append(s)
            sources = verified_sources

        result = CoachChatResult(
            text=parsed_output.text,
            follow_ups=list(parsed_output.follow_ups),
            sources=sources,
            medical_note=parsed_output.medical_note,
            blocks=None,
            tool_calls=executed_tools,
            citations=citations,
        )
        outcome = "ok"
    else:
        # Legacy mode: unconstrained generation and legacy parsing
        result, outcome = parse_coach_output(llm_result.text, has_memories=bool(request.memories))
        if executed_tools:
            legacy_sources = list(result.sources)
            for name in executed_tools:
                source_label = TOOL_SOURCE_LABELS.get(name)
                if source_label and source_label not in legacy_sources:
                    legacy_sources.append(source_label)
            result = CoachChatResult(
                text=result.text,
                follow_ups=result.follow_ups,
                sources=legacy_sources,
                medical_note=result.medical_note,
                blocks=result.blocks,
                tool_calls=executed_tools,
                citations=None,
            )

    usage = llm_result.usage
    tool_calls_count = len(executed_tools) if executed_tools else 0
    # Metadata only: the message, memories and reply text are never logged.
    log_ai_call(
        logger,
        feature="coach_chat",
        trace_id=trace_id,
        prompt_version=PROMPT_VERSION,
        outcome=outcome,
        usage=usage,
        tool_calls_count=tool_calls_count,
        memories_count=len(request.memories),
        knowledge_count=len(request.knowledge),
        history_turns=len(request.history),
    )
    if mm_tracker is not None and not is_multi_agent_enabled():
        mm_tracker.record_processing_completed(
            model=usage.model,
            outcome=outcome,
            processing_error=(outcome == "unstructured"),
            error_category=("invalid_ai_response" if outcome == "unstructured" else None),
        )
    return CoachChatResponse(
        outcome=outcome,  # type: ignore[arg-type]
        result=result,
        usage=Usage(
            model=usage.model,
            is_fallback=usage.is_fallback,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cached_tokens=usage.cached_tokens,
            thinking_tokens=usage.thinking_tokens,
            total_tokens=usage.total_tokens,
            duration_ms=usage.duration_ms,
        ),
        trace_id=trace_id,
    )
