"""Unit tests for LangGraph state definitions, reducers, and domain mapping.

FitOnus Phase 10: LangGraph Agent Workflows — Stage 02.
Tests:
- Reducer semantics: deduplication, ordering, and aggregation.
- Request-scoped state creation with zero leakage.
- Conversion between GraphAgentState and domain AgentState.
"""

import time

from onusfit_ai.features.coach.application.agent.graph.state import (
    create_initial_graph_state,
    graph_state_to_domain_state,
    reduce_executed_tools,
    reduce_int_sum,
    reduce_observations,
    reduce_steps,
    reduce_tool_results,
)
from onusfit_ai.features.coach.domain.agent import (
    AgentExecutionStatus,
    AgentGoal,
    AgentGoalType,
    AgentTerminationReason,
    PlanStep,
    StepAction,
    StepStatus,
    ToolObservation,
)
from onusfit_ai.features.coach.domain.agent import (
    ToolExecutionResult as DomainToolResult,
)
from onusfit_ai.features.coach.domain.chat import (
    CoachChatRequest,
    TodayNutritionContext,
    UserFitnessContext,
    UserFitnessProfile,
)
from onusfit_ai.shared.contracts.common import ModelSelection


def _mock_request(message: str = "Check my progress") -> CoachChatRequest:
    return CoachChatRequest(
        message=message,
        context=UserFitnessContext(
            profile=UserFitnessProfile(display_name="Test User"),
            today_nutrition=TodayNutritionContext(
                calories_consumed=1800,
                protein_grams=120,
                carbs_grams=180,
                fat_grams=50,
                water_intake_ml=2000,
            ),
            recent_workouts=[],
            active_goals=[],
        ),
        model=ModelSelection(primary="gemini-2.5-flash", fallback="gemini-2.5-flash-lite"),
        deadline_ms=10000,
    )


def test_reduce_observations_deduplication_and_order() -> None:
    obs1 = ToolObservation(
        step_id=1,
        tool_name="get_recent_workouts",
        args={"days": 7},
        raw_result={"workouts": []},
        summary="No workouts found",
        is_empty=True,
    )
    obs2 = ToolObservation(
        step_id=2,
        tool_name="get_nutrition_summary",
        args={"days": 7},
        raw_result={"avgCalories": 2000},
        summary="Avg 2000 kcal",
    )
    # Duplicate of obs1 (same step_id and tool_name)
    obs1_dup = ToolObservation(
        step_id=1,
        tool_name="get_recent_workouts",
        args={"days": 7},
        raw_result={"workouts": []},
        summary="Duplicate summary",
        is_empty=True,
    )

    merged = reduce_observations([obs1], [obs2, obs1_dup])
    assert len(merged) == 2
    assert merged[0].step_id == 1
    assert merged[1].step_id == 2
    assert merged[0].summary == "No workouts found"


def test_reduce_steps_merges_and_updates_by_step_id() -> None:
    step1 = PlanStep(
        step_id=1,
        description="Step 1",
        action=StepAction(tool_name="tool_a", rationale="r1"),
        status=StepStatus.PENDING,
    )
    step2 = PlanStep(
        step_id=2,
        description="Step 2",
        action=StepAction(tool_name="tool_b", rationale="r2"),
        status=StepStatus.PENDING,
    )
    step1_completed = PlanStep(
        step_id=1,
        description="Step 1",
        action=StepAction(tool_name="tool_a", rationale="r1"),
        status=StepStatus.COMPLETED,
    )

    merged = reduce_steps([step1, step2], [step1_completed])
    assert len(merged) == 2
    assert merged[0].step_id == 1
    assert merged[0].status == StepStatus.COMPLETED
    assert merged[1].step_id == 2
    assert merged[1].status == StepStatus.PENDING


def test_reduce_executed_tools_accumulates_unique_signatures() -> None:
    existing = ["tool_a:{}", 'tool_b:{"days": 7}']
    incoming = ['tool_b:{"days": 7}', "tool_c:{}"]

    merged = reduce_executed_tools(existing, incoming)
    assert len(merged) == 3
    assert merged == ["tool_a:{}", 'tool_b:{"days": 7}', "tool_c:{}"]


def test_reduce_tool_results_appends_results() -> None:
    res1 = DomainToolResult(tool_name="tool_a", args={}, result={"status": "ok"})
    res2 = DomainToolResult(tool_name="tool_b", args={"days": 7}, result={"data": 123})

    merged = reduce_tool_results([res1], [res2])
    assert len(merged) == 2
    assert merged[0].tool_name == "tool_a"
    assert merged[1].tool_name == "tool_b"


def test_reduce_int_sum() -> None:
    assert reduce_int_sum(3, 4) == 7
    assert reduce_int_sum(0, 5) == 5


def test_create_initial_graph_state_isolation() -> None:
    req1 = _mock_request("Goal 1")
    req2 = _mock_request("Goal 2")

    s1 = create_initial_graph_state(
        req1,
        trace_id="trace_1",
        user_id="user_1",
        start_time=100.0,
        deadline=110.0,
    )
    s2 = create_initial_graph_state(
        req2,
        trace_id="trace_2",
        user_id="user_2",
        start_time=200.0,
        deadline=210.0,
    )

    assert s1["trace_id"] == "trace_1"
    assert s2["trace_id"] == "trace_2"
    assert s1["user_id"] == "user_1"
    assert s2["user_id"] == "user_2"
    assert s1["steps"] == []
    assert s2["steps"] == []

    # Modify s1 collections, ensure s2 is untouched
    s1["steps"].append(
        PlanStep(
            step_id=1,
            description="d",
            action=StepAction(tool_name="t", rationale="r"),
        )
    )
    assert len(s1["steps"]) == 1
    assert len(s2["steps"]) == 0


def test_graph_state_to_domain_state_roundtrip() -> None:
    goal = AgentGoal(
        goal_type=AgentGoalType.FITNESS_PROGRESS,
        target_description="Check progress",
        language="en",
        requires_agent_execution=True,
        confidence=1.0,
        target_domains=["workouts", "nutrition"],
    )
    req = _mock_request()
    gstate = create_initial_graph_state(
        req,
        trace_id="trace_rt",
        user_id="user_rt",
        start_time=time.monotonic(),
        deadline=time.monotonic() + 10.0,
        initial_goal=goal,
    )
    gstate["status"] = AgentExecutionStatus.COMPLETED
    gstate["termination_reason"] = AgentTerminationReason.GOAL_SATISFIED
    gstate["total_tool_calls"] = 2
    gstate["accumulated_tokens"] = 850

    dstate = graph_state_to_domain_state(gstate)

    assert dstate.trace_id == "trace_rt"
    assert dstate.user_id == "user_rt"
    assert dstate.goal.goal_type == AgentGoalType.FITNESS_PROGRESS
    assert dstate.status == AgentExecutionStatus.COMPLETED
    assert dstate.termination_reason == AgentTerminationReason.GOAL_SATISFIED
    assert dstate.total_tool_calls == 2
    assert dstate.accumulated_tokens == 850
