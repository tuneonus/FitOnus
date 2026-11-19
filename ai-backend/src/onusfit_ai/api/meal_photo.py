"""POST /internal/v1/ai/meals/analyze-photo: a thin HTTP wrapper around `analyze_meal_photo`."""

import uuid

from fastapi import APIRouter, Depends, Header

from onusfit_ai.contracts.meal_photo import AnalyzeMealPhotoRequest, AnalyzeMealPhotoResponse
from onusfit_ai.core.auth import ServiceClaims, require_scope
from onusfit_ai.llm.gemini import TextGenerator, get_llm
from onusfit_ai.meals.photo import analyze_meal_photo

SCOPE = "ai:meals:photo"
require_photo_scope = require_scope(SCOPE)

router = APIRouter(prefix="/internal/v1/ai/meals", tags=["meals"])


@router.post("/analyze-photo", response_model=AnalyzeMealPhotoResponse)
async def analyze_photo(
    body: AnalyzeMealPhotoRequest,
    claims: ServiceClaims = Depends(require_photo_scope),
    llm: TextGenerator = Depends(get_llm),
    x_request_id: str | None = Header(default=None),
) -> AnalyzeMealPhotoResponse:
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())
    return await analyze_meal_photo(body, llm, trace_id=trace_id)
