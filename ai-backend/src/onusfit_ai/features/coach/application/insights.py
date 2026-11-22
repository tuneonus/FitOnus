"""Coach insights use case: user context -> Gemini -> structured insights (or "unusable").

Pure orchestration (no HTTP, no database). Quota, caching, loading the user's data and the
deterministic fallback all stay in Node.
"""

import logging
import os
from datetime import UTC, datetime

from onusfit_ai.features.coach.application.insights_parsing import _now_iso, parse_insights_output
from onusfit_ai.features.coach.application.prompts.coach_insights import (
    PROMPT_VERSION,
    build_prompt,
)
from onusfit_ai.features.coach.application.schemas import GeminiCoachInsightsOutput
from onusfit_ai.features.coach.domain.insights import (
    CoachInsightsRequest,
    CoachInsightsResponse,
    InsightItem,
    InsightsResult,
)
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.llm.ports import LlmServiceError, TextGenerator
from onusfit_ai.shared.llm.telemetry import log_ai_call
from onusfit_ai.shared.utils.js_compat import strict_json_loads, strip_code_fences

logger = logging.getLogger("onusfit_ai.coach_insights")


def is_coach_insights_structured_output_enabled() -> bool:
    """Feature-specific rollback toggle for coach insights structured outputs.

    When AI_COACH_INSIGHTS_STRUCTURED_OUTPUTS is set to '0', 'false', 'no', or 'off',
    the coach insights feature reverts to unconstrained generation and legacy parsing.
    """
    raw = os.environ.get("AI_COACH_INSIGHTS_STRUCTURED_OUTPUTS", "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


async def generate_coach_insights(
    request: CoachInsightsRequest, llm: TextGenerator, *, trace_id: str
) -> CoachInsightsResponse:
    """Orchestrate insights generation from member profile and activity context.

    Uses Gemini Native Structured Outputs (GeminiCoachInsightsOutput) when enabled,
    with defensive validation, candidate finish_reason checks, and fallback handling.
    """
    use_structured = is_coach_insights_structured_output_enabled()
    schema = GeminiCoachInsightsOutput if use_structured else None

    llm_result = await llm.generate_text(
        build_prompt(request.context, request.lang),
        primary_model=request.model.primary,
        fallback_model=request.model.fallback,
        deadline_s=request.deadline_ms / 1000,
        schema=schema,
    )

    # 1. Defensively handle safety-blocked content
    if llm_result.finish_reason == "SAFETY":
        raise LlmServiceError(
            code="PROVIDER_UNAVAILABLE",
            message="Coach insights were blocked by safety policies.",
            dispatched=True,
            usage=llm_result.usage,
        )

    # 2. Defensively handle token truncation
    if llm_result.finish_reason == "MAX_TOKENS":
        raise LlmServiceError(
            code="PROVIDER_ERROR",
            message="Coach insights exceeded maximum token limit.",
            dispatched=True,
            usage=llm_result.usage,
        )

    # 3. Resolve result and outcome
    result: InsightsResult | None = None
    outcome: str

    if use_structured:
        parsed_output: GeminiCoachInsightsOutput | None = None

        if isinstance(llm_result.parsed, GeminiCoachInsightsOutput):
            parsed_output = llm_result.parsed
        elif isinstance(llm_result.parsed, dict):
            try:
                parsed_output = GeminiCoachInsightsOutput.model_validate(llm_result.parsed)
            except Exception:
                parsed_output = None
        elif llm_result.text and llm_result.text.strip():
            # Defensive fallback: strict JSON parsing followed by Pydantic validation
            try:
                data = strict_json_loads(strip_code_fences(llm_result.text))
                if isinstance(data, dict):
                    parsed_output = GeminiCoachInsightsOutput.model_validate(data)
            except Exception:
                parsed_output = None

        if parsed_output is None:
            # Observability: log the unparseable attempt before raising controlled error
            log_ai_call(
                logger,
                feature="coach_insights",
                trace_id=trace_id,
                prompt_version=PROMPT_VERSION,
                outcome="unusable",
                usage=llm_result.usage,
                insights=0,
            )
            msg = (
                "Empty response from Coach Insights model in structured mode."
                if not llm_result.text or not llm_result.text.strip()
                else "Invalid structured response from Coach Insights model."
            )
            raise LlmServiceError(
                code="PROVIDER_ERROR",
                message=msg,
                dispatched=True,
                usage=llm_result.usage,
            )

        now_ms = int(datetime.now(UTC).timestamp() * 1000)
        items = [
            InsightItem(
                id=item.id if (item.id and item.id.strip()) else f"ins-{now_ms}-{idx}",
                title=item.title.strip(),
                description=item.description.strip(),
                category=item.category,
                priority=item.priority,
                severity=item.severity,
                action=item.action.strip(),
                question=item.question.strip(),
                evidence=list(item.evidence),
                confidence=item.confidence,
                requires_device=item.requires_device,
            )
            for idx, item in enumerate(parsed_output.insights)
        ]
        result = InsightsResult(
            greeting=parsed_output.greeting.strip(),
            recommendation=parsed_output.recommendation.strip()
            if parsed_output.recommendation
            else None,
            insights=items,
            generated_at=_now_iso(),
            has_sufficient_data=True,
        )
        outcome = "ok"
    else:
        # Legacy mode: unconstrained generation and legacy parsing
        result, outcome = parse_insights_output(
            llm_result.text, request.context.profile.display_name
        )

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
        outcome=outcome,  # type: ignore[arg-type]
        result=result,
        usage=Usage(**{k: getattr(usage, k) for k in Usage.model_fields}),
        trace_id=trace_id,
    )
