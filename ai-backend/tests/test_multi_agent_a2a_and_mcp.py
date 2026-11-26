"""Tests for Phase 13 Stage 04 A2AMediator & Stage 07 MultiAgentMcpGateway."""

import asyncio
import uuid

import pytest

from onusfit_ai.features.coach.application.multi_agent.budgets import (
    CumulativeBudgetTracker,
)
from onusfit_ai.features.coach.application.multi_agent.mcp_gateway import (
    MultiAgentMcpGateway,
)
from onusfit_ai.features.coach.domain.multi_agent import (
    AgentCapability,
    AgentRole,
    MultiAgentExecutionBudget,
)
from onusfit_ai.features.mcp.application.a2a import (
    A2ADagTaskSpec,
    A2AMediator,
    A2AMessage,
    A2APerformative,
    A2ATaskRequest,
)


@pytest.mark.asyncio
async def test_a2a_capability_discovery_dependency_dag_and_failure_propagation() -> None:
    mediator = A2AMediator()

    async def recovery_handler(msg: A2AMessage) -> A2AMessage:
        return A2AMessage(
            conversation_id=msg.conversation_id,
            sender_agent="recovery",
            recipient_agent=msg.sender_agent,
            performative=A2APerformative.INFORM,
            payload={"result": {"recommend_deload": True}},
            in_reply_to=msg.message_id,
            correlation_id=msg.correlation_id,
            task_id=msg.task_id,
        )

    async def workout_handler(msg: A2AMessage) -> A2AMessage:
        upstream = msg.payload["input_data"].get("upstream_results", {})
        deload = upstream.get("t_rec", {}).get("recommend_deload", False)
        return A2AMessage(
            conversation_id=msg.conversation_id,
            sender_agent="workout",
            recipient_agent=msg.sender_agent,
            performative=A2APerformative.INFORM,
            payload={"result": {"adapted": True, "deload": deload}},
            in_reply_to=msg.message_id,
            correlation_id=msg.correlation_id,
            task_id=msg.task_id,
        )

    mediator.register_agent("recovery", recovery_handler, capabilities=["recovery_guidance"])
    mediator.register_agent("workout", workout_handler, capabilities=["workout_adaptation"])

    discovered = mediator.discover_agents("recovery_guidance")
    assert [c.agent_id for c in discovered] == ["recovery"]

    specs = [
        A2ADagTaskSpec(
            task_id="t_rec",
            sender="supervisor",
            recipient="recovery",
            task=A2ATaskRequest(
                task_id="t_rec",
                task_type="eval_recovery",
                instructions="check",
                user_id="user-1",
                required_capabilities=["recovery_guidance"],
            ),
        ),
        A2ADagTaskSpec(
            task_id="t_work",
            sender="supervisor",
            recipient="workout",
            task=A2ATaskRequest(
                task_id="t_work",
                task_type="adapt_plan",
                instructions="adapt",
                user_id="user-1",
                required_capabilities=["workout_adaptation"],
            ),
            depends_on=["t_rec"],
            dependency_type="required",
        ),
    ]
    res = await mediator.execute_task_dag(specs, conversation_id="conv-1")
    assert len(res) == 2
    assert res[0].status == "completed"
    assert res[1].status == "completed"
    assert res[1].output_data["deload"] is True

    agg = mediator.aggregate_results(res)
    assert agg["completed"] == ["t_rec", "t_work"]


@pytest.mark.asyncio
async def test_a2a_circular_delegation_depth_limit_dedup_and_cancellation() -> None:
    mediator = A2AMediator()
    calls = 0

    async def worker(msg: A2AMessage) -> A2AMessage:
        nonlocal calls
        calls += 1
        return A2AMessage(
            message_id=str(uuid.uuid4()),
            conversation_id=msg.conversation_id,
            sender_agent="nutrition",
            recipient_agent=msg.sender_agent,
            performative=A2APerformative.INFORM,
            payload={"result": {"ok": True}},
            in_reply_to=msg.message_id,
            correlation_id=msg.correlation_id,
            task_id=msg.task_id,
        )

    mediator.register_agent("nutrition", worker, capabilities=["nutrition_analysis"])

    # Circular delegation blocked
    circ = await mediator.delegate_task(
        "supervisor",
        "nutrition",
        A2ATaskRequest(
            task_id="t_circ",
            task_type="analyze",
            instructions="check",
            user_id="user-1",
            delegation_chain=["supervisor", "nutrition"],
        ),
        conversation_id="conv-sec",
    )
    assert circ.status == "refused"
    assert "Circular delegation" in (circ.error_message or "")

    # Depth > max_depth blocked
    deep = await mediator.delegate_task(
        "supervisor",
        "nutrition",
        A2ATaskRequest(
            task_id="t_deep",
            task_type="analyze",
            instructions="check",
            user_id="user-1",
            depth=2,
        ),
        conversation_id="conv-sec",
        max_depth=1,
    )
    assert deep.status == "refused"

    # Duplicate prevention within same conversation
    t1 = A2ATaskRequest(
        task_id="t_1", task_type="analyze", instructions="check macros", user_id="user-1"
    )
    t2 = A2ATaskRequest(
        task_id="t_2", task_type="analyze", instructions="check macros", user_id="user-1"
    )
    r1 = await mediator.delegate_task("supervisor", "nutrition", t1, conversation_id="conv-dedup")
    r2 = await mediator.delegate_task("supervisor", "nutrition", t2, conversation_id="conv-dedup")
    assert r1.deduplicated is False
    assert r2.deduplicated is True
    assert calls == 1

    # Cancellation
    mediator.cancel_conversation("conv-cancel", "user_aborted")
    rc = await mediator.delegate_task("supervisor", "nutrition", t1, conversation_id="conv-cancel")
    assert rc.cancelled is True and rc.status == "cancelled"


