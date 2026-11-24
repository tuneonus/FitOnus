"""Official Model Context Protocol (MCP) Client implementation for OnusFit.

Presentation adapter: Implements protocol lifecycle, capability negotiation,
tool discovery, tool execution, resource reading, and prompt resolution.
"""

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any, cast

from mcp import ClientSession

from onusfit_ai.features.mcp.domain.contracts import (
    McpCapabilitySummary,
    McpConfig,
    McpPromptArgument,
    McpPromptDefinition,
    McpPromptResult,
    McpResourceContent,
    McpResourceDefinition,
    McpToolDefinition,
    McpToolResult,
)
from onusfit_ai.features.mcp.domain.errors import (
    McpCapabilityNegotiationError,
    McpConnectionError,
    McpError,
    McpTimeoutError,
)
from onusfit_ai.features.mcp.presentation.server.builder import FitOnusMcpServer

logger = logging.getLogger("onusfit_ai.mcp.presentation.client")


class FitOnusMcpClient:
    """Production-grade MCP Client supporting protocol lifecycle and tool invocation."""

    def __init__(
        self,
        config: McpConfig | None = None,
        server: FitOnusMcpServer | None = None,
        session: ClientSession | None = None,
    ) -> None:
        self.config = config or McpConfig()
        self._server = server
        self._session = session
        self._connected = False
        self._capabilities: McpCapabilitySummary | None = None
        self._cached_tools: list[McpToolDefinition] = []

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def capabilities(self) -> McpCapabilitySummary | None:
        return self._capabilities

    async def connect(self) -> McpCapabilitySummary:
        """Establish connection and perform capability negotiation lifecycle."""
        if self._connected:
            return self._capabilities or McpCapabilitySummary()

        try:
            if self._session:
                # 1. Official ClientSession protocol initialization
                init_result = await self._session.initialize()
                server_caps = init_result.capabilities

                self._capabilities = McpCapabilitySummary(
                    supports_tools=bool(server_caps.tools),
                    supports_resources=bool(server_caps.resources),
                    supports_prompts=bool(server_caps.prompts),
                    supports_logging=bool(server_caps.logging),
                    protocol_version=init_result.protocol_version,
                )
            elif self._server:
                # In-process direct server connection
                registry = self._server.get_registry()
                self._capabilities = McpCapabilitySummary(
                    supports_tools=len(registry.list_tools()) > 0,
                    supports_resources=len(registry.list_resources()) > 0,
                    supports_prompts=len(registry.list_prompts()) > 0,
                    supports_logging=True,
                    protocol_version="2024-11-05",
                )
            else:
                # Local mock mode or default initialization
                self._capabilities = McpCapabilitySummary()

            self._connected = True
            logger.info(
                "Connected to MCP Server. Negotiated capabilities: tools=%s, resources=%s, prompts=%s (protocol: %s)",
                self._capabilities.supports_tools,
                self._capabilities.supports_resources,
                self._capabilities.supports_prompts,
                self._capabilities.protocol_version,
            )
            return self._capabilities

        except Exception as exc:
            logger.error("Failed to connect or negotiate capabilities with MCP server: %s", exc)
            raise McpCapabilityNegotiationError(f"Capability negotiation failed: {exc}") from exc

    async def ping(self) -> bool:
        """Verify protocol responsiveness."""
        if not self._connected:
            return False
        if self._session:
            try:
                await self._session.send_ping()
                return True
            except Exception:
                return False
        return True

    async def list_tools(self, refresh: bool = False) -> list[McpToolDefinition]:
        """Discover and list all registered tools from the MCP server."""
        if not self._connected:
            await self.connect()

        if self._cached_tools and not refresh:
            return self._cached_tools

        try:
            if self._session:
                res = await self._session.list_tools()
                discovered: list[McpToolDefinition] = []
                for t in res.tools:
                    schema_data = getattr(t, "input_schema", None) or getattr(t, "inputSchema", None) or {}
                    discovered.append(
                        McpToolDefinition(
                            name=t.name,
                            description=t.description or "",
                            input_schema=schema_data if isinstance(schema_data, dict) else {},
                            is_write=False,
                            requires_auth=True,
                        )
                    )
                self._cached_tools = discovered
                return self._cached_tools

            if self._server:
                self._cached_tools = self._server.get_registry().list_tools()
                return self._cached_tools

            return []

        except Exception as exc:
            raise McpError(f"Failed to list tools from MCP server: {exc}", code="TOOL_DISCOVERY_ERROR") from exc

    async def call_tool(
        self,
        name: str,
        arguments: dict[str, Any],
        user_id: str = "authenticated_user",
        request_id: str = "req-client",
        timeout_seconds: float | None = None,
    ) -> McpToolResult:
        """Invoke an MCP tool with timeout handling and error mapping."""
        if not self._connected:
            await self.connect()

        timeout = timeout_seconds or self.config.per_tool_timeout_seconds
        start_time = time.perf_counter()

        try:
            if self._session:
                try:
                    res = await asyncio.wait_for(
                        self._session.call_tool(name=name, arguments=arguments),
                        timeout=timeout,
                    )
                except TimeoutError as exc:
                    raise McpTimeoutError(name, timeout) from exc

                content_parts = []
                for block in res.content:
                    if hasattr(block, "text"):
                        content_parts.append(block.text)
                    else:
                        content_parts.append(str(block))
                content_str = "\n".join(content_parts)

                structured = {}
                try:
                    structured = json.loads(content_str)
                except Exception:
                    structured = {"raw": content_str}

                elapsed_ms = (time.perf_counter() - start_time) * 1000.0
                is_err = bool(getattr(res, "is_error", None) or getattr(res, "isError", False))
                return McpToolResult(
                    tool_name=name,
                    content=content_str,
                    structured_data=structured if isinstance(structured, dict) else {"result": structured},
                    is_error=is_err,
                    execution_time_ms=elapsed_ms,
                )

            if self._server:
                return await self._server.call_tool_in_process(
                    name=name,
                    arguments=arguments,
                    user_id=user_id,
                    request_id=request_id,
                )

            raise McpConnectionError("No active server or session configured for client")

        except McpTimeoutError:
            raise
        except Exception as exc:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            return McpToolResult(
                tool_name=name,
                content=json.dumps({"error": str(exc), "tool": name}),
                is_error=True,
                error_message=str(exc),
                execution_time_ms=elapsed_ms,
            )

    async def list_resources(self) -> list[McpResourceDefinition]:
        """List available resources."""
        if not self._connected:
            await self.connect()

        if self._session:
            res = await self._session.list_resources()
            return [
                McpResourceDefinition(
                    uri=str(r.uri),
                    name=r.name or str(r.uri),
                    description=r.description or "",
                    mime_type=str(getattr(r, "mime_type", None) or getattr(r, "mimeType", "application/json")),
                )
                for r in res.resources
            ]

        if self._server:
            return self._server.get_registry().list_resources()

        return []

    async def read_resource(self, uri: str) -> McpResourceContent:
        """Read resource content by URI."""
        if not self._connected:
            await self.connect()

        if self._session:
            res = await self._session.read_resource(uri=uri)
            text_parts = [c.text for c in res.contents if hasattr(c, "text")]
            return McpResourceContent(
                uri=uri,
                mime_type="application/json",
                text="\n".join(text_parts),
            )

        if self._server:
            content = await self._server.get_registry().read_resource(uri)
            if not content:
                raise McpError(f"Resource '{uri}' not found", code="RESOURCE_NOT_FOUND")
            return content

        raise McpConnectionError("No active connection for resource read")

    async def list_prompts(self) -> list[McpPromptDefinition]:
        """List available prompt templates."""
        if not self._connected:
            await self.connect()

        if self._session:
            res = await self._session.list_prompts()
            return [
                McpPromptDefinition(
                    name=p.name,
                    description=p.description or "",
                    arguments=[
                        McpPromptArgument(
                            name=a.name,
                            description=a.description or "",
                            required=bool(a.required),
                        )
                        for a in (p.arguments or [])
                    ],
                )
                for p in res.prompts
            ]

        if self._server:
            return self._server.get_registry().list_prompts()

        return []

    async def get_prompt(
        self,
        name: str,
        arguments: dict[str, Any] | None = None,
    ) -> McpPromptResult:
        """Get and render prompt messages."""
        if not self._connected:
            await self.connect()

        args = arguments or {}
        if self._server:
            res = self._server.get_registry().render_prompt(name, **args)
            if not res:
                raise McpError(f"Prompt template '{name}' not found", code="PROMPT_NOT_FOUND")
            return res

        raise McpError("Prompt rendering not supported in current mode", code="PROMPT_UNSUPPORTED")

    def create_tool_handler(
        self,
        user_id: str,
        request_id: str,
        fallback_client: Any | None = None,
    ) -> Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]:
        """Create an async tool handler suitable for Gemini function calling and LangGraph."""

        async def _handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
            try:
                res = await self.call_tool(
                    name=name,
                    arguments=args,
                    user_id=user_id,
                    request_id=request_id,
                )
                if not res.is_error and res.structured_data:
                    return res.structured_data
                if fallback_client is not None:
                    logger.warning(
                        "MCP tool '%s' returned error (%s). Falling back to native tools.",
                        name,
                        res.error_message,
                    )
                    fallback_res = await fallback_client.execute_tool(
                        name=name,
                        args=args,
                        user_id=user_id,
                        request_id=request_id,
                    )
                    return cast(dict[str, Any], fallback_res)
                return res.structured_data or {
                    "error": res.error_message or "Tool execution failed"
                }
            except Exception as exc:
                if fallback_client is not None:
                    logger.warning(
                        "MCP call failed (%s). Falling back to native tools.",
                        exc,
                    )
                    fallback_res = await fallback_client.execute_tool(
                        name=name,
                        args=args,
                        user_id=user_id,
                        request_id=request_id,
                    )
                    return cast(dict[str, Any], fallback_res)
                raise

        return _handler

    async def close(self) -> None:
        """Gracefully terminate client session."""
        self._connected = False
        self._cached_tools.clear()
        logger.info("Closed FitOnus MCP Client connection")

    async def __aenter__(self) -> "FitOnusMcpClient":
        await self.connect()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.close()
