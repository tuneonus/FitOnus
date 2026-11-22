"""AI Coach chat use case: prompt -> Gemini -> parsed reply.

Pure orchestration with no HTTP and no database, so it can be unit-tested with a fake LLM.
Everything stateful (conversation storage, quota, memory consent) stays in Node.
"""

import logging
import os
from collections.abc import Awaitable, Callable
from typing import Any

from onusfit_ai.features.coach.application.parsing import MEMORY_SOURCE, parse_coach_output
from onusfit_ai.features.coach.application.prompts.coach_chat import PROMPT_VERSION, build_prompt
from onusfit_ai.features.coach.application.schemas import GeminiCoachReplyOutput
from onusfit_ai.features.coach.domain.chat import (
    CitationReference,
    CoachChatRequest,
    CoachChatResponse,
    CoachChatResult,
)
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.contracts.tools import TOOL_SOURCE_LABELS
from onusfit_ai.shared.llm.ports import LlmServiceError, TextGenerator
from onusfit_ai.shared.llm.telemetry import log_ai_call
from onusfit_ai.shared.utils.js_compat import strict_json_loads, strip_code_fences

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


async def generate_coach_reply(
    request: CoachChatRequest,
    llm: TextGenerator,
    *,
    trace_id: str,
    tools: list[Any] | None = None,
    tool_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None = None,
) -> CoachChatResponse:
    """Orchestrate coach reply generation: format prompt, call LLM with fallback, and parse reply.

    The LLM client is injected via the TextGenerator protocol to keep the use case testable
    without real network calls or Gemini credentials.
    """
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

    llm_result = await llm.generate_text(
        prompt,
        primary_model=request.model.primary,
        fallback_model=request.model.fallback,
        deadline_s=request.deadline_ms / 1000,
        schema=schema,
        tools=effective_tools,
        tool_handler=effective_tool_handler,
    )

    # 1. Defensively handle safety-blocked content
    if llm_result.finish_reason == "SAFETY":
        raise LlmServiceError(
            code="PROVIDER_UNAVAILABLE",
            message="Coach reply was blocked by safety policies.",
            dispatched=True,
            usage=llm_result.usage,
        )

    # 2. Defensively handle token truncation
    if llm_result.finish_reason == "MAX_TOKENS":
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
