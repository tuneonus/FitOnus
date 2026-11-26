"""Unit tests for LangGraph nodes and conditional edge routing.

FitOnus Phase 10: LangGraph Agent Workflows — Stage 03 & 04.
Tests:
- Goal interpretation node & language detection.
- Simple-query bypass routing.
- Task planning node generation.
- Tool execution node with validation and caching.
- Observation processing node and replanning routing.
"""

import pytest
from langchain_core.runnables import RunnableConfig

from onusfit_ai.features.coach.application.agent.graph.nodes import (
    GraphRuntimeContext,
    interpret_goal_node,
    observation_processing_node,
    replanning_node,
    task_planning_node,
    tool_execution_node,
)
from onusfit_ai.features.coach.application.agent.graph.routing import (
    NODE_FINAL_SYNTHESIS,
    NODE_REPLANNING,
    NODE_TASK_PLANNING,
    route_after_observation,
    should_bypass,
)
from onusfit_ai.features.coach.application.agent.graph.state import (
    create_initial_graph_state,
)
from onusfit_ai.features.coach.application.agent.observer import AgentObserver
from onusfit_ai.features.coach.application.agent.planner import AgentPlanner
from onusfit_ai.features.coach.domain.agent import (
    AgentBudgetConfig,
    AgentExecutionStatus,
    AgentGoal,
    AgentGoalType,
    AgentTerminationReason,
    PlanStep,
    StepAction,
    StepStatus,
    ToolObservation,
)
from onusfit_ai.features.coach.domain.chat import (
    CoachChatRequest,
    TodayNutritionContext,
    UserFitnessContext,
    UserFitnessProfile,
)
from onusfit_ai.shared.contracts.common import ModelSelection
from onusfit_ai.shared.llm.ports import LlmResult, LlmUsage, TextGenerator


class DummyLlm(TextGenerator):
    async def generate_text(self, *args, **kwargs) -> LlmResult:
        return LlmResult(
            text="Dummy reply",
            usage=LlmUsage(
                model="test",
                is_fallback=False,
                input_tokens=10,
                output_tokens=10,
                total_tokens=20,
            ),
        )


def _mock_request(message: str) -> CoachChatRequest:
    return CoachChatRequest(
        message=message,
        context=UserFitnessContext(
            profile=UserFitnessProfile(
                display_name="Dev Shan",
                current_weight_kg=75.0,
                target_weight_kg=70.0,
            ),
            today_nutrition=TodayNutritionContext(
                calories_consumed=2000,
                protein_grams=140,
                carbs_grams=200,
                fat_grams=60,
                water_intake_ml=2500,
            ),
            recent_workouts=[],
            active_goals=[],
        ),
        model=ModelSelection(primary="gemini-2.5-flash", fallback="gemini-2.5-flash-lite"),
        deadline_ms=10000,
    )


def _build_config(
    request: CoachChatRequest,
    tool_handler=None,
    budget=None,
    clock=None,
) -> RunnableConfig:
    b = budget or AgentBudgetConfig()
    ctx = GraphRuntimeContext(
        planner=AgentPlanner(b),
        observer=AgentObserver(),
        budget=b,
        llm=DummyLlm(),
        request=request,
        tool_handler=tool_handler,
        clock=clock or (lambda: 100.0),
        tool_cache={},
    )
    return RunnableConfig(configurable={"graph_context": ctx, "thread_id": "t1"})


@pytest.mark.asyncio
async def test_interpret_goal_node_english_and_tamil() -> None:
    req_en = _mock_request("Check my fitness progress over the past 2 weeks")
    config_en = _build_config(req_en)
    state_en = create_initial_graph_state(
        req_en, trace_id="t1", user_id="u1", start_time=100.0, deadline=110.0
    )

    res_en = await interpret_goal_node(state_en, config_en)
    assert res_en["status"] == AgentExecutionStatus.PLANNING
    assert res_en["goal"].language == "en"
    assert res_en["goal"].requires_agent_execution is True

    req_ta = _mock_request("வணக்கம் கோச்")
    config_ta = _build_config(req_ta)
    state_ta = create_initial_graph_state(
        req_ta, trace_id="t2", user_id="u2", start_time=100.0, deadline=110.0
    )

    res_ta = await interpret_goal_node(state_ta, config_ta)
    assert res_ta["goal"].language == "ta"
    assert res_ta["goal"].requires_agent_execution is False


def test_should_bypass_routing() -> None:
    # Greeting / simple query -> bypass
    goal_greeting = AgentGoal(
        goal_type=AgentGoalType.GREETING,
        target_description="Greeting",
        language="en",
        requires_agent_execution=False,
    )
    s_bypass = {"goal": goal_greeting, "status": AgentExecutionStatus.PLANNING}
    assert should_bypass(s_bypass) == NODE_FINAL_SYNTHESIS  # type: ignore[arg-type]

    # Progress analysis -> task planning
    goal_progress = AgentGoal(
        goal_type=AgentGoalType.FITNESS_PROGRESS,
        target_description="Progress",
        language="en",
        requires_agent_execution=True,
    )
    s_plan = {"goal": goal_progress, "status": AgentExecutionStatus.PLANNING}
    assert should_bypass(s_plan) == NODE_TASK_PLANNING  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_task_planning_node() -> None:
    req = _mock_request("Review my workouts and diet")
    config = _build_config(req)
    goal = AgentGoal(
        goal_type=AgentGoalType.FITNESS_PROGRESS,
        target_description="Review progress",
        language="en",
        requires_agent_execution=True,
        target_domains=["workouts", "nutrition"],
    )
    state = create_initial_graph_state(
        req, trace_id="t1", user_id="u1", start_time=100.0, deadline=110.0, initial_goal=goal
    )

    res = await task_planning_node(state, config)
    assert res["status"] == AgentExecutionStatus.EXECUTING
    assert len(res["steps"]) >= 2
    assert res["steps"][0].status == StepStatus.PENDING


