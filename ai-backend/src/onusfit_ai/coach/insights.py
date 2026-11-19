"""Coach insights use case: user context -> Gemini -> structured insights (or "unusable").

Pure orchestration (no HTTP, no database). Quota, caching, loading the user's data and the
deterministic fallback all stay in Node.
"""

import logging

from onusfit_ai.coach.insights_parsing import parse_insights_output
from onusfit_ai.contracts.coach_insights import CoachInsightsRequest, CoachInsightsResponse
from onusfit_ai.contracts.common import Usage
from onusfit_ai.llm.gemini import TextGenerator
from onusfit_ai.llm.telemetry import log_ai_call
from onusfit_ai.prompts.coach_insights import PROMPT_VERSION, build_prompt

logger = logging.getLogger("onusfit_ai.coach_insights")


async def generate_coach_insights(
    request: CoachInsightsRequest, llm: TextGenerator, *, trace_id: str
) -> CoachInsightsResponse:
    llm_result = await llm.generate_text(
        build_prompt(request.context, request.lang),
        primary_model=request.model.primary,
        fallback_model=request.model.fallback,
        deadline_s=request.deadline_ms / 1000,
    )
    result, outcome = parse_insights_output(llm_result.text, request.context.profile.display_name)

    usage = llm_result.usage
    # Metadata only: the user's data, the prompt and the reply are never logged.
    log_ai_call(
        logger,
        feature="coach_insights",
        trace_id=trace_id,
        prompt_version=PROMPT_VERSION,
        outcome=outcome,
        usage=usage,
        insights=len(result.insights) if result else 0,
    )
    return CoachInsightsResponse(
        outcome=outcome,
        result=result,
        usage=Usage(**{k: getattr(usage, k) for k in Usage.model_fields}),
        trace_id=trace_id,
    )
