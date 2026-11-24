"""Agent tool orchestration, parallel execution, idempotency, and HITL approval management.

Follows Clean Architecture: Pure orchestration logic without direct framework or SDK imports.
"""

import asyncio
import json
import logging
import time
import uuid
from typing import Any

from onusfit_ai.features.mcp.application.registry import McpToolRegistry
from onusfit_ai.features.mcp.application.security import McpSecurityGuardrails
from onusfit_ai.features.mcp.domain.contracts import (
    AgentApprovalStatus,
    ApprovalTicket,
    IdempotencyRecord,
    McpConfig,
    McpToolCall,
    McpToolDefinition,
    McpToolResult,
)
from onusfit_ai.features.mcp.domain.errors import (
    McpError,
    McpSecurityError,
    McpTimeoutError,
    McpToolExecutionError,
)

logger = logging.getLogger("onusfit_ai.mcp.orchestrator")


class ApprovalManager:
    """Thread-safe state manager for pending human-in-the-loop approvals."""

    def __init__(self, default_ttl_seconds: float = 300.0) -> None:
        self._tickets: dict[str, ApprovalTicket] = {}
        self._default_ttl = default_ttl_seconds

    def create_ticket(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        user_id: str,
        request_id: str,
        summary: str,
    ) -> ApprovalTicket:
        """Issue a new approval ticket for human confirmation."""
        now = time.time()
        ticket_id = str(uuid.uuid4())
        ticket = ApprovalTicket(
            approval_id=ticket_id,
            tool_name=tool_name,
            arguments=arguments,
            user_id=user_id,
            request_id=request_id,
            summary=summary,
            created_at=now,
            expires_at=now + self._default_ttl,
            status=AgentApprovalStatus.PENDING,
        )
        self._tickets[ticket_id] = ticket
        logger.info("Created HITL approval ticket %s for user %s (tool: %s)", ticket_id, user_id, tool_name)
        return ticket

    def get_ticket(self, approval_id: str) -> ApprovalTicket | None:
        """Retrieve ticket if existing and unexpired."""
        ticket = self._tickets.get(approval_id)
        if not ticket:
            return None
        if time.time() > ticket.expires_at:
            ticket.status = AgentApprovalStatus.EXPIRED
        return ticket

    def approve_ticket(self, approval_id: str, user_id: str) -> ApprovalTicket:
        """Mark ticket as approved by the authenticated user."""
        ticket = self.get_ticket(approval_id)
        if not ticket:
            raise McpError(f"Approval ticket '{approval_id}' not found", code="TICKET_NOT_FOUND")
        if ticket.user_id != user_id:
            raise McpSecurityError("Unauthorized: ticket does not belong to user")
        if ticket.status == AgentApprovalStatus.EXPIRED:
            raise McpError(f"Approval ticket '{approval_id}' has expired", code="TICKET_EXPIRED")
        ticket.status = AgentApprovalStatus.APPROVED
        return ticket

    def reject_ticket(self, approval_id: str, user_id: str) -> ApprovalTicket:
        """Mark ticket as explicitly rejected."""
        ticket = self.get_ticket(approval_id)
        if not ticket:
            raise McpError(f"Approval ticket '{approval_id}' not found", code="TICKET_NOT_FOUND")
        if ticket.user_id != user_id:
            raise McpSecurityError("Unauthorized: ticket does not belong to user")
        ticket.status = AgentApprovalStatus.REJECTED
        return ticket


class IdempotencyManager:
    """In-memory cache tracking idempotent write operations."""

    def __init__(self) -> None:
        self._records: dict[str, IdempotencyRecord] = {}

    def get_record(self, key: str) -> IdempotencyRecord | None:
        return self._records.get(key)

    def record_execution(self, key: str, tool_name: str, result: dict[str, Any]) -> None:
        self._records[key] = IdempotencyRecord(
            key=key,
            tool_name=tool_name,
            result=result,
            created_at=time.time(),
        )


