"""AI Coach chat use case: prompt -> Gemini -> parsed reply.

Pure orchestration with no HTTP and no database, so it can be unit-tested with a fake LLM.
Everything stateful (conversation storage, quota, memory consent) stays in Node.
"""

import logging

from onusfit_ai.coach.parsing import parse_coach_output
from onusfit_ai.contracts.coach_chat import CoachChatRequest, CoachChatResponse
from onusfit_ai.contracts.common import Usage
from onusfit_ai.llm.gemini import TextGenerator
from onusfit_ai.llm.telemetry import log_ai_call
from onusfit_ai.prompts.coach_chat import PROMPT_VERSION, build_prompt

logger = logging.getLogger("onusfit_ai.coach_chat")


async def generate_coach_reply(
    request: CoachChatRequest, llm: TextGenerator, *, trace_id: str
) -> CoachChatResponse:
    prompt = build_prompt(request.message, request.context, request.history, request.memories)

    llm_result = await llm.generate_text(
        prompt,
        primary_model=request.model.primary,
        fallback_model=request.model.fallback,
        deadline_s=request.deadline_ms / 1000,
    )
    result, outcome = parse_coach_output(llm_result.text, has_memories=bool(request.memories))

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
        outcome=outcome,
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
