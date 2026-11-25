"""FastAPI HTTP and streamable transport endpoints for FitOnus MCP subsystem."""

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from onusfit_ai.features.mcp.application.orchestrator import AgentToolOrchestrator
from onusfit_ai.features.mcp.domain.contracts import (
    McpPromptResult,
    McpResourceContent,
    McpResourceDefinition,
    McpToolCall,
    McpToolDefinition,
    McpToolResult,
)
from onusfit_ai.features.mcp.domain.errors import McpError, McpSecurityError
from onusfit_ai.features.mcp.presentation.server.builder import get_fitonus_mcp_server
from onusfit_ai.shared.auth import ServiceClaims, require_scope

logger = logging.getLogger("onusfit_ai.mcp.routes")

# Authorized scopes for internal MCP transport access
MCP_SCOPE = "ai:tools:read"
require_mcp_scope = require_scope(MCP_SCOPE)

router = APIRouter(prefix="/internal/v1/mcp", tags=["mcp"])


class ReadResourceRequest(BaseModel):
    uri: str = Field(description="RFC 3986 URI of the resource to retrieve")


class GetPromptRequest(BaseModel):
    name: str = Field(description="Name of prompt template to render")
    arguments: dict[str, Any] = Field(default_factory=dict)


class ConfirmApprovalRequest(BaseModel):
    approval_id: str = Field(description="Unique ID of pending approval ticket")
    expected_payload_hash: str | None = Field(
        default=None,
        description="Optional SHA-256 payload hash binding confirmation to original proposed arguments",
    )


_shared_orchestrator: AgentToolOrchestrator | None = None
_shared_server_id: int | None = None


def _get_orchestrator() -> AgentToolOrchestrator:
    global _shared_orchestrator, _shared_server_id
    server = get_fitonus_mcp_server()
    if _shared_orchestrator is None or _shared_server_id != id(server):
        _shared_orchestrator = AgentToolOrchestrator(registry=server.get_registry(), config=server.config)
        _shared_server_id = id(server)
    return _shared_orchestrator


@router.get("/status")
async def mcp_status(claims: ServiceClaims = Depends(require_mcp_scope)) -> dict[str, str]:
    """Health and status check for internal MCP server."""
    server = get_fitonus_mcp_server()
    return {
        "status": "ready",
        "server": server.config.server_name,
        "version": server.config.server_version,
        "transport": server.config.transport,
    }


@router.get("/tools", response_model=list[McpToolDefinition])
async def list_tools(
    read_only: bool = False,
    claims: ServiceClaims = Depends(require_mcp_scope),
) -> list[McpToolDefinition]:
    """Discover all registered tools in the OnusFit ecosystem."""
    orchestrator = _get_orchestrator()
    return orchestrator.discover_tools(filter_read_only=read_only)


@router.post("/tools/execute", response_model=McpToolResult)
async def execute_tool(
    call: McpToolCall,
    claims: ServiceClaims = Depends(require_mcp_scope),
    x_request_id: str | None = Header(default=None),
) -> McpToolResult:
    """Execute a validated tool call under authenticated user context."""
    orchestrator = _get_orchestrator()

    # User isolation check: authenticated claims user_id is mandatory and must match target user_id
    claims_uid = (claims.user_id or "").strip()
    if not claims_uid or call.user_id.strip() != claims_uid:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Authenticated token user does not match requested user scope",
        )

    # Reject attempts to bypass HITL approval directly over /tools/execute
    if call.arguments.get("confirmed") is True:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Direct write confirmation is not permitted; use /approval/confirm",
        )

    trace_id = x_request_id or call.request_id or claims.request_id or str(uuid.uuid4())
    call_with_trace = McpToolCall(
        tool_name=call.tool_name,
        arguments=call.arguments,
        user_id=claims_uid,
        request_id=trace_id,
        timeout_seconds=call.timeout_seconds,
    )
    return await orchestrator.execute_tool(call_with_trace)


@router.get("/resources", response_model=list[McpResourceDefinition])
async def list_resources(
    claims: ServiceClaims = Depends(require_mcp_scope),
) -> list[McpResourceDefinition]:
    """List available informational resources."""
    server = get_fitonus_mcp_server()
    return server.get_registry().list_resources()


@router.post("/resources/read", response_model=McpResourceContent)
async def read_resource(
    req: ReadResourceRequest,
    claims: ServiceClaims = Depends(require_mcp_scope),
) -> McpResourceContent:
    """Read contents of an MCP resource by URI."""
    server = get_fitonus_mcp_server()
    content = await server.get_registry().read_resource(req.uri)
    if not content:
        raise HTTPException(status_code=404, detail=f"Resource '{req.uri}' not found")
    return content


@router.get("/prompts")
async def list_prompts(
    claims: ServiceClaims = Depends(require_mcp_scope),
) -> list[dict[str, Any]]:
    """List available prompt templates."""
    server = get_fitonus_mcp_server()
    return [p.model_dump() for p in server.get_registry().list_prompts()]


@router.post("/prompts/get", response_model=McpPromptResult)
async def get_prompt(
    req: GetPromptRequest,
    claims: ServiceClaims = Depends(require_mcp_scope),
) -> McpPromptResult:
    """Render an MCP prompt template with provided arguments."""
    server = get_fitonus_mcp_server()
    res = server.get_registry().render_prompt(req.name, **req.arguments)
    if not res:
        raise HTTPException(status_code=404, detail=f"Prompt template '{req.name}' not found")
    return res


@router.post("/approval/confirm", response_model=McpToolResult)
async def confirm_approval(
    req: ConfirmApprovalRequest,
    claims: ServiceClaims = Depends(require_mcp_scope),
    x_request_id: str | None = Header(default=None),
) -> McpToolResult:
    """Confirm a pending Human-in-the-Loop write operation."""
    claims_uid = (claims.user_id or "").strip()
    if not claims_uid:
        raise HTTPException(status_code=403, detail="Forbidden: Authenticated user_id required")

    orchestrator = _get_orchestrator()
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())
    try:
        return await orchestrator.confirm_and_execute(
            approval_id=req.approval_id,
            user_id=claims_uid,
            request_id=trace_id,
            expected_payload_hash=req.expected_payload_hash,
        )
    except McpSecurityError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except McpError as exc:
        if exc.code == "TICKET_NOT_FOUND":
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        if exc.code == "TICKET_EXPIRED":
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Approval confirmation failed") from exc
