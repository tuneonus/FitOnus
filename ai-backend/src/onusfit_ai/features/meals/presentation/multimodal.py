"""POST /internal/v1/ai/meals/analyze-multimodal: unified text + audio + image meal wrapper."""

import uuid

from fastapi import APIRouter, Depends, Header

from onusfit_ai.features.meals.application.multimodal import analyze_multimodal_meal
from onusfit_ai.features.meals.domain.multimodal import (
    AnalyzeMultimodalMealRequest,
    AnalyzeMultimodalMealResponse,
)
from onusfit_ai.shared.auth import ServiceClaims, require_scope
from onusfit_ai.shared.llm.dependencies import get_llm
from onusfit_ai.shared.llm.ports import TextGenerator

SCOPE = "ai:meals:multimodal"
require_multimodal_scope = require_scope(SCOPE)

router = APIRouter(prefix="/internal/v1/ai/meals", tags=["meals"])


@router.post("/analyze-multimodal", response_model=AnalyzeMultimodalMealResponse)
async def analyze_multimodal(
    body: AnalyzeMultimodalMealRequest,
    claims: ServiceClaims = Depends(require_multimodal_scope),
    llm: TextGenerator = Depends(get_llm),
    x_request_id: str | None = Header(default=None),
) -> AnalyzeMultimodalMealResponse:
    """Fuse text, audio, and/or photo inputs into sanitized structured nutritional estimates.

    Enforces JWT scope 'ai:meals:multimodal', binds caller identity to user-isolated
    in-flight deduplication, injects the LLM client, and propagates trace IDs.
    """
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())
    return await analyze_multimodal_meal(
        body,
        llm,
        trace_id=trace_id,
        user_id=claims.user_id,
    )
