"""POST /internal/v1/ai/coach/chat: a thin HTTP wrapper around `generate_coach_reply`."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Header

from onusfit_ai.features.coach.application.chat import (
    generate_coach_reply,
    is_coach_chat_tools_enabled,
)
from onusfit_ai.features.coach.domain.chat import CoachChatRequest, CoachChatResponse
from onusfit_ai.shared.auth import ServiceClaims, require_scope
from onusfit_ai.shared.llm.dependencies import get_coach_tools, get_llm
from onusfit_ai.shared.llm.ports import TextGenerator
from onusfit_ai.shared.tools import InternalToolsClient, get_tools_client

SCOPE = "ai:coach:chat"
require_chat_scope = require_scope(SCOPE)

router = APIRouter(prefix="/internal/v1/ai/coach", tags=["coach"])


@router.post("/chat", response_model=CoachChatResponse)
async def coach_chat(
    body: CoachChatRequest,
    claims: ServiceClaims = Depends(require_chat_scope),
    llm: TextGenerator = Depends(get_llm),
    tools_client: InternalToolsClient = Depends(get_tools_client),
    x_request_id: str | None = Header(default=None),
) -> CoachChatResponse:
    """Generate an AI Coach conversation response.

    Execution order:
    1. JWT authentication and scope verification via Depends(require_chat_scope).
    2. Request body validation against CoachChatRequest schema (extra='forbid').
    3. LLM and internal tools client dependency injection.
    4. Trace ID resolution from headers, verified claims, or UUID fallback.
    5. User identity bound exclusively from verified JWT claims.
    """
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())

    tools = None
    tool_handler = None
    if is_coach_chat_tools_enabled():
        tools = get_coach_tools()
        user_id = claims.user_id

        async def _tool_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
            return await tools_client.execute_tool(
                name=name,
                args=args,
                user_id=user_id,
                request_id=trace_id,
            )

        tool_handler = _tool_handler

    return await generate_coach_reply(
        body,
        llm,
        trace_id=trace_id,
        user_id=claims.user_id,
        tools=tools,
        tool_handler=tool_handler,
    )
