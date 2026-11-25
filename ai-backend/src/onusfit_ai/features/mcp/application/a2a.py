"""Agent-to-Agent (A2A) protocol evaluation and multi-agent coordination.

Evaluates and implements structured in-process mediator message passing
for autonomous specialized agents (Supervisor <-> Workout <-> Nutrition <-> Progress <-> Recovery <-> Knowledge).
Note: This is an internal FIPA-ACL-inspired mediator, not external HTTP/JSON-RPC A2A federation.
Internal A2A messaging stays strictly distinct from MCP tool execution.
"""

import asyncio
import copy
import hashlib
import json
import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("onusfit_ai.mcp.a2a")


class A2APerformative(StrEnum):
    """FIPA-ACL inspired communicative acts for agent collaboration."""

    REQUEST = "request"  # Sender asks recipient to execute a task
    INFORM = "inform"  # Sender transmits information/state to recipient
    AGREE = "agree"  # Recipient accepts a requested task
    REFUSE = "refuse"  # Recipient rejects a task request due to constraints
    CONFIRM = "confirm"  # Sender/recipient confirms a proposed artifact
    PARTIAL = "partial"  # Recipient returns partial results under constraint
    CANCEL = "cancel"  # Coordinator cancels in-flight or pending task
    FAILURE = "failure"  # Task execution encountered an unrecoverable error


class A2AMessage(BaseModel):
    """Standard message envelope for inter-agent communication."""

    model_config = ConfigDict(extra="forbid")

    message_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str
    sender_agent: str
    recipient_agent: str
    performative: A2APerformative
    payload: dict[str, Any] = Field(default_factory=dict)
    in_reply_to: str | None = None
    correlation_id: str | None = None
    task_id: str | None = None
    error_code: str | None = None
    timestamp: float = Field(default_factory=time.time)


class A2AAgentCard(BaseModel):
    """Discoverable agent registration card with capabilities and availability."""

    model_config = ConfigDict(extra="forbid")

    agent_id: str
    role: str = ""
    description: str = ""
    capabilities: list[str] = Field(default_factory=list)
    available: bool = True
    supports_parallel: bool = True


class A2ATaskRequest(BaseModel):
    """Task delegation contract sent from orchestrator to specialist agent."""

    model_config = ConfigDict(extra="forbid")

    task_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    task_type: str = Field(description="Type of task (e.g. 'generate_specialist_plan')")
    instructions: str
    input_data: dict[str, Any] = Field(default_factory=dict)
    constraints: list[str] = Field(default_factory=list)
    user_id: str
    timeout_seconds: float = Field(default=15.0)
    correlation_id: str | None = None
    parent_task_id: str | None = None
    depth: int = Field(default=0, ge=0)
    depends_on: list[str] = Field(default_factory=list)
    required_capabilities: list[str] = Field(default_factory=list)
    idempotency_key: str | None = None
    delegation_chain: list[str] = Field(default_factory=list)


class A2ATaskResponse(BaseModel):
    """Result returned by specialist agent following task delegation."""

    model_config = ConfigDict(extra="forbid")

    task_id: str
    status: str = Field(description="'completed', 'partial', 'refused', 'cancelled', or 'failed'")
    output_data: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = None
    execution_time_ms: float = Field(default=0.0)
    correlation_id: str | None = None
    sender_agent: str | None = None
    partial: bool = False
    tokens_used: int = 0
    tool_calls_count: int = 0
    cancelled: bool = False
    deduplicated: bool = False


class A2ADagTaskSpec(BaseModel):
    """Dependency-aware task node executed by A2AMediator.execute_task_dag."""

    model_config = ConfigDict(extra="forbid")

    task_id: str
    sender: str
    recipient: str
    task: A2ATaskRequest
    depends_on: list[str] = Field(default_factory=list)
    dependency_type: Literal["required", "optional"] = "required"


AgentHandler = Callable[[A2AMessage], Awaitable[A2AMessage]]


