"""POST /internal/v1/ai/meals/parse-voice: a thin HTTP wrapper around `parse_voice_meal`."""

import uuid

from fastapi import APIRouter, Depends, Header

from onusfit_ai.contracts.voice_meal import ParseVoiceMealRequest, ParseVoiceMealResponse
from onusfit_ai.core.auth import ServiceClaims, require_scope
from onusfit_ai.llm.gemini import TextGenerator, get_llm
from onusfit_ai.meals.voice import parse_voice_meal

SCOPE = "ai:meals:voice"
require_voice_scope = require_scope(SCOPE)

router = APIRouter(prefix="/internal/v1/ai/meals", tags=["meals"])


@router.post("/parse-voice", response_model=ParseVoiceMealResponse)
async def parse_voice(
    body: ParseVoiceMealRequest,
    claims: ServiceClaims = Depends(require_voice_scope),
    llm: TextGenerator = Depends(get_llm),
    x_request_id: str | None = Header(default=None),
) -> ParseVoiceMealResponse:
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())
    return await parse_voice_meal(body, llm, trace_id=trace_id)
