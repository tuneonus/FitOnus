"""Agent tool orchestration, parallel execution, idempotency, and HITL approval management.

Follows Clean Architecture: Pure orchestration logic without direct framework or SDK imports.
"""

import asyncio
import copy
import hashlib
import hmac
import json
import logging
import threading
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
from onusfit_ai.shared.logging import log_event, metrics_registry, start_async_span

logger = logging.getLogger("onusfit_ai.mcp.orchestrator")


def compute_payload_hash(user_id: str, tool_name: str, arguments: dict[str, Any]) -> str:
    """Compute canonical SHA-256 hash binding user identity, tool name, and arguments."""
    clean_args = {k: v for k, v in arguments.items() if k != "confirmed"}
    canonical = json.dumps(
        {
            "user_id": user_id.strip(),
            "tool_name": tool_name,
            "arguments": clean_args,
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class ApprovalManager:
    """Thread-safe state manager for pending human-in-the-loop approvals."""

    def __init__(self, default_ttl_seconds: float = 300.0) -> None:
        self._tickets: dict[str, ApprovalTicket] = {}
        self._default_ttl = default_ttl_seconds
        self._lock = threading.Lock()

    def create_ticket(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        user_id: str,
        request_id: str,
        summary: str,
    ) -> ApprovalTicket:
        """Issue a new single-use, payload-bound approval ticket for human confirmation."""
        uid = user_id.strip()
        if not uid:
            raise McpSecurityError("Authenticated user_id is required to create an approval ticket")

        clean_args = copy.deepcopy({k: v for k, v in arguments.items() if k != "confirmed"})
        payload_hash = compute_payload_hash(uid, tool_name, clean_args)
        now = time.time()
        ticket_id = str(uuid.uuid4())
        ticket = ApprovalTicket(
            approval_id=ticket_id,
            tool_name=tool_name,
            arguments=clean_args,
            user_id=uid,
            request_id=request_id,
            summary=summary,
            created_at=now,
            expires_at=now + self._default_ttl,
            status=AgentApprovalStatus.PENDING,
            payload_hash=payload_hash,
        )
        with self._lock:
            self._tickets[ticket_id] = ticket
        logger.info("Created HITL approval ticket %s (tool: %s)", ticket_id, tool_name)
        return ticket.model_copy(deep=True)

    def get_ticket(self, approval_id: str) -> ApprovalTicket | None:
        """Retrieve ticket if existing and check expiration."""
        with self._lock:
            ticket = self._tickets.get(approval_id)
            if not ticket:
                return None
            if ticket.status == AgentApprovalStatus.PENDING and time.time() > ticket.expires_at:
                ticket.status = AgentApprovalStatus.EXPIRED
            return ticket.model_copy(deep=True)

    def approve_ticket(
        self,
        approval_id: str,
        user_id: str,
        expected_payload_hash: str | None = None,
    ) -> ApprovalTicket:
        """Atomically validate ownership, payload binding, and single-use transition."""
        uid = user_id.strip()
        if not uid:
            raise McpSecurityError("Unauthorized: missing user identity")

        with self._lock:
            ticket = self._tickets.get(approval_id)
            if not ticket:
                raise McpError(
                    f"Approval ticket '{approval_id}' not found", code="TICKET_NOT_FOUND"
                )
            if ticket.user_id != uid:
                raise McpSecurityError("Unauthorized: ticket does not belong to user")
            if ticket.status == AgentApprovalStatus.PENDING and time.time() > ticket.expires_at:
                ticket.status = AgentApprovalStatus.EXPIRED
            if ticket.status == AgentApprovalStatus.EXPIRED:
                raise McpError(
                    f"Approval ticket '{approval_id}' has expired", code="TICKET_EXPIRED"
                )
            if ticket.status != AgentApprovalStatus.PENDING:
                raise McpSecurityError(
                    f"Approval ticket '{approval_id}' cannot be replayed (status: {ticket.status.value})"
                )

            recomputed_hash = compute_payload_hash(
                ticket.user_id, ticket.tool_name, ticket.arguments
            )
            if ticket.payload_hash and not hmac.compare_digest(
                ticket.payload_hash, recomputed_hash
            ):
                raise McpSecurityError("Approval ticket payload integrity check failed")
            if expected_payload_hash is not None and not hmac.compare_digest(
                ticket.payload_hash or recomputed_hash, expected_payload_hash
            ):
                raise McpSecurityError("Approval confirmation payload hash mismatch")

            ticket.status = AgentApprovalStatus.APPROVED
            return ticket.model_copy(deep=True)

    def consume_ticket(self, approval_id: str, user_id: str) -> ApprovalTicket:
        """Transition an approved ticket to CONSUMED so it cannot be re-executed."""
        uid = user_id.strip()
        with self._lock:
            ticket = self._tickets.get(approval_id)
            if not ticket:
                raise McpError(
                    f"Approval ticket '{approval_id}' not found", code="TICKET_NOT_FOUND"
                )
            if ticket.user_id != uid:
                raise McpSecurityError("Unauthorized: ticket does not belong to user")
            if ticket.status != AgentApprovalStatus.APPROVED:
                raise McpSecurityError(
                    f"Approval ticket '{approval_id}' is not in approved state (status: {ticket.status.value})"
                )
            ticket.status = AgentApprovalStatus.CONSUMED
            return ticket.model_copy(deep=True)

    def reject_ticket(self, approval_id: str, user_id: str) -> ApprovalTicket:
        """Mark a pending ticket as explicitly rejected."""
        uid = user_id.strip()
        if not uid:
            raise McpSecurityError("Unauthorized: missing user identity")

        with self._lock:
            ticket = self._tickets.get(approval_id)
            if not ticket:
                raise McpError(
                    f"Approval ticket '{approval_id}' not found", code="TICKET_NOT_FOUND"
                )
            if ticket.user_id != uid:
                raise McpSecurityError("Unauthorized: ticket does not belong to user")
            if ticket.status == AgentApprovalStatus.PENDING and time.time() > ticket.expires_at:
                ticket.status = AgentApprovalStatus.EXPIRED
            if ticket.status != AgentApprovalStatus.PENDING:
                raise McpSecurityError(
                    f"Approval ticket '{approval_id}' cannot be rejected (status: {ticket.status.value})"
                )
            ticket.status = AgentApprovalStatus.REJECTED
            return ticket.model_copy(deep=True)


class IdempotencyManager:
    """Thread-safe, user-scoped in-memory cache tracking idempotent write operations."""

    def __init__(self, default_ttl_seconds: float = 3600.0) -> None:
        self._records: dict[tuple[str, str, str], IdempotencyRecord] = {}
        self._default_ttl = default_ttl_seconds
        self._lock = threading.Lock()

    def get_record(
        self,
        key: str,
        *,
        user_id: str = "",
        tool_name: str = "",
        payload_hash: str | None = None,
    ) -> IdempotencyRecord | None:
        uid = user_id.strip()
        composite = (uid, tool_name, key)
        now = time.time()
        with self._lock:
            record = self._records.get(composite)
            if record is None and not uid and not tool_name:
                # Backward-compatible lookup only when caller passed neither user_id nor tool_name
                record = next(
                    (
                        rec
                        for (_, _, rec_key), rec in self._records.items()
                        if rec_key == key and not rec.user_id
                    ),
                    None,
                )
            if record is None:
                return None
            if record.expires_at is not None and now > record.expires_at:
                self._records.pop((record.user_id, record.tool_name, record.key), None)
                return None
            if (
                payload_hash
                and record.payload_hash
                and not hmac.compare_digest(record.payload_hash, payload_hash)
            ):
                raise McpSecurityError(f"Idempotency key '{key}' reused with conflicting payload")
            return record.model_copy(deep=True)

    def record_execution(
        self,
        key: str,
        tool_name: str,
        result: dict[str, Any],
        *,
        user_id: str = "",
        payload_hash: str = "",
        ttl_seconds: float | None = None,
    ) -> None:
        uid = user_id.strip()
        now = time.time()
        ttl = self._default_ttl if ttl_seconds is None else ttl_seconds
        record = IdempotencyRecord(
            key=key,
            tool_name=tool_name,
            result=copy.deepcopy(result),
            created_at=now,
            user_id=uid,
            payload_hash=payload_hash,
            expires_at=now + ttl,
        )
        with self._lock:
            self._records[(uid, tool_name, key)] = record


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
        return await self._execute_tool_internal(call, approved_ticket=None)

    async def _execute_tool_internal(
        self,
        call: McpToolCall,
        *,
        approved_ticket: ApprovalTicket | None = None,
    ) -> McpToolResult:
        start_time = time.perf_counter()
        tool_name = call.tool_name

        try:
            # 0. Authenticated user identity and payload size verification
            if not call.user_id or not call.user_id.strip():
                raise McpSecurityError("Authenticated user_id is required for tool execution")
            payload_bytes = len(json.dumps(call.arguments, default=str).encode("utf-8"))
            self.guardrails.validate_request_size(payload_bytes)

            # 1. Allowlist enforcement
            self.guardrails.validate_tool_allowed(tool_name)

            # 2. Tool definition lookup
            definition = self.registry.get_tool(tool_name)
            handler = self.registry.get_tool_handler(tool_name)
            if not definition or not handler:
                raise McpToolExecutionError(tool_name, "Tool not registered in registry")

            # 3. Schema validation
            validated_args = self.guardrails.validate_tool_arguments(tool_name, call.arguments)
            payload_hash = compute_payload_hash(call.user_id, tool_name, validated_args)

            # 4. Human-In-The-Loop gating for Write operations
            if definition.is_write:
                if approved_ticket is None:
                    if self.config.strict_hitl_tickets and validated_args.get("confirmed") is True:
                        raise McpSecurityError(
                            "Direct write confirmation is forbidden without a valid approval ticket"
                        )
                    if (
                        not validated_args.get("confirmed", False)
                        or self.config.strict_hitl_tickets
                    ):
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
                            f"Payload Hash: {ticket.payload_hash}"
                        )
                        return McpToolResult(
                            tool_name=tool_name,
                            content=content,
                            structured_data={
                                "requires_approval": True,
                                "approval_id": ticket.approval_id,
                                "payload_hash": ticket.payload_hash,
                            },
                            is_error=False,
                            requires_approval=True,
                            approval_ticket=ticket,
                            execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
                        )
                else:
                    if (
                        approved_ticket.user_id != call.user_id.strip()
                        or approved_ticket.tool_name != tool_name
                        or not hmac.compare_digest(approved_ticket.payload_hash, payload_hash)
                    ):
                        raise McpSecurityError("Approval ticket binding validation failed")

                # Confirmed write: check user-scoped idempotency key to prevent duplicate execution
                idempotency_key = validated_args.get("idempotency_key")
                if not idempotency_key and approved_ticket is not None:
                    idempotency_key = f"approval-{approved_ticket.approval_id}"

                if idempotency_key:
                    existing = self.idempotency_mgr.get_record(
                        idempotency_key,
                        user_id=call.user_id,
                        tool_name=tool_name,
                        payload_hash=payload_hash,
                    )
                    if existing:
                        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
                        logger.info("Returning idempotent cached result for tool '%s'", tool_name)
                        try:
                            metrics_registry.record_tool_call(
                                tool_name=tool_name,
                                duration_ms=elapsed_ms,
                                success=True,
                                cached=True,
                            )
                            log_event(
                                logger,
                                "mcp.tool.completed",
                                message="MCP tool served from idempotency cache",
                                aiRequestId=call.request_id,
                                tool=tool_name,
                                cached=True,
                                durationMs=round(elapsed_ms, 2),
                                success=True,
                            )
                        except Exception:  # noqa: BLE001 - fail-open observability
                            pass
                        return McpToolResult(
                            tool_name=tool_name,
                            content=json.dumps(existing.result),
                            structured_data=existing.result,
                            is_error=False,
                            execution_time_ms=elapsed_ms,
                        )

            # 5. Execute handler with timeout ceiling
            timeout = call.timeout_seconds or self.config.per_tool_timeout_seconds
            async with start_async_span(
                f"mcp.orchestrator.{tool_name}",
                attributes={"tool": tool_name, "isWrite": definition.is_write},
            ):
                try:
                    raw_result = await asyncio.wait_for(
                        handler(validated_args, call.user_id, call.request_id),
                        timeout=timeout,
                    )
                except TimeoutError as exc:
                    raise McpTimeoutError(tool_name, timeout) from exc

            # 6. Idempotency store on successful write
            if definition.is_write:
                idempotency_key = validated_args.get("idempotency_key") or (
                    f"approval-{approved_ticket.approval_id}"
                    if approved_ticket is not None
                    else None
                )
                if idempotency_key:
                    self.idempotency_mgr.record_execution(
                        idempotency_key,
                        tool_name,
                        raw_result,
                        user_id=call.user_id,
                        payload_hash=payload_hash,
                    )

            # 7. Format content and sanitize output
            content_str = (
                json.dumps(raw_result) if isinstance(raw_result, (dict, list)) else str(raw_result)
            )
            sanitized_content = self.guardrails.sanitize_tool_output(tool_name, content_str)

            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            try:
                metrics_registry.record_tool_call(
                    tool_name=tool_name,
                    duration_ms=elapsed_ms,
                    success=True,
                    cached=False,
                )
                log_event(
                    logger,
                    "mcp.tool.completed",
                    message="MCP tool execution completed",
                    aiRequestId=call.request_id,
                    tool=tool_name,
                    cached=False,
                    durationMs=round(elapsed_ms, 2),
                    success=True,
                )
            except Exception:  # noqa: BLE001 - fail-open observability
                pass
            return McpToolResult(
                tool_name=tool_name,
                content=sanitized_content,
                structured_data=raw_result
                if isinstance(raw_result, dict)
                else {"result": raw_result},
                is_error=False,
                execution_time_ms=elapsed_ms,
            )

        except Exception as exc:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            safe_error = self.guardrails.sanitize_tool_output(tool_name, str(exc))
            try:
                metrics_registry.record_tool_call(
                    tool_name=tool_name,
                    duration_ms=elapsed_ms,
                    success=False,
                    cached=False,
                )
                log_event(
                    logger,
                    "mcp.tool.failed",
                    level=logging.WARNING,
                    message="MCP tool execution failed",
                    aiRequestId=call.request_id,
                    tool=tool_name,
                    errorType=type(exc).__name__,
                    durationMs=round(elapsed_ms, 2),
                    success=False,
                )
            except Exception:  # noqa: BLE001 - fail-open observability
                pass
            return McpToolResult(
                tool_name=tool_name,
                content=json.dumps({"error": safe_error, "tool": tool_name}),
                structured_data={"error": safe_error, "tool": tool_name},
                is_error=True,
                error_message=safe_error,
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
        *,
        expected_payload_hash: str | None = None,
    ) -> McpToolResult:
        """Confirm a pending approval ticket and execute the gated write operation once."""
        self.approval_mgr.approve_ticket(
            approval_id,
            user_id,
            expected_payload_hash=expected_payload_hash,
        )
        # Transition immediately to CONSUMED to prevent concurrent replay
        consumed_ticket = self.approval_mgr.consume_ticket(approval_id, user_id)

        args_with_confirmation = copy.deepcopy(consumed_ticket.arguments)
        args_with_confirmation["confirmed"] = True

        call = McpToolCall(
            tool_name=consumed_ticket.tool_name,
            arguments=args_with_confirmation,
            user_id=user_id.strip(),
            request_id=request_id,
        )
        return await self._execute_tool_internal(call, approved_ticket=consumed_ticket)
