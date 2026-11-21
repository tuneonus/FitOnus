"""AI Coach chat use case: prompt -> Gemini -> parsed reply.

Pure orchestration with no HTTP and no database, so it can be unit-tested with a fake LLM.
Everything stateful (conversation storage, quota, memory consent) stays in Node.
"""

import logging
import os

from onusfit_ai.features.coach.application.parsing import MEMORY_SOURCE, parse_coach_output
from onusfit_ai.features.coach.application.prompts.coach_chat import PROMPT_VERSION, build_prompt
from onusfit_ai.features.coach.application.schemas import GeminiCoachReplyOutput
from onusfit_ai.features.coach.domain.chat import (
    CoachChatRequest,
    CoachChatResponse,
    CoachChatResult,
)
from onusfit_ai.shared.contracts.common import Usage
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


async def generate_coach_reply(
    request: CoachChatRequest, llm: TextGenerator, *, trace_id: str
) -> CoachChatResponse:
    """Orchestrate coach reply generation: format prompt, call LLM with fallback, and parse reply.

    The LLM client is injected via the TextGenerator protocol to keep the use case testable
    without real network calls or Gemini credentials.
    """
    prompt = build_prompt(request.message, request.context, request.history, request.memories)

    use_structured = is_coach_chat_structured_output_enabled()
    schema = GeminiCoachReplyOutput if use_structured else None

    llm_result = await llm.generate_text(
        prompt,
        primary_model=request.model.primary,
        fallback_model=request.model.fallback,
        deadline_s=request.deadline_ms / 1000,
        schema=schema,
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
        result = CoachChatResult(
            text=parsed_output.text,
            follow_ups=list(parsed_output.follow_ups),
            sources=sources,
            medical_note=parsed_output.medical_note,
            blocks=None,
        )
        outcome = "ok"
    else:
        # Legacy mode: unconstrained generation and legacy parsing
        result, outcome = parse_coach_output(
            llm_result.text, has_memories=bool(request.memories)
        )

    usage = llm_result.usage
    # Metadata only: the message, memories and reply text are never logged.
    log_ai_call(
        logger,
        feature="coach_chat",
        trace_id=trace_id,
        prompt_version=PROMPT_VERSION,
        outcome=outcome,
        usage=usage,
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
