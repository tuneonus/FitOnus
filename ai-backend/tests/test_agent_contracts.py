"""Unit tests for Phase 09 AI Agent domain contracts."""

import pytest
from pydantic import ValidationError

from onusfit_ai.features.coach.domain.agent import (
    AgentBudgetConfig,
    AgentExecutionResult,
    AgentExecutionStatus,
    AgentGoal,
    AgentGoalType,
    AgentState,
    AgentTerminationReason,
    PlanStep,
    StepAction,
    StepStatus,
    ToolObservation,
)
from onusfit_ai.features.coach.domain.chat import CoachChatResult


def test_agent_goal_creation_and_bounds() -> None:
    goal = AgentGoal(
        goal_type=AgentGoalType.FITNESS_PROGRESS,
        target_description="Review progress",
        language="en",
        requires_agent_execution=True,
        confidence=0.95,
        target_domains=["workouts", "nutrition"],
    )
    assert goal.goal_type == AgentGoalType.FITNESS_PROGRESS
    assert goal.confidence == 0.95
    assert goal.requires_agent_execution is True

    # Unknown fields rejected (extra='forbid')
    with pytest.raises(ValidationError):
        AgentGoal(
            goal_type=AgentGoalType.FITNESS_PROGRESS,
            target_description="Review progress",
            language="en",
            requires_agent_execution=True,
            unexpected_field="hack",
        )


def test_step_action_and_plan_step() -> None:
    action = StepAction(
        tool_name="get_recent_workouts",
        args={"days": 7},
        rationale="Check training volume",
    )
    step = PlanStep(
        step_id=1,
        description="Fetch 7 days of workouts",
        action=action,
        status=StepStatus.PENDING,
    )
    assert step.step_id == 1
    assert step.status == StepStatus.PENDING
    assert step.observation is None


def test_tool_observation_structure() -> None:
    obs = ToolObservation(
        step_id=1,
        tool_name="get_recent_workouts",
        args={"days": 7},
        raw_result={"workouts": [{"name": "Push Day"}]},
        summary="Retrieved 1 workout",
        is_empty=False,
        has_error=False,
        extracted_entities={"workout_count": 1},
    )
    assert obs.is_empty is False
    assert obs.has_error is False
    assert obs.extracted_entities["workout_count"] == 1


def test_agent_budget_config_defaults_and_validation() -> None:
    budget = AgentBudgetConfig()
    assert budget.max_planning_steps == 4
    assert budget.max_iterations == 3
    assert budget.max_replanning_attempts == 1
    assert budget.max_tool_calls == 5
    assert budget.max_total_tokens == 4000
    assert budget.deadline_margin_s == 2.0

    # Test boundary clamping
    with pytest.raises(ValidationError):
        AgentBudgetConfig(max_planning_steps=0)
    with pytest.raises(ValidationError):
        AgentBudgetConfig(max_iterations=11)


def test_agent_state_and_result_envelope() -> None:
    goal = AgentGoal(
        goal_type=AgentGoalType.GREETING,
        target_description="Greeting",
        language="en",
        requires_agent_execution=False,
    )
    state = AgentState(
        trace_id="test-trace-1",
        user_id="user-123",
        goal=goal,
        status=AgentExecutionStatus.COMPLETED,
        termination_reason=AgentTerminationReason.SIMPLE_QUERY_BYPASS,
    )
    assert state.trace_id == "test-trace-1"
    assert state.user_id == "user-123"
    assert state.status == AgentExecutionStatus.COMPLETED

    res = AgentExecutionResult(
        response=CoachChatResult(text="Hello athlete!", follow_ups=[], sources=["Profile"]),
        status=AgentExecutionStatus.COMPLETED,
        termination_reason=AgentTerminationReason.SIMPLE_QUERY_BYPASS,
        goal=goal,
        executed_steps=[],
        observations=[],
        tool_calls=[],
        iterations=0,
        replans=0,
    )
    assert res.response.text == "Hello athlete!"
    assert res.iterations == 0
