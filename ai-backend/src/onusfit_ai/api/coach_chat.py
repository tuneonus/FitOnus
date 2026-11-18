"""POST /internal/v1/ai/coach/chat: a thin HTTP wrapper around `generate_coach_reply`."""

import uuid

from fastapi import APIRouter, Depends, Header

from onusfit_ai.coach.chat import generate_coach_reply
from onusfit_ai.contracts.coach_chat import CoachChatRequest, CoachChatResponse
from onusfit_ai.core.auth import ServiceClaims, require_scope
from onusfit_ai.llm.gemini import TextGenerator, get_llm

SCOPE = "ai:coach:chat"
require_chat_scope = require_scope(SCOPE)

router = APIRouter(prefix="/internal/v1/ai/coach", tags=["coach"])


@router.post("/chat", response_model=CoachChatResponse)
async def coach_chat(
    body: CoachChatRequest,
    claims: ServiceClaims = Depends(require_chat_scope),
    llm: TextGenerator = Depends(get_llm),
    x_request_id: str | None = Header(default=None),
) -> CoachChatResponse:
    # Auth runs first (Depends), body validation by Pydantic runs before this function body.
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())
    return await generate_coach_reply(body, llm, trace_id=trace_id)
