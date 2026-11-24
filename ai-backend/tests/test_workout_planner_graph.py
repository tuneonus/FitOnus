"""Integration tests for the LangGraph Workout Planner workflow."""

import pytest

from onusfit_ai.features.workout_planner.application.graph.builder import (
    build_workout_planner_graph,
)
from onusfit_ai.features.workout_planner.application.graph.executor import (
    WorkoutPlannerGraphExecutor,
)
from onusfit_ai.features.workout_planner.domain.contracts import (
    ExperienceLevel,
    WorkoutEnvironment,
    WorkoutGenerationRequest,
    WorkoutGoal,
)


@pytest.mark.asyncio
async def test_langgraph_workout_planner_execution() -> None:
    executor = WorkoutPlannerGraphExecutor()
    req = WorkoutGenerationRequest(
        user_id="usr_graph_test",
        goal=WorkoutGoal.MUSCLE_BUILDING,
        experience_level=ExperienceLevel.INTERMEDIATE,
        available_equipment=["dumbbells", "bench", "bodyweight"],
        days_per_week=3,
        session_duration_minutes=45,
        environment=WorkoutEnvironment.HOME,
    )

    plan, validation = await executor.execute(req)

    assert plan is not None
    assert validation is not None
    assert validation.is_valid
    assert len(plan.schedule_days) == 3
    assert plan.goal == WorkoutGoal.MUSCLE_BUILDING


@pytest.mark.asyncio
async def test_langgraph_workout_planner_bounded_repair_trigger() -> None:
    executor = WorkoutPlannerGraphExecutor(max_repairs=2)
    req = WorkoutGenerationRequest(
        user_id="usr_repair_test",
        goal=WorkoutGoal.GENERAL_FITNESS,
        experience_level=ExperienceLevel.BEGINNER,
        available_equipment=["bodyweight"],
        days_per_week=2,
        session_duration_minutes=30,
        environment=WorkoutEnvironment.BODYWEIGHT,
    )

    plan, validation = await executor.execute(req)
    assert validation.is_valid
    assert len(plan.schedule_days) == 2


@pytest.mark.asyncio
async def test_langgraph_builder_structure() -> None:
    graph = build_workout_planner_graph()
    assert graph is not None
    # Compiled StateGraph has invoke or astream
    assert hasattr(graph, "ainvoke")