class A2AMediator:
    """Decoupled in-process message broker orchestrating Agent-to-Agent task delegation."""

    def __init__(self) -> None:
        self._agents: dict[str, AgentHandler] = {}
        self._agent_cards: dict[str, A2AAgentCard] = {}
        self._conversation_history: dict[str, list[A2AMessage]] = {}
        self._cancelled_conversations: dict[str, str] = {}
        self._task_cache: dict[tuple[str, str, str], A2ATaskResponse] = {}

    def register_agent(
        self,
        agent_id: str,
        handler: AgentHandler,
        *,
        role: str = "",
        description: str = "",
        capabilities: list[str] | None = None,
        available: bool = True,
        supports_parallel: bool = True,
    ) -> None:
        """Register an autonomous agent handler with optional capability card."""
        self._agents[agent_id] = handler
        self._agent_cards[agent_id] = A2AAgentCard(
            agent_id=agent_id,
            role=role or agent_id,
            description=description,
            capabilities=list(capabilities or []),
            available=available,
            supports_parallel=supports_parallel,
        )
        logger.info("Registered A2A agent '%s'", agent_id)

    def set_agent_availability(self, agent_id: str, available: bool) -> None:
        """Toggle runtime availability for a registered agent."""
        card = self._agent_cards.get(agent_id)
        if card is not None:
            self._agent_cards[agent_id] = card.model_copy(update={"available": available})

    def discover_agents(
        self,
        capability: str | None = None,
        *,
        only_available: bool = True,
    ) -> list[A2AAgentCard]:
        """Discover registered agents optionally filtered by capability and availability."""
        cards = list(self._agent_cards.values())
        if only_available:
            cards = [c for c in cards if c.available]
        if capability is not None:
            cards = [c for c in cards if capability in c.capabilities]
        return [c.model_copy(deep=True) for c in cards]

    def cancel_conversation(self, conversation_id: str, reason: str = "cancelled") -> None:
        """Mark a request/conversation cancelled to halt further delegations."""
        self._cancelled_conversations[conversation_id] = reason

    def is_cancelled(self, conversation_id: str) -> bool:
        """Return True if the conversation has been cancelled."""
        return conversation_id in self._cancelled_conversations

    def _task_signature(self, recipient: str, task: A2ATaskRequest) -> str:
        if task.idempotency_key:
            return f"key:{task.idempotency_key}"
        raw = json.dumps(
            {
                "recipient": recipient,
                "task_type": task.task_type,
                "instructions": task.instructions,
                "input_data": {k: v for k, v in task.input_data.items() if k != "upstream_results"},
                "user_id": task.user_id,
            },
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    async def send_message(self, message: A2AMessage) -> A2AMessage:
        """Deliver a message to target agent and record correlated conversation trace."""
        corr_id = message.correlation_id or message.conversation_id
        if self.is_cancelled(message.conversation_id):
            return A2AMessage(
                conversation_id=message.conversation_id,
                sender_agent="a2a_mediator",
                recipient_agent=message.sender_agent,
                performative=A2APerformative.CANCEL,
                payload={"reason": self._cancelled_conversations[message.conversation_id]},
                in_reply_to=message.message_id,
                correlation_id=corr_id,
                task_id=message.task_id,
            )

        recipient = message.recipient_agent
        handler = self._agents.get(recipient)
        card = self._agent_cards.get(recipient)
        if not handler:
            return A2AMessage(
                conversation_id=message.conversation_id,
                sender_agent="a2a_mediator",
                recipient_agent=message.sender_agent,
                performative=A2APerformative.FAILURE,
                payload={"error": f"Recipient agent '{recipient}' is not registered"},
                in_reply_to=message.message_id,
                correlation_id=corr_id,
                task_id=message.task_id,
                error_code="AGENT_NOT_REGISTERED",
            )
        if card is not None and not card.available:
            return A2AMessage(
                conversation_id=message.conversation_id,
                sender_agent="a2a_mediator",
                recipient_agent=message.sender_agent,
                performative=A2APerformative.FAILURE,
                payload={"error": f"Recipient agent '{recipient}' is unavailable"},
                in_reply_to=message.message_id,
                correlation_id=corr_id,
                task_id=message.task_id,
                error_code="AGENT_UNAVAILABLE",
            )

        history = self._conversation_history.setdefault(message.conversation_id, [])
        history.append(message)

        start = time.perf_counter()
        try:
            response = await handler(message)
        except Exception as exc:
            response = A2AMessage(
                conversation_id=message.conversation_id,
                sender_agent=recipient,
                recipient_agent=message.sender_agent,
                performative=A2APerformative.FAILURE,
                payload={"error": f"Agent '{recipient}' execution failed: {type(exc).__name__}"},
                in_reply_to=message.message_id,
                correlation_id=corr_id,
                task_id=message.task_id,
                error_code="AGENT_HANDLER_ERROR",
            )
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        logger.debug(
            "A2A %s -> %s completed in %.2fms",
            message.sender_agent,
            recipient,
            elapsed_ms,
        )

        history.append(response)
        return response

    async def delegate_task(
        self,
        sender: str,
        recipient: str,
        task: A2ATaskRequest | dict[str, Any],
        conversation_id: str | None = None,
        *,
        max_depth: int = 1,
    ) -> A2ATaskResponse:
        """Structured task delegation with cycle guard, correlation, timeout, and dedup."""
        task_req = A2ATaskRequest.model_validate(task) if isinstance(task, dict) else task
        conv_id = conversation_id or str(uuid.uuid4())
        corr_id = task_req.correlation_id or conv_id
        start = time.perf_counter()

        # 1. Cancellation check
        if self.is_cancelled(conv_id):
            return A2ATaskResponse(
                task_id=task_req.task_id,
                status="cancelled",
                error_message=self._cancelled_conversations[conv_id],
                correlation_id=corr_id,
                sender_agent=recipient,
                cancelled=True,
            )

        # 2. Circular delegation and depth protection
        if recipient == sender or recipient in task_req.delegation_chain:
            return A2ATaskResponse(
                task_id=task_req.task_id,
                status="refused",
                error_message=f"Circular delegation blocked: '{sender}' -> '{recipient}'",
                correlation_id=corr_id,
                sender_agent=recipient,
            )
        if task_req.depth > max_depth:
            return A2ATaskResponse(
                task_id=task_req.task_id,
                status="refused",
                error_message=(
                    f"Maximum delegation depth {max_depth} exceeded (depth={task_req.depth})"
                ),
                correlation_id=corr_id,
                sender_agent=recipient,
            )

        # 3. Capability check if declared on task
        card = self._agent_cards.get(recipient)
        if card is not None and task_req.required_capabilities:
            missing_caps = [c for c in task_req.required_capabilities if c not in card.capabilities]
            if missing_caps:
                return A2ATaskResponse(
                    task_id=task_req.task_id,
                    status="refused",
                    error_message=f"Agent '{recipient}' lacks required capabilities: {missing_caps}",
                    correlation_id=corr_id,
                    sender_agent=recipient,
                )

        # 4. Duplicate task prevention within conversation
        sig = self._task_signature(recipient, task_req)
        cache_key = (conv_id, recipient, sig)
        cached = self._task_cache.get(cache_key)
        if cached is not None:
            return cached.model_copy(
                update={
                    "task_id": task_req.task_id,
                    "correlation_id": corr_id,
                    "deduplicated": True,
                }
            )

        delegated_payload = task_req.model_dump()
        delegated_payload["delegation_chain"] = [*task_req.delegation_chain, sender]
        msg = A2AMessage(
            conversation_id=conv_id,
            sender_agent=sender,
            recipient_agent=recipient,
            performative=A2APerformative.REQUEST,
            payload=delegated_payload,
            correlation_id=corr_id,
            task_id=task_req.task_id,
        )

        try:
            reply = await asyncio.wait_for(
                self.send_message(msg), timeout=task_req.timeout_seconds
            )
        except TimeoutError:
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            return A2ATaskResponse(
                task_id=task_req.task_id,
                status="failed",
                error_message=f"Task '{task_req.task_id}' timed out after {task_req.timeout_seconds}s",
                execution_time_ms=elapsed_ms,
                correlation_id=corr_id,
                sender_agent=recipient,
            )

        elapsed_ms = (time.perf_counter() - start) * 1000.0
        if reply.performative == A2APerformative.CANCEL:
            return A2ATaskResponse(
                task_id=task_req.task_id,
                status="cancelled",
                error_message=reply.payload.get("reason", "Task cancelled"),
                execution_time_ms=elapsed_ms,
                correlation_id=corr_id,
                sender_agent=recipient,
                cancelled=True,
            )
        if reply.performative == A2APerformative.FAILURE:
            return A2ATaskResponse(
                task_id=task_req.task_id,
                status="failed",
                error_message=reply.payload.get("error", "Unknown A2A failure"),
                execution_time_ms=elapsed_ms,
                correlation_id=corr_id,
                sender_agent=recipient,
            )
        if reply.performative == A2APerformative.REFUSE:
            return A2ATaskResponse(
                task_id=task_req.task_id,
                status="refused",
                error_message=reply.payload.get("reason", "Task refused by agent"),
                execution_time_ms=elapsed_ms,
                correlation_id=corr_id,
                sender_agent=recipient,
            )

        output_data = reply.payload.get("result", reply.payload)
        is_partial = reply.performative == A2APerformative.PARTIAL or bool(
            isinstance(output_data, dict) and output_data.get("partial")
        )
        res = A2ATaskResponse(
            task_id=task_req.task_id,
            status="partial" if is_partial else "completed",
            output_data=output_data if isinstance(output_data, dict) else {"value": output_data},
            execution_time_ms=elapsed_ms,
            correlation_id=corr_id,
            sender_agent=recipient,
            partial=is_partial,
            tokens_used=int(reply.payload.get("tokens_used", 0))
            if isinstance(reply.payload, dict)
            else 0,
            tool_calls_count=int(reply.payload.get("tool_calls_count", 0))
            if isinstance(reply.payload, dict)
            else 0,
        )
        self._task_cache[cache_key] = res.model_copy(deep=True)
        return res

    async def execute_task_dag(
        self,
        specs: list[A2ADagTaskSpec | dict[str, Any]],
        conversation_id: str,
        *,
        max_concurrency: int = 3,
        max_depth: int = 1,
        deadline: float | None = None,
    ) -> list[A2ATaskResponse]:
        """Execute tasks respecting dependencies, bounded parallelism, and failure propagation."""
        if not specs:
            return []

        norm_specs = [
            A2ADagTaskSpec.model_validate(s) if isinstance(s, dict) else s for s in specs
        ]
        spec_map = {s.task_id: s for s in norm_specs}
        completed: dict[str, A2ATaskResponse] = {}
        remaining = dict(spec_map)
        semaphore = asyncio.Semaphore(max_concurrency)

        while remaining:
            if self.is_cancelled(conversation_id):
                for tid, spec in list(remaining.items()):
                    completed[tid] = A2ATaskResponse(
                        task_id=tid,
                        status="cancelled",
                        error_message=self._cancelled_conversations[conversation_id],
                        correlation_id=spec.task.correlation_id or conversation_id,
                        sender_agent=spec.recipient,
                        cancelled=True,
                    )
                break

            if deadline is not None and time.monotonic() >= deadline:
                for tid, spec in list(remaining.items()):
                    completed[tid] = A2ATaskResponse(
                        task_id=tid,
                        status="failed",
                        error_message="Execution deadline exceeded before task dispatch",
                        correlation_id=spec.task.correlation_id or conversation_id,
                        sender_agent=spec.recipient,
                    )
                break

            ready: list[A2ADagTaskSpec] = [
                spec
                for spec in remaining.values()
                if all(dep in completed for dep in spec.depends_on)
            ]
            if not ready:
                # Cycle or unresolvable dependency detected
                for tid, spec in list(remaining.items()):
                    completed[tid] = A2ATaskResponse(
                        task_id=tid,
                        status="failed",
                        error_message="Circular or unresolvable task dependency blocked",
                        correlation_id=spec.task.correlation_id or conversation_id,
                        sender_agent=spec.recipient,
                    )
                break

            async def _run_spec(spec: A2ADagTaskSpec) -> tuple[str, A2ATaskResponse]:
                # Failure propagation from upstream dependencies
                upstream_outputs: dict[str, Any] = {}
                for dep_id in spec.depends_on:
                    dep_res = completed[dep_id]
                    if dep_res.status in ("failed", "refused", "cancelled"):
                        if spec.dependency_type == "required":
                            return spec.task_id, A2ATaskResponse(
                                task_id=spec.task_id,
                                status="failed",
                                error_message=(
                                    f"Skipped due to upstream dependency '{dep_id}' "
                                    f"status '{dep_res.status}'"
                                ),
                                correlation_id=spec.task.correlation_id or conversation_id,
                                sender_agent=spec.recipient,
                            )
                    else:
                        upstream_outputs[dep_id] = copy.deepcopy(dep_res.output_data)

                task_input = copy.deepcopy(spec.task.input_data)
                if upstream_outputs:
                    task_input["upstream_results"] = upstream_outputs
                bound_task = spec.task.model_copy(update={"input_data": task_input})

                async with semaphore:
                    res = await self.delegate_task(
                        sender=spec.sender,
                        recipient=spec.recipient,
                        task=bound_task,
                        conversation_id=conversation_id,
                        max_depth=max_depth,
                    )
                return spec.task_id, res

            batch_results = await asyncio.gather(*[_run_spec(s) for s in ready])
            for tid, res in batch_results:
                completed[tid] = res
                remaining.pop(tid, None)

        return [completed[s.task_id] for s in norm_specs]

    def aggregate_results(self, responses: list[A2ATaskResponse]) -> dict[str, Any]:
        """Aggregate responses across delegated tasks into a structured summary."""
        completed_ids = [r.task_id for r in responses if r.status == "completed"]
        partial_ids = [r.task_id for r in responses if r.status == "partial"]
        failed_ids = [r.task_id for r in responses if r.status in ("failed", "refused", "cancelled")]
        return {
            "total": len(responses),
            "completed": completed_ids,
            "partial": partial_ids,
            "failed": failed_ids,
            "has_partial": bool(partial_ids or (completed_ids and failed_ids)),
            "outputs_by_task": {r.task_id: r.output_data for r in responses},
            "errors_by_task": {
                r.task_id: r.error_message for r in responses if r.error_message
            },
        }

    def get_conversation_trace(self, conversation_id: str) -> list[A2AMessage]:
        """Retrieve full trace of messages in a conversation."""
        return list(self._conversation_history.get(conversation_id, []))
