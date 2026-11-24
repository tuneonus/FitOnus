"""Transport configurations and adapters for FitOnus MCPServer.

Supports:
- Streamable HTTP ASGI app mount (SSE / streaming JSON-RPC)
- STDIO runner for CLI / subprocess integration
"""

import logging
from typing import Any

from onusfit_ai.features.mcp.domain.contracts import McpConfig
from onusfit_ai.features.mcp.presentation.server.builder import get_fitonus_mcp_server

logger = logging.getLogger("onusfit_ai.mcp.presentation.server.transports")


def create_mcp_streamable_app(config: McpConfig | None = None) -> Any:
    """Mountable Starlette ASGI application for Streamable HTTP transport."""
    server = get_fitonus_mcp_server(config)
    return server.get_underlying_server().streamable_http_app()


def run_stdio_server(config: McpConfig | None = None) -> None:
    """Run FitOnus MCP server listening on stdin/stdout."""
    conf = config or McpConfig(transport="stdio")
    server = get_fitonus_mcp_server(conf)
    logger.info("Starting FitOnus MCP Server over STDIO transport...")
    server.get_underlying_server().run(transport="stdio")
