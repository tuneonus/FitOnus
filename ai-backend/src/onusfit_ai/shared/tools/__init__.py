"""Shared internal tools client, MCP adapters, and dependencies."""

from onusfit_ai.shared.tools.client import InternalToolsClient, get_tools_client
from onusfit_ai.shared.tools.mcp import (
    McpClientAdapter,
    McpDiscoveryCache,
    McpTelemetry,
    get_mcp_client_adapter,
    get_shared_mcp_server,
    is_mcp_enabled,
    set_shared_mcp_server,
)

__all__ = [
    "InternalToolsClient",
    "McpClientAdapter",
    "McpDiscoveryCache",
    "McpTelemetry",
    "get_mcp_client_adapter",
    "get_shared_mcp_server",
    "get_tools_client",
    "is_mcp_enabled",
    "set_shared_mcp_server",
]
