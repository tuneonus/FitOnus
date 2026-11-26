"""Shared internal tools client, MCP adapters, and dependencies."""

from onusfit_ai.shared.tools.client import (
    InternalToolsClient,
    close_shared_http_client,
    get_shared_http_client,
    get_tools_client,
)
from onusfit_ai.shared.tools.mcp import (
    McpClientAdapter,
    McpDiscoveryCache,
    McpTelemetry,
    get_mcp_client_adapter,
    get_shared_mcp_server,
    is_mcp_enabled,
    set_shared_mcp_server,
)
from onusfit_ai.shared.tools.multi_agent import (
    create_a2a_mediator,
    create_multimodal_meal_port,
    create_workout_planner_port,
    set_multi_agent_providers,
)

__all__ = [
    "InternalToolsClient",
    "McpClientAdapter",
    "McpDiscoveryCache",
    "McpTelemetry",
    "close_shared_http_client",
    "create_a2a_mediator",
    "create_multimodal_meal_port",
    "create_workout_planner_port",
    "get_mcp_client_adapter",
    "get_shared_http_client",
    "get_shared_mcp_server",
    "get_tools_client",
    "is_mcp_enabled",
    "set_multi_agent_providers",
    "set_shared_mcp_server",
]
