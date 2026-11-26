"""MCP Client Adapter in shared/tools.

Bridges Model Context Protocol tools into Google Gemini Function Calling declarations
with discovery caching, execution telemetry, and automatic fallback to InternalToolsClient.
Pure adapter: uses shared.llm.gemini to build Gemini tool formats without directly importing SDKs.
"""

import logging
import os
import time
from collections.abc import Callable
from typing import Any

from onusfit_ai.shared.contracts.tools import TOOL_ARG_SCHEMAS
from onusfit_ai.shared.llm.gemini import create_gemini_tools_from_schemas
from onusfit_ai.shared.logging import log_event
from onusfit_ai.shared.tools.client import InternalToolsClient

logger = logging.getLogger("onusfit_ai.shared.tools.mcp")


def is_mcp_enabled() -> bool:
    """Master toggle for MCP integration."""
    raw = os.environ.get("MCP_ENABLED") or os.environ.get("AI_COACH_MCP_ENABLED", "false")
    return raw.strip().lower() in ("1", "true", "yes", "on")


class McpDiscoveryCache:
    """Thread-safe bounded-TTL discovery cache for MCP tool definitions."""

    def __init__(self, ttl_seconds: float = 300.0) -> None:
        self.ttl_seconds = ttl_seconds
        self._tools: list[dict[str, Any]] | None = None
        self._tools_timestamp: float = 0.0

    def get_tools(self) -> list[dict[str, Any]] | None:
        if (
            self._tools is not None
            and (time.monotonic() - self._tools_timestamp) < self.ttl_seconds
        ):
            return list(self._tools)
        return None

    def set_tools(self, tools: list[dict[str, Any]]) -> None:
        self._tools = list(tools)
        self._tools_timestamp = time.monotonic()

    def invalidate(self) -> None:
        self._tools = None
        self._tools_timestamp = 0.0


class McpTelemetry:
    """Operational telemetry tracking latency, counts, cache hits, and fallbacks."""

    def __init__(self) -> None:
        self.total_invocations = 0
        self.successful_invocations = 0
        self.failed_invocations = 0
        self.total_latency_ms = 0.0
        self.cache_hits = 0
        self.fallbacks_triggered = 0

    def record_call(
        self, tool_name: str, duration_ms: float, success: bool, request_id: str = ""
    ) -> None:
        self.total_invocations += 1
        self.total_latency_ms += duration_ms
        if success:
            self.successful_invocations += 1
        else:
            self.failed_invocations += 1

        log_event(
            logger,
            "mcp.client.tool_call",
            level=logging.INFO if success else logging.WARNING,
            message=f"MCP Tool Call: tool={tool_name} status={'SUCCESS' if success else 'FAILED'}",
            tool=tool_name,
            success=success,
            durationMs=round(max(0.0, duration_ms), 2),
            aiRequestId=request_id or None,
        )

    def record_cache_lookup(self, hit: bool) -> None:
        if hit:
            self.cache_hits += 1

    def record_fallback(self, tool_name: str, reason: str, request_id: str = "") -> None:
        self.fallbacks_triggered += 1
        log_event(
            logger,
            "mcp.client.fallback",
            level=logging.WARNING,
            message="MCP tool fell back to native InternalToolsClient",
            tool=tool_name,
            fallbackReason=reason,
            aiRequestId=request_id or None,
        )

    def get_summary(self) -> dict[str, Any]:
        avg = self.total_latency_ms / self.total_invocations if self.total_invocations > 0 else 0.0
        return {
            "total_invocations": self.total_invocations,
            "successful_invocations": self.successful_invocations,
            "failed_invocations": self.failed_invocations,
            "avg_latency_ms": round(avg, 2),
            "cache_hits": self.cache_hits,
            "fallbacks_triggered": self.fallbacks_triggered,
        }


# Global reference to server instance set by main.py or server builder
_global_mcp_server: Any | None = None


def set_shared_mcp_server(server: Any) -> None:
    """Registers the active FitOnusMcpServer instance for in-process client resolution."""
    global _global_mcp_server
    _global_mcp_server = server


def get_shared_mcp_server() -> Any | None:
    return _global_mcp_server


