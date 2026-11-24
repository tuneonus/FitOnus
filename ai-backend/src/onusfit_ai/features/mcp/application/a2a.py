"""Agent-to-Agent (A2A) protocol evaluation and multi-agent coordination.

Evaluates and implements structured peer-to-peer / mediator message passing
for autonomous specialized agents (Coach Agent <-> Workout Planner Agent <-> Nutrition Agent).
"""

import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("onusfit_ai.mcp.a2a")


class A2APerformative(StrEnum):
    """FIPA-ACL inspired communicative acts for agent collaboration."""

    REQUEST = "request"  # Sender asks recipient to execute a task
    INFORM = "inform"  # Sender transmits information/state to recipient
    AGREE = "agree"  # Recipient accepts a requested task
    REFUSE = "refuse"  # Recipient rejects a task request due to constraints
    CONFIRM = "confirm"  # Sender/recipient confirms a proposed artifact
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
    timestamp: float = Field(default_factory=time.time)


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


class A2ATaskResponse(BaseModel):
    """Result returned by specialist agent following task delegation."""

    model_config = ConfigDict(extra="forbid")

    task_id: str
    status: str = Field(description="'completed', 'refused', or 'failed'")
    output_data: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = None
    execution_time_ms: float = Field(default=0.0)


AgentHandler = Callable[[A2AMessage], Awaitable[A2AMessage]]


class A2AMediator:
    """Decoupled message broker orchestrating Agent-to-Agent task delegation."""

    def __init__(self) -> None:
        self._agents: dict[str, AgentHandler] = {}
        self._conversation_history: dict[str, list[A2AMessage]] = {}

    def register_agent(self, agent_id: str, handler: AgentHandler) -> None:
        """Register an autonomous agent handler."""
        self._agents[agent_id] = handler
        logger.info("Registered A2A agent '%s'", agent_id)

    async def send_message(self, message: A2AMessage) -> A2AMessage:
        """Deliver a message to target agent and record conversation trace."""
        recipient = message.recipient_agent
        handler = self._agents.get(recipient)
        if not handler:
            return A2AMessage(
                conversation_id=message.conversation_id,
                sender_agent="a2a_mediator",
                recipient_agent=message.sender_agent,
                performative=A2APerformative.FAILURE,
                payload={"error": f"Recipient agent '{recipient}' is not registered"},
                in_reply_to=message.message_id,
            )

        # Track history
        history = self._conversation_history.setdefault(message.conversation_id, [])
        history.append(message)

        # Dispatch
        start = time.perf_counter()
        response = await handler(message)
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
        task: A2ATaskRequest,
        conversation_id: str | None = None,
    ) -> A2ATaskResponse:
        """Convenience method for synchronous request-response task delegation."""
        conv_id = conversation_id or str(uuid.uuid4())
        msg = A2AMessage(
            conversation_id=conv_id,
            sender_agent=sender,
            recipient_agent=recipient,
            performative=A2APerformative.REQUEST,
            payload=task.model_dump(),
        )

        reply = await self.send_message(msg)

        if reply.performative == A2APerformative.FAILURE:
            return A2ATaskResponse(
                task_id=task.task_id,
                status="failed",
                error_message=reply.payload.get("error", "Unknown A2A failure"),
            )
        if reply.performative == A2APerformative.REFUSE:
            return A2ATaskResponse(
                task_id=task.task_id,
                status="refused",
                error_message=reply.payload.get("reason", "Task refused by agent"),
            )

        return A2ATaskResponse(
            task_id=task.task_id,
            status="completed",
            output_data=reply.payload.get("result", reply.payload),
        )

    def get_conversation_trace(self, conversation_id: str) -> list[A2AMessage]:
        """Retrieve full trace of messages in a conversation."""
        return list(self._conversation_history.get(conversation_id, []))