@pytest.mark.asyncio
async def test_tool_execution_node_argument_validation() -> None:
    req = _mock_request("Check workouts")

    async def mock_handler(name, args):
        return {"workouts": []}

    config = _build_config(req, tool_handler=mock_handler)
    step_invalid = PlanStep(
        step_id=1,
        description="Get workouts",
        action=StepAction(tool_name="get_recent_workouts", args={"days": -10}, rationale="Check"),
        status=StepStatus.PENDING,
    )
    state = create_initial_graph_state(
        req, trace_id="t1", user_id="u1", start_time=100.0, deadline=110.0
    )
    state["steps"] = [step_invalid]

    res = await tool_execution_node(state, config)
    assert len(res["steps"]) == 1
    assert res["steps"][0].status == StepStatus.FAILED
    assert res["observations"][0].has_error is True


@pytest.mark.asyncio
async def test_tool_execution_node_duplicate_caching() -> None:
    req = _mock_request("Check workouts")
    call_count = 0

    async def mock_handler(name, args):
        nonlocal call_count
        call_count += 1
        return {"workouts": [{"name": "Chest Day"}]}

    config = _build_config(req, tool_handler=mock_handler)
    step1 = PlanStep(
        step_id=1,
        description="Step 1",
        action=StepAction(tool_name="get_recent_workouts", args={"days": 7}, rationale="r1"),
        status=StepStatus.PENDING,
    )
    state1 = create_initial_graph_state(
        req, trace_id="t1", user_id="u1", start_time=100.0, deadline=110.0
    )
    state1["steps"] = [step1]

    # First execution
    res1 = await tool_execution_node(state1, config)
    assert call_count == 1
    assert res1["steps"][0].status == StepStatus.COMPLETED

    # Second execution with identical tool action
    step2 = PlanStep(
        step_id=2,
        description="Step 2",
        action=StepAction(tool_name="get_recent_workouts", args={"days": 7}, rationale="r2"),
        status=StepStatus.PENDING,
    )
    state2 = create_initial_graph_state(
        req, trace_id="t1", user_id="u1", start_time=100.0, deadline=110.0
    )
    state2["steps"] = [step2]

    res2 = await tool_execution_node(state2, config)
    # Tool handler should not be called again
    assert call_count == 1
    assert res2["steps"][0].status == StepStatus.COMPLETED


@pytest.mark.asyncio
async def test_observation_processing_deadline_exhaustion() -> None:
    req = _mock_request("Check progress")
    # Clock returns 109.0 while deadline is 110.0 (less than deadline_margin_s + 1.5)
    config = _build_config(req, clock=lambda: 109.0)
    goal = AgentGoal(
        goal_type=AgentGoalType.FITNESS_PROGRESS,
        target_description="Progress",
        language="en",
        requires_agent_execution=True,
    )
    state = create_initial_graph_state(
        req, trace_id="t1", user_id="u1", start_time=100.0, deadline=110.0, initial_goal=goal
    )

    res = await observation_processing_node(state, config)
    assert res["status"] == AgentExecutionStatus.DEADLINE_EXCEEDED
    assert res["termination_reason"] == AgentTerminationReason.DEADLINE_APPROACHING
    assert res["needs_replanning"] is False


@pytest.mark.asyncio
async def test_observation_processing_and_replanning_loop() -> None:
    req = _mock_request("Check workouts")
    config = _build_config(req, clock=lambda: 101.0)
    goal = AgentGoal(
        goal_type=AgentGoalType.WORKOUT_ANALYSIS,
        target_description="Workout history",
        language="en",
        requires_agent_execution=True,
    )
    empty_obs = ToolObservation(
        step_id=1,
        tool_name="get_recent_workouts",
        args={"days": 7},
        raw_result={"workouts": []},
        summary="No workouts found in 7 days",
        is_empty=True,
    )
    step1 = PlanStep(
        step_id=1,
        description="Step 1",
        action=StepAction(tool_name="get_recent_workouts", args={"days": 7}, rationale="r"),
        status=StepStatus.COMPLETED,
        observation=empty_obs,
    )
    state = create_initial_graph_state(
        req, trace_id="t1", user_id="u1", start_time=100.0, deadline=120.0, initial_goal=goal
    )
    state["steps"] = [step1]
    state["observations"] = [empty_obs]

    obs_res = await observation_processing_node(state, config)
    assert obs_res["status"] == AgentExecutionStatus.REPLANNING
    assert obs_res["needs_replanning"] is True
    assert len(obs_res["new_steps"]) == 1
    assert obs_res["new_steps"][0].action.args.get("days") == 14

    # Routing check
    state_for_routing = dict(state)
    state_for_routing.update(obs_res)
    assert route_after_observation(state_for_routing) == NODE_REPLANNING  # type: ignore[arg-type]

    # Replanning node adds new step
    replan_res = await replanning_node(state_for_routing, config)  # type: ignore[arg-type]
    assert replan_res["status"] == AgentExecutionStatus.EXECUTING
    assert replan_res["replans_count"] == 1
    assert len(replan_res["steps"]) == 1
