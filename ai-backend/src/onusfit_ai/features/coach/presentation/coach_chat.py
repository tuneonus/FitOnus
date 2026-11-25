"""POST /internal/v1/ai/coach/chat: a thin HTTP wrapper around `generate_coach_reply`."""

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Header

from onusfit_ai.features.coach.application.chat import (
    generate_coach_reply,
    is_coach_chat_tools_enabled,
    is_multi_agent_enabled,
)
from onusfit_ai.features.coach.domain.chat import CoachChatRequest, CoachChatResponse
from onusfit_ai.shared.auth import ServiceClaims, require_scope
from onusfit_ai.shared.llm.dependencies import get_coach_tools, get_llm
from onusfit_ai.shared.llm.ports import TextGenerator
from onusfit_ai.shared.tools import (
    InternalToolsClient,
    create_a2a_mediator,
    create_multimodal_meal_port,
    create_workout_planner_port,
    get_mcp_client_adapter,
    get_tools_client,
    is_mcp_enabled,
)

logger = logging.getLogger("onusfit_ai.coach_chat")

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
    mcp_handler = None
    discovered_tools = None
    a2a_mediator = None
    workout_planner = None
    multimodal_port = None
    multi_agent_on = is_multi_agent_enabled()

    if is_coach_chat_tools_enabled() or is_mcp_enabled() or multi_agent_on:
        async def _native_tool_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
            return await tools_client.execute_tool(
                name=name,
                args=args,
                user_id=claims.user_id,
                request_id=trace_id,
            )

        if is_mcp_enabled():
            try:
                mcp_adapter = get_mcp_client_adapter(tools_client=tools_client)
                tools = await mcp_adapter.get_gemini_tools()
                discovered_tools = await mcp_adapter.discover_tool_names()
                tool_handler = mcp_adapter.create_tool_handler(
                    user_id=claims.user_id,
                    request_id=trace_id,
                )
                mcp_handler = tool_handler
            except Exception as exc:
                logger.warning(
                    "Failed to initialize MCP tools (%s). Falling back to native tools.",
                    exc,
                    extra={"requestId": trace_id},
                )
                tools = get_coach_tools()
                tool_handler = _native_tool_handler
        else:
            tools = get_coach_tools()
            tool_handler = _native_tool_handler

        if multi_agent_on:
            a2a_mediator = create_a2a_mediator()
            workout_planner = create_workout_planner_port()
            multimodal_port = create_multimodal_meal_port()
            # Keep native tool handler distinct from MCP handler so gateway can fall back
            if mcp_handler is not None:
                tool_handler = _native_tool_handler

    return await generate_coach_reply(
        body,
        llm,
        trace_id=trace_id,
        user_id=claims.user_id,
        tools=tools,
        tool_handler=tool_handler,
        mcp_handler=mcp_handler,
        discovered_tools=discovered_tools,
        a2a_mediator=a2a_mediator,
        workout_planner=workout_planner,
        multimodal_port=multimodal_port,
    )