@pytest.mark.asyncio
async def test_mcp_gateway_enforces_allowlist_mutations_cache_isolation_and_fallback() -> None:
    tracker = CumulativeBudgetTracker(MultiAgentExecutionBudget(max_tool_calls=5))
    mcp_calls: list[tuple[str, str]] = []
    native_calls: list[str] = []

    async def fake_mcp(name: str, args: dict[str, object]) -> dict[str, object]:
        mcp_calls.append((name, str(args)))
        if name == "get_weight_trend":
            return {"error": "Tool 'get_weight_trend' temporary failure"}
        return {"source": "mcp", "tool": name, "count": 4}

    async def fake_native(name: str, _args: dict[str, object]) -> dict[str, object]:
        native_calls.append(name)
        return {"source": "native", "tool": name}

    gateway = MultiAgentMcpGateway(
        budget_tracker=tracker,
        mcp_handler=fake_mcp,
        native_handler=fake_native,
        discovered_tools=[
            "get_recent_workouts",
            "get_nutrition_summary",
            "get_weight_trend",
            "persist_workout_plan",
        ],
        allow_mutations=True,
        durable_node_approval_verified=False,  # Missing durable Node approval!
    )

    # Trusted discovery excludes persist_workout_plan
    assert "persist_workout_plan" not in gateway.discover_allowed_tools(AgentRole.WORKOUT)

    # Nutrition agent blocked from workout tool
    denied = await gateway.execute_for_agent(
        agent_role=AgentRole.NUTRITION,
        agent_capabilities=[AgentCapability.NUTRITION_ANALYSIS],
        tool_name="get_recent_workouts",
        arguments={"days": 7},
        user_id="user-A",
        request_id="req-1",
    )
    assert "Authorization denied" in denied["error"]

    # Mutation tool blocked without durable Node approval
    mut_blocked = await gateway.execute_for_agent(
        agent_role=AgentRole.WORKOUT,
        agent_capabilities=[AgentCapability.WORKOUT_PLANNING],
        tool_name="persist_workout_plan",
        arguments={},
        user_id="user-A",
        request_id="req-1",
    )
    assert "disabled" in mut_blocked["error"]

    # Confused deputy userId arg rejected
    bad_arg = await gateway.execute_for_agent(
        agent_role=AgentRole.WORKOUT,
        agent_capabilities=[AgentCapability.WORKOUT_HISTORY],
        tool_name="get_recent_workouts",
        arguments={"days": 7, "userId": "victim"},
        user_id="user-A",
        request_id="req-1",
    )
    assert "Forbidden identity" in bad_arg["error"]

    # Shared cache: Workout + Progress for SAME user share 1 call; different user stays isolated!
    await asyncio.gather(
        gateway.execute_for_agent(
            agent_role=AgentRole.WORKOUT,
            agent_capabilities=[AgentCapability.WORKOUT_HISTORY],
            tool_name="get_recent_workouts",
            arguments={"days": 14},
            user_id="user-A",
            request_id="req-1",
        ),
        gateway.execute_for_agent(
            agent_role=AgentRole.PROGRESS,
            agent_capabilities=[AgentCapability.PROGRESS_TRACKING],
            tool_name="get_recent_workouts",
            arguments={"days": 14},
            user_id="user-A",
            request_id="req-1",
        ),
    )
    assert len(mcp_calls) == 1
    assert gateway.cache_hits == 1

    # Cross-user call must NOT reuse User-A's cache!
    await gateway.execute_for_agent(
        agent_role=AgentRole.WORKOUT,
        agent_capabilities=[AgentCapability.WORKOUT_HISTORY],
        tool_name="get_recent_workouts",
        arguments={"days": 14},
        user_id="user-B",
        request_id="req-2",
    )
    assert len(mcp_calls) == 2

    # Native fallback on transient MCP error
    fb_res = await gateway.execute_for_agent(
        agent_role=AgentRole.PROGRESS,
        agent_capabilities=[AgentCapability.WEIGHT_ANALYSIS],
        tool_name="get_weight_trend",
        arguments={"days": 30},
        user_id="user-A",
        request_id="req-1",
    )
    assert fb_res["source"] == "native"
    assert gateway.fallbacks_triggered == 1
