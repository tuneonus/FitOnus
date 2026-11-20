"""POST /internal/v1/ai/coach/chat: a thin HTTP wrapper around `generate_coach_reply`."""

import uuid

from fastapi import APIRouter, Depends, Header

from onusfit_ai.features.coach.application.chat import generate_coach_reply
from onusfit_ai.features.coach.domain.chat import CoachChatRequest, CoachChatResponse
from onusfit_ai.shared.auth import ServiceClaims, require_scope
from onusfit_ai.shared.llm.dependencies import get_llm
from onusfit_ai.shared.llm.ports import TextGenerator

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
    """Generate an AI Coach conversation response.

    Execution order:
    1. JWT authentication and scope verification via Depends(require_chat_scope).
    2. Request body validation against CoachChatRequest schema (extra='forbid').
    3. LLM dependency injection (real Gemini client in production, fake in tests).
    4. Trace ID resolution from headers, verified claims, or UUID fallback.
    """
    # Auth runs first (Depends), body validation by Pydantic runs before this function body.
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())
    return await generate_coach_reply(body, llm, trace_id=trace_id)