class AgentToolOrchestrator:
    """Orchestrates dynamic discovery, parallel execution, and safety-gated execution."""

    def __init__(
        self,
        registry: McpToolRegistry,
        guardrails: McpSecurityGuardrails | None = None,
        approval_manager: ApprovalManager | None = None,
        idempotency_manager: IdempotencyManager | None = None,
        config: McpConfig | None = None,
    ) -> None:
        self.registry = registry
        self.config = config or McpConfig()
        self.guardrails = guardrails or McpSecurityGuardrails(self.config)
        self.approval_mgr = approval_manager or ApprovalManager()
        self.idempotency_mgr = idempotency_manager or IdempotencyManager()

    def discover_tools(self, filter_read_only: bool = False) -> list[McpToolDefinition]:
        """Discover tools registered in the ecosystem."""
        return self.registry.list_tools(filter_read_only=filter_read_only)

    async def execute_tool(self, call: McpToolCall) -> McpToolResult:
        """Validate, govern, and execute a single tool invocation."""
        start_time = time.perf_counter()
        tool_name = call.tool_name

        try:
            # 1. Allowlist enforcement
            self.guardrails.validate_tool_allowed(tool_name)

            # 2. Tool definition lookup
            definition = self.registry.get_tool(tool_name)
            handler = self.registry.get_tool_handler(tool_name)
            if not definition or not handler:
                raise McpToolExecutionError(tool_name, "Tool not registered in registry")

            # 3. Schema validation
            validated_args = self.guardrails.validate_tool_arguments(tool_name, call.arguments)

            # 4. Human-In-The-Loop gating for Write operations
            if definition.is_write:
                confirmed = validated_args.get("confirmed", False)
                if not confirmed:
                    summary = f"Requires human approval before executing '{tool_name}'"
                    ticket = self.approval_mgr.create_ticket(
                        tool_name=tool_name,
                        arguments=validated_args,
                        user_id=call.user_id,
                        request_id=call.request_id,
                        summary=summary,
                    )
                    content = (
                        f"ACTION REQUIRED: Tool '{tool_name}' requires your approval to proceed.\n"
                        f"Approval ID: {ticket.approval_id}\n"
                        f"Summary: {summary}\n"
                        f"Arguments: {json.dumps(validated_args)}"
                    )
                    return McpToolResult(
                        tool_name=tool_name,
                        content=content,
                        structured_data={"requires_approval": True, "approval_id": ticket.approval_id},
                        is_error=False,
                        requires_approval=True,
                        approval_ticket=ticket,
                        execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
                    )

                # Confirmed write: check idempotency key to prevent duplicate execution
                idempotency_key = validated_args.get("idempotency_key")
                if idempotency_key:
                    existing = self.idempotency_mgr.get_record(idempotency_key)
                    if existing:
                        logger.info("Returning idempotent cached result for key '%s'", idempotency_key)
                        return McpToolResult(
                            tool_name=tool_name,
                            content=json.dumps(existing.result),
                            structured_data=existing.result,
                            is_error=False,
                            execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
                        )

            # 5. Execute handler with timeout ceiling
            timeout = call.timeout_seconds or self.config.per_tool_timeout_seconds
            try:
                raw_result = await asyncio.wait_for(
                    handler(validated_args, call.user_id, call.request_id),
                    timeout=timeout,
                )
            except TimeoutError as exc:
                raise McpTimeoutError(tool_name, timeout) from exc

            # 6. Idempotency store on successful write
            if definition.is_write and validated_args.get("idempotency_key"):
                self.idempotency_mgr.record_execution(
                    validated_args["idempotency_key"], tool_name, raw_result
                )

            # 7. Format content and sanitize output
            content_str = json.dumps(raw_result) if isinstance(raw_result, (dict, list)) else str(raw_result)
            sanitized_content = self.guardrails.sanitize_tool_output(tool_name, content_str)

            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            return McpToolResult(
                tool_name=tool_name,
                content=sanitized_content,
                structured_data=raw_result if isinstance(raw_result, dict) else {"result": raw_result},
                is_error=False,
                execution_time_ms=elapsed_ms,
            )

        except Exception as exc:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            error_msg = f"Tool '{tool_name}' execution error: {exc}"
            logger.warning(error_msg, extra={"tool": tool_name, "requestId": call.request_id})
            return McpToolResult(
                tool_name=tool_name,
                content=json.dumps({"error": str(exc), "tool": tool_name}),
                structured_data={"error": str(exc), "tool": tool_name},
                is_error=True,
                error_message=str(exc),
                execution_time_ms=elapsed_ms,
            )

    async def execute_parallel_reads(self, calls: list[McpToolCall]) -> list[McpToolResult]:
        """Execute multiple independent read-only tool calls concurrently."""
        for call in calls:
            definition = self.registry.get_tool(call.tool_name)
            if definition and definition.is_write:
                raise McpSecurityError(
                    f"Tool '{call.tool_name}' is a mutating write operation and cannot be run in parallel batch."
                )

        tasks = [self.execute_tool(c) for c in calls]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        return list(results)

    async def confirm_and_execute(
        self,
        approval_id: str,
        user_id: str,
        request_id: str,
    ) -> McpToolResult:
        """Confirm a pending approval ticket and execute the gated write operation."""
        ticket = self.approval_mgr.approve_ticket(approval_id, user_id)
        args_with_confirmation = dict(ticket.arguments)
        args_with_confirmation["confirmed"] = True

        call = McpToolCall(
            tool_name=ticket.tool_name,
            arguments=args_with_confirmation,
            user_id=user_id,
            request_id=request_id,
        )
        return await self.execute_tool(call)