class McpClientAdapter:
    """Unified adapter bridging MCP tools into Gemini agent function calling."""

    def __init__(
        self,
        tools_client: InternalToolsClient | None = None,
        server_instance: Any | None = None,
        timeout_seconds: float = 5.0,
        include_write_tools: bool = False,
    ) -> None:
        self.tools_client = tools_client
        self.server_instance = server_instance or get_shared_mcp_server()
        self.timeout_seconds = timeout_seconds
        self.include_write_tools = include_write_tools
        self.cache = McpDiscoveryCache()
        self.telemetry = McpTelemetry()

    async def get_gemini_tools(self) -> list[Any]:
        """Discover tools from MCP server (or cache) and convert to Gemini Tool specifications."""
        cached = self.cache.get_tools()
        if cached:
            self.telemetry.record_cache_lookup(hit=True)
            return create_gemini_tools_from_schemas(cached)

        self.telemetry.record_cache_lookup(hit=False)
        server = self.server_instance or get_shared_mcp_server()

        tool_dicts: list[dict[str, Any]] = []
        if server and hasattr(server, "get_registry"):
            registry = server.get_registry()
            for t in registry.list_tools(filter_read_only=not self.include_write_tools):
                tool_dicts.append(
                    {
                        "name": t.name,
                        "description": t.description,
                        "input_schema": t.input_schema,
                    }
                )
        else:
            for t_name, s_cls in TOOL_ARG_SCHEMAS.items():
                if not self.include_write_tools and t_name == "persist_workout_plan":
                    continue
                tool_dicts.append(
                    {
                        "name": t_name,
                        "description": f"FitOnus tool: {t_name}",
                        "input_schema": s_cls.model_json_schema(),
                    }
                )

        self.cache.set_tools(tool_dicts)
        return create_gemini_tools_from_schemas(tool_dicts)

    async def discover_tool_names(self) -> list[str]:
        """Return discovered non-mutating tool names permitted by MCP server discovery."""
        cached = self.cache.get_tools()
        if not cached:
            await self.get_gemini_tools()
            cached = self.cache.get_tools() or []
        return [
            str(entry["name"]) for entry in cached if isinstance(entry, dict) and entry.get("name")
        ]

    def create_tool_handler(
        self,
        user_id: str,
        request_id: str,
    ) -> Callable[[str, dict[str, Any]], Any]:
        """Create tool execution callback bound to authenticated request context."""

        async def _handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
            # Anti-confused deputy guard: never forward caller/LLM-supplied user identifiers
            for forbidden_key in ("userId", "targetUserId", "user_id"):
                if forbidden_key in args:
                    return {"error": f"Forbidden identity parameter '{forbidden_key}' rejected"}

            # Mutation tools remain disabled unless durable approval & Node persistence are enabled
            if not self.include_write_tools and name == "persist_workout_plan":
                return {"error": f"Mutation tool '{name}' is disabled without durable approval"}

            start = time.perf_counter()
            server = self.server_instance or get_shared_mcp_server()

            if server and hasattr(server, "call_tool_in_process"):
                try:
                    result = await server.call_tool_in_process(
                        name=name,
                        arguments=args,
                        user_id=user_id,
                        request_id=request_id,
                    )
                    elapsed_ms = (time.perf_counter() - start) * 1000.0
                    self.telemetry.record_call(
                        name, elapsed_ms, success=not result.is_error, request_id=request_id
                    )
                    if not result.is_error:
                        return result.structured_data or {"result": result.content}
                    err_text = result.error_message or "mcp_error"
                    # Never bypass security, validation, or approval blocks via native fallback
                    lowered = err_text.lower()
                    if any(
                        token in lowered
                        for token in (
                            "security",
                            "forbidden",
                            "allowlist",
                            "validation",
                            "approval",
                            "unauthorized",
                        )
                    ):
                        return {"error": err_text}
                    self.telemetry.record_fallback(name, err_text, request_id=request_id)
                except Exception as exc:
                    elapsed_ms = (time.perf_counter() - start) * 1000.0
                    self.telemetry.record_call(
                        name, elapsed_ms, success=False, request_id=request_id
                    )
                    self.telemetry.record_fallback(name, str(exc), request_id=request_id)

            # Native InternalToolsClient fallback
            if self.tools_client:
                return await self.tools_client.execute_tool(
                    name=name,
                    args=args,
                    user_id=user_id,
                    request_id=request_id,
                )

            return {"error": f"Tool '{name}' failed and no fallback available"}

        return _handler


_adapter_singleton: McpClientAdapter | None = None


def get_mcp_client_adapter(tools_client: InternalToolsClient | None = None) -> McpClientAdapter:
    """FastAPI dependency / factory for McpClientAdapter."""
    global _adapter_singleton
    if _adapter_singleton is None or tools_client is not None:
        _adapter_singleton = McpClientAdapter(tools_client=tools_client)
    return _adapter_singleton
