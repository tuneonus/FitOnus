"""Unit tests for Agent-to-Agent (A2A) protocol evaluation and mediator.

FitOnus Phase 12: AI Agent Protocols & Tool Ecosystem.
"""

import pytest

from onusfit_ai.features.mcp.application.a2a import (
    A2AMediator,
    A2AMessage,
    A2APerformative,
    A2ATaskRequest,
    A2ATaskResponse,
)


@pytest.mark.asyncio
async def test_a2a_mediator_registration_and_message_delivery() -> None:
    mediator = A2AMediator()

    async def coach_handler(msg: A2AMessage) -> A2AMessage:
        return A2AMessage(
            conversation_id=msg.conversation_id,
            sender_agent="coach_agent",
            recipient_agent=msg.sender_agent,
            performative=A2APerformative.INFORM,
            payload={"reply": f"Acknowledged {msg.payload.get('text')}"},
            in_reply_to=msg.message_id,
        )

    mediator.register_agent("coach_agent", coach_handler)

    incoming = A2AMessage(
        conversation_id="conv-101",
        sender_agent="orchestrator",
        recipient_agent="coach_agent",
        performative=A2APerformative.REQUEST,
        payload={"text": "Hello coach"},
    )

    response = await mediator.send_message(incoming)
    assert response.performative == A2APerformative.INFORM
    assert response.payload["reply"] == "Acknowledged Hello coach"
    assert response.in_reply_to == incoming.message_id

    trace = mediator.get_conversation_trace("conv-101")
    assert len(trace) == 2
    assert trace[0].sender_agent == "orchestrator"
    assert trace[1].sender_agent == "coach_agent"


@pytest.mark.asyncio
async def test_a2a_task_delegation_flow() -> None:
    mediator = A2AMediator()

    async def planner_specialist(msg: A2AMessage) -> A2AMessage:
        req = msg.payload
        assert req["task_type"] == "generate_specialist_plan"
        return A2AMessage(
            conversation_id=msg.conversation_id,
            sender_agent="planner_specialist",
            recipient_agent=msg.sender_agent,
            performative=A2APerformative.INFORM,
            payload={
                "result": {
                    "plan_id": "plan-spec-1",
                    "routine_days": 4,
                    "target_goal": req["input_data"].get("goal", "strength"),
                }
            },
            in_reply_to=msg.message_id,
        )

    mediator.register_agent("planner_specialist", planner_specialist)

    task = A2ATaskRequest(
        task_type="generate_specialist_plan",
        instructions="Build 4-day hypertrophy split",
        input_data={"goal": "hypertrophy", "days_per_week": 4},
        user_id="user-456",
    )

    res: A2ATaskResponse = await mediator.delegate_task(
        sender="coach_agent",
        recipient="planner_specialist",
        task=task,
        conversation_id="conv-spec-200",
    )

    assert res.status == "completed"
    assert res.output_data["plan_id"] == "plan-spec-1"
    assert res.output_data["target_goal"] == "hypertrophy"
    assert res.error_message is None


@pytest.mark.asyncio
async def test_a2a_unregistered_agent_returns_failure() -> None:
    mediator = A2AMediator()

    msg = A2AMessage(
        conversation_id="conv-missing",
        sender_agent="coach_agent",
        recipient_agent="ghost_agent",
        performative=A2APerformative.REQUEST,
        payload={"query": "test"},
    )

    reply = await mediator.send_message(msg)
    assert reply.performative == A2APerformative.FAILURE
    assert "not registered" in reply.payload.get("error", "")

    task = A2ATaskRequest(
        task_type="test_task",
        instructions="do something",
        user_id="user-123",
    )
    res = await mediator.delegate_task("coach_agent", "ghost_agent", task)
    assert res.status == "failed"
    assert "not registered" in (res.error_message or "")


@pytest.mark.asyncio
async def test_a2a_agent_refusal_handling() -> None:
    mediator = A2AMediator()

    async def strict_agent(msg: A2AMessage) -> A2AMessage:
        return A2AMessage(
            conversation_id=msg.conversation_id,
            sender_agent="strict_agent",
            recipient_agent=msg.sender_agent,
            performative=A2APerformative.REFUSE,
            payload={"reason": "Cannot prescribe extreme calorie deficit (>1000kcal)"},
            in_reply_to=msg.message_id,
        )

    mediator.register_agent("strict_agent", strict_agent)

    task = A2ATaskRequest(
        task_type="nutrition_cut",
        instructions="cut 1500 kcal daily",
        user_id="user-999",
    )
    res = await mediator.delegate_task("coach_agent", "strict_agent", task)
    assert res.status == "refused"
    assert "extreme calorie deficit" in (res.error_message or "")
