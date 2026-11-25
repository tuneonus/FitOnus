"""POST /internal/v1/ai/coach/chat/stream: FastAPI SSE endpoint for streaming Coach replies."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from onusfit_ai.features.coach.application.chat import (
    is_coach_chat_tools_enabled,
    is_multi_agent_enabled,
)
from onusfit_ai.features.coach.application.streaming import (
    is_coach_streaming_enabled,
    stream_coach_reply,
    validate_request_media,
)
from onusfit_ai.features.coach.domain.chat import CoachChatRequest
from onusfit_ai.shared.auth import ServiceClaims, require_scope
from onusfit_ai.shared.contracts.streaming import format_sse_frame
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

logger = logging.getLogger("onusfit_ai.coach_chat.stream")

SCOPE = "ai:coach:chat"
require_chat_scope = require_scope(SCOPE)

router = APIRouter(prefix="/internal/v1/ai/coach", tags=["coach"])


@router.post("/chat/stream", include_in_schema=False)
async def coach_chat_stream(
    request: Request,
    body: CoachChatRequest,
    claims: ServiceClaims = Depends(require_chat_scope),
    llm: TextGenerator = Depends(get_llm),
    tools_client: InternalToolsClient = Depends(get_tools_client),
    x_request_id: str | None = Header(default=None),
) -> Response:
    """Stream an AI Coach response as Server-Sent Events (`text/event-stream`).

    Deferred Phase 17 integration: `include_in_schema=False` avoids touching
    `shared/observability/observability.py` `FEATURE_BY_PATH` while concurrent
    observability edits stabilize.
    """
    if not is_coach_streaming_enabled():
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "FEATURE_DISABLED",
                    "message": "AI Coach streaming is currently disabled.",
                    "dispatched": False,
                }
            },
        )

    # Validate optional media attachments before opening the SSE response so bad uploads get 422.
    validated_media = validate_request_media(body)

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
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Failed to initialize MCP tools (%s). Falling back to native tools.",
                    type(exc).__name__,
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
            if mcp_handler is not None:
                tool_handler = _native_tool_handler

    cancel_event = asyncio.Event()

    async def _watch_disconnect() -> None:
        while not cancel_event.is_set():
            try:
                if await request.is_disconnected():
                    cancel_event.set()
                    return
            except Exception:  # noqa: BLE001
                return
            await asyncio.sleep(0.05)

    async def _sse_body() -> AsyncIterator[str]:
        disconnect_task = asyncio.create_task(_watch_disconnect())
        event_counter = 0
        try:
            async for event in stream_coach_reply(
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
                validated_media=validated_media,
                cancel_event=cancel_event,
            ):
                if cancel_event.is_set():
                    break
                event_counter += 1
                yield format_sse_frame(event.type, event, event_id=event_counter)
        except asyncio.CancelledError:
            cancel_event.set()
            raise
        finally:
            cancel_event.set()
            disconnect_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await disconnect_task

    return StreamingResponse(
        _sse_body(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Request-Id": trace_id,
        },
    )
