"""POST /internal/v1/ai/coach/insights: a thin HTTP wrapper around `generate_coach_insights`."""

import uuid

from fastapi import APIRouter, Depends, Header

from onusfit_ai.features.coach.application.insights import generate_coach_insights
from onusfit_ai.features.coach.domain.insights import CoachInsightsRequest, CoachInsightsResponse
from onusfit_ai.shared.auth import ServiceClaims, require_scope
from onusfit_ai.shared.llm.dependencies import get_llm
from onusfit_ai.shared.llm.ports import TextGenerator

SCOPE = "ai:coach:insights"
require_insights_scope = require_scope(SCOPE)

router = APIRouter(prefix="/internal/v1/ai/coach", tags=["coach"])


@router.post("/insights", response_model=CoachInsightsResponse)
async def coach_insights(
    body: CoachInsightsRequest,
    claims: ServiceClaims = Depends(require_insights_scope),
    llm: TextGenerator = Depends(get_llm),
    x_request_id: str | None = Header(default=None),
) -> CoachInsightsResponse:
    """Generate structured coach insights from user fitness context.

    Authenticates Node's service token with the 'ai:coach:insights' scope,
    extracts the correlation trace ID, and delegates to the application use case.
    """
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())
    return await generate_coach_insights(body, llm, trace_id=trace_id)
