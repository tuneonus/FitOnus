"""FastAPI and application dependencies for Model Context Protocol (MCP)."""

import os
from typing import Any

from fastapi import Depends

from onusfit_ai.features.mcp.domain.contracts import McpConfig
from onusfit_ai.features.mcp.presentation.client.client import FitOnusMcpClient
from onusfit_ai.features.mcp.presentation.server.builder import (
    FitOnusMcpServer,
    get_fitonus_mcp_server,
)
from onusfit_ai.shared.config.config import Settings, get_settings
from onusfit_ai.shared.tools.client import InternalToolsClient


def is_mcp_enabled() -> bool:
    """Master toggle for MCP integration."""
    raw = os.environ.get("MCP_ENABLED") or os.environ.get("AI_COACH_MCP_ENABLED", "false")
    return raw.strip().lower() in ("1", "true", "yes", "on")


def get_mcp_config(settings: Settings = Depends(get_settings)) -> McpConfig:
    """Resolve McpConfig from runtime environment settings."""
    transport_val = (
        settings.mcp_transport
        if settings.mcp_transport in ("in_process", "stdio", "streamable_http")
        else "in_process"
    )
    return McpConfig(
        enabled=settings.mcp_enabled or is_mcp_enabled(),
        transport=transport_val,  # type: ignore[arg-type]
        server_url=settings.mcp_server_url,
        discovery_ttl_seconds=settings.mcp_discovery_ttl_seconds,
        per_tool_timeout_seconds=settings.mcp_timeout_seconds,
    )


def get_mcp_server(
    config: McpConfig | None = None,
    tools_client: InternalToolsClient | None = None,
) -> FitOnusMcpServer:
    """Get the active FitOnusMcpServer instance."""
    tools_client_getter = (lambda: tools_client) if tools_client else None
    return get_fitonus_mcp_server(
        config=config,
        tools_client_getter=tools_client_getter,
    )


def get_mcp_client(
    config: McpConfig | None = None,
    tools_client: InternalToolsClient | None = None,
) -> FitOnusMcpClient:
    """Create or return an MCP client connected to the in-process server."""
    cfg = config or McpConfig(enabled=is_mcp_enabled())
    server = get_mcp_server(config=cfg, tools_client=tools_client)
    return FitOnusMcpClient(config=cfg, server=server)


def get_mcp_client_adapter(
    config: McpConfig | None = None,
    tools_client: InternalToolsClient | None = None,
    jwt_secret: str = "",
) -> Any:
    """Compatibility alias for coach chat and client adapters."""
    _ = jwt_secret
    return get_mcp_client(config=config, tools_client=tools_client)
