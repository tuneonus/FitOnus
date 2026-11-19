"""Coach insights use case: user context -> Gemini -> structured insights (or "unusable").

Pure orchestration (no HTTP, no database). Quota, caching, loading the user's data and the
deterministic fallback all stay in Node.
"""

import logging

from onusfit_ai.coach.insights_parsing import parse_insights_output
from onusfit_ai.contracts.coach_insights import CoachInsightsRequest, CoachInsightsResponse
from onusfit_ai.contracts.common import Usage
from onusfit_ai.llm.gemini import TextGenerator
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
    logger.info(
        "coach_insights trace=%s prompt=%s model=%s fallback=%s outcome=%s insights=%s tokens=%s "
        "duration_ms=%s",
        trace_id,
        PROMPT_VERSION,
        usage.model,
        usage.is_fallback,
        outcome,
        len(result.insights) if result else 0,
        usage.total_tokens,
        usage.duration_ms,
    )
    return CoachInsightsResponse(
        outcome=outcome,
        result=result,
        usage=Usage(**{k: getattr(usage, k) for k in Usage.model_fields}),
        trace_id=trace_id,
    )
