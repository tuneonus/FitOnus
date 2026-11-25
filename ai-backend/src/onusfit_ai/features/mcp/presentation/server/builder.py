"""Official MCPServer builder and lifecycle management for OnusFit.

Presentation adapter: Exposes the domain tool registry over the Model Context Protocol.
"""

import json
import logging
import time
from collections.abc import Callable
from contextvars import ContextVar
from typing import Any

from mcp.server.mcpserver import MCPServer

from onusfit_ai.features.mcp.application.registry import (
    McpToolRegistry,
    create_fitonus_tool_registry,
)
from onusfit_ai.features.mcp.application.security import McpSecurityGuardrails
from onusfit_ai.features.mcp.domain.contracts import (
    CatalogIndexProtocol,
    McpConfig,
    McpToolResult,
    PlanGeneratorProtocol,
)
from onusfit_ai.features.mcp.domain.errors import McpSecurityError

logger = logging.getLogger("onusfit_ai.mcp.presentation.server.builder")

# Request-scoped context variables for user identity and correlation ID
current_user_id: ContextVar[str] = ContextVar("mcp_current_user_id", default="authenticated_user")
current_request_id: ContextVar[str] = ContextVar("mcp_current_request_id", default="req-mcp")


class FitOnusMcpServer:
    """Wraps the official MCPServer instance with FitOnus tool and resource registrations."""

    def __init__(
        self,
        config: McpConfig | None = None,
        registry: McpToolRegistry | None = None,
        tools_client_getter: Callable[[], Any] | None = None,
        plan_generator: PlanGeneratorProtocol | None = None,
        catalog_index: CatalogIndexProtocol | None = None,
    ) -> None:
        self.config = config or McpConfig()
        self.guardrails = McpSecurityGuardrails(self.config)
        self.registry = registry or create_fitonus_tool_registry(
            tools_client_getter=tools_client_getter,
            plan_generator=plan_generator,
            catalog_index=catalog_index,
        )
        self.server = MCPServer(
            name=self.config.server_name,
            version=self.config.server_version,
            description="Secure Model Context Protocol server exposing verified FitOnus tools.",
        )

        self._bind_mcp_capabilities()
        logger.info(
            "Initialized FitOnus MCPServer '%s' (v%s) with %d tools, %d resources, %d prompts",
            self.config.server_name,
            self.config.server_version,
            len(self.registry.list_tools()),
            len(self.registry.list_resources()),
            len(self.registry.list_prompts()),
        )

    def _bind_mcp_capabilities(self) -> None:
        """Register tools, resources, and prompts from registry onto MCPServer."""
        # 1. Register Tools
        for tool_def in self.registry.list_tools():
            tool_name = tool_def.name
            handler = self.registry.get_tool_handler(tool_name)
            if not handler:
                continue

            def _make_tool_func(t_name: str, t_handler: Any) -> Callable[..., Any]:
                async def _tool_func(**kwargs: Any) -> str:
                    u_id = current_user_id.get()
                    r_id = current_request_id.get()
                    res = await self.call_tool_in_process(
                        name=t_name,
                        arguments=kwargs,
                        user_id=u_id,
                        request_id=r_id,
                    )
                    if res.is_error:
                        return json.dumps({"error": res.error_message or "Tool execution failed"})
                    return res.content

                return _tool_func

            self.server.tool(
                name=tool_def.name,
                description=tool_def.description,
            )(_make_tool_func(tool_name, handler))

        # 2. Register Resources
        for res_def in self.registry.list_resources():
            res_uri = res_def.uri

            def _make_res_func(r_uri: str) -> Callable[..., Any]:
                async def _res_func() -> str:
                    content = await self.registry.read_resource(r_uri)
                    return content.text if content else "{}"

                return _res_func

            self.server.resource(
                uri=res_def.uri,
                name=res_def.name,
                description=res_def.description,
                mime_type=res_def.mime_type,
            )(_make_res_func(res_uri))

        # 3. Register Prompts
        for prompt_def in self.registry.list_prompts():
            p_name = prompt_def.name

            def _make_prompt_func(name: str) -> Callable[..., Any]:
                def _prompt_func(**kwargs: Any) -> str:
                    res = self.registry.render_prompt(name, **kwargs)
                    if not res:
                        return ""
                    return "\n".join(m.content for m in res.messages)

                return _prompt_func

            self.server.prompt(
                name=prompt_def.name,
                description=prompt_def.description,
            )(_make_prompt_func(p_name))

    def bind_request_context(self, user_id: str, request_id: str) -> tuple[Any, Any]:
        """Bind user and correlation context to request-scoped ContextVars."""
        token_u = current_user_id.set(user_id)
        token_r = current_request_id.set(request_id)
        return token_u, token_r

    def reset_request_context(self, tokens: tuple[Any, Any]) -> None:
        """Reset ContextVars back to previous values."""
        token_u, token_r = tokens
        current_user_id.reset(token_u)
        current_request_id.reset(token_r)

    def get_underlying_server(self) -> MCPServer:
        """Retrieve the raw MCPServer instance."""
        return self.server

    def get_registry(self) -> McpToolRegistry:
        """Retrieve the internal tool and resource registry."""
        return self.registry

    async def call_tool_in_process(
        self,
        name: str,
        arguments: dict[str, Any],
        user_id: str,
        request_id: str,
    ) -> McpToolResult:
        """Execute a security-validated, read-only/preview tool directly in-process."""
        start = time.perf_counter()
        definition = self.registry.get_tool(name)
        handler = self.registry.get_tool_handler(name)
        if not definition or not handler:
            return McpToolResult(
                tool_name=name,
                content=json.dumps({"error": f"Tool '{name}' not found"}),
                is_error=True,
                error_message=f"Tool '{name}' not found",
            )

        tokens = self.bind_request_context(user_id, request_id)
        try:
            uid = user_id.strip()
            if not uid:
                raise McpSecurityError("Authenticated user_id is required")

            self.guardrails.validate_tool_allowed(name)
            payload_bytes = len(json.dumps(arguments, default=str).encode("utf-8"))
            self.guardrails.validate_request_size(payload_bytes)
            validated_args = self.guardrails.validate_tool_arguments(name, arguments)

            if definition.is_write:
                raise McpSecurityError(
                    f"Mutating write tool '{name}' requires HITL approval workflow via AgentToolOrchestrator"
                )

            res = await handler(validated_args, uid, request_id)
            content_str = json.dumps(res) if isinstance(res, (dict, list)) else str(res)
            sanitized_content = self.guardrails.sanitize_tool_output(name, content_str)
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            return McpToolResult(
                tool_name=name,
                content=sanitized_content,
                structured_data=res if isinstance(res, dict) else {"result": res},
                is_error=False,
                execution_time_ms=elapsed_ms,
            )
        except Exception as exc:
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            safe_error = self.guardrails.sanitize_tool_output(name, str(exc))
            return McpToolResult(
                tool_name=name,
                content=json.dumps({"error": safe_error}),
                structured_data={"error": safe_error},
                is_error=True,
                error_message=safe_error,
                execution_time_ms=elapsed_ms,
            )
        finally:
            self.reset_request_context(tokens)


_singleton_server: FitOnusMcpServer | None = None


def get_fitonus_mcp_server(
    config: McpConfig | None = None,
    tools_client_getter: Callable[[], Any] | None = None,
    plan_generator: PlanGeneratorProtocol | None = None,
    catalog_index: CatalogIndexProtocol | None = None,
) -> FitOnusMcpServer:
    """Factory / singleton accessor for FitOnus MCPServer."""
    global _singleton_server
    if _singleton_server is None:
        _singleton_server = FitOnusMcpServer(
            config=config,
            tools_client_getter=tools_client_getter,
            plan_generator=plan_generator,
            catalog_index=catalog_index,
        )
    return _singleton_server


def reset_fitonus_mcp_server() -> None:
    """Reset singleton instance (useful for clean test isolation)."""
    global _singleton_server
    _singleton_server = None
