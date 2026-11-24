"""Unit tests for Phase 09 Agent Observation Processing & Replanning."""

from onusfit_ai.features.coach.application.agent.observer import AgentObserver
from onusfit_ai.features.coach.domain.agent import (
    AgentBudgetConfig,
    AgentGoal,
    AgentGoalType,
    PlanStep,
    StepAction,
    StepStatus,
)
from onusfit_ai.shared.contracts.tools import (
    TOOL_GET_NUTRITION_SUMMARY,
    TOOL_GET_RECENT_WORKOUTS,
    TOOL_GET_WEIGHT_TREND,
    TOOL_SEARCH_EXERCISES,
)


def test_process_workouts_observation() -> None:
    observer = AgentObserver()
    raw = {
        "workouts": [
            {"name": "Leg Day", "durationMinutes": 60, "volumeKg": 8000, "caloriesBurned": 400},
            {"name": "Chest Day", "durationMinutes": 45, "volumeKg": 6000, "caloriesBurned": 300},
        ]
    }
    obs = observer.process_tool_result(1, TOOL_GET_RECENT_WORKOUTS, {"days": 7}, raw)
    assert obs.is_empty is False
    assert obs.has_error is False
    assert obs.extracted_entities["workout_count"] == 2
    assert obs.extracted_entities["total_duration_mins"] == 105
    assert obs.extracted_entities["total_volume_kg"] == 14000
    assert "Retrieved 2 workout(s)" in obs.summary


def test_process_empty_workouts_observation() -> None:
    observer = AgentObserver()
    raw = {"workouts": []}
    obs = observer.process_tool_result(1, TOOL_GET_RECENT_WORKOUTS, {"days": 7}, raw)
    assert obs.is_empty is True
    assert "No workout sessions recorded" in obs.summary


def test_process_nutrition_observation() -> None:
    observer = AgentObserver()
    raw = {
        "days": [{"date": "2026-11-20", "calories": 2100}],
        "averageCalories": 2150.0,
        "averageProteinGrams": 142.5,
    }
    obs = observer.process_tool_result(2, TOOL_GET_NUTRITION_SUMMARY, {"days": 7}, raw)
    assert obs.is_empty is False
    assert obs.extracted_entities["average_calories"] == 2150.0
    assert obs.extracted_entities["average_protein_grams"] == 142.5
    assert "2150 kcal/day" in obs.summary


def test_process_weight_trend_observation() -> None:
    observer = AgentObserver()
    raw = {
        "weightLogs": [
            {"date": "2026-10-25", "weightKg": 80.0},
            {"date": "2026-11-24", "weightKg": 78.5},
        ]
    }
    obs = observer.process_tool_result(3, TOOL_GET_WEIGHT_TREND, {"days": 30}, raw)
    assert obs.is_empty is False
    assert obs.extracted_entities["start_weight_kg"] == 80.0
    assert obs.extracted_entities["current_weight_kg"] == 78.5
    assert obs.extracted_entities["net_delta_kg"] == -1.5
    assert "-1.5 kg" in obs.summary


def test_process_exercise_search_observation() -> None:
    observer = AgentObserver()
    raw = {
        "exercises": [
            {"name": "Dumbbell Bench Press", "muscle": "chest"},
            {"name": "Incline Dumbbell Fly", "muscle": "chest"},
        ]
    }
    obs = observer.process_tool_result(4, TOOL_SEARCH_EXERCISES, {"query": "chest"}, raw)
    assert obs.is_empty is False
    assert obs.extracted_entities["matches_count"] == 2
    assert "Dumbbell Bench Press" in obs.extracted_entities["exercise_names"]


def test_process_tool_error_observation() -> None:
    observer = AgentObserver()
    raw = {"error": "Tool 'get_recent_workouts' timed out."}
    obs = observer.process_tool_result(1, TOOL_GET_RECENT_WORKOUTS, {"days": 7}, raw)
    assert obs.has_error is True
    assert obs.is_empty is True
    assert "failed" in obs.summary.lower()


def test_replanning_triggers_on_empty_7day_workouts() -> None:
    observer = AgentObserver()
    goal = AgentGoal(
        goal_type=AgentGoalType.WORKOUT_ANALYSIS,
        target_description="Review workouts",
        language="en",
        requires_agent_execution=True,
        target_domains=["workouts"],
    )
    step1 = PlanStep(
        step_id=1,
        description="Fetch 7-day workouts",
        action=StepAction(
            tool_name=TOOL_GET_RECENT_WORKOUTS, args={"days": 7}, rationale="Check logs"
        ),
        status=StepStatus.COMPLETED,
    )
    obs1 = observer.process_tool_result(1, TOOL_GET_RECENT_WORKOUTS, {"days": 7}, {"workouts": []})
    step1.observation = obs1

    budget = AgentBudgetConfig()
    eval_res = observer.evaluate_observations(
        goal=goal,
        steps=[step1],
        observations=[obs1],
        budget=budget,
        replans_count=0,
    )
    assert eval_res.needs_replanning is True
    assert len(eval_res.new_steps) == 1
    assert eval_res.new_steps[0].action.args == {"days": 14}


def test_replanning_halted_when_max_replans_reached() -> None:
    observer = AgentObserver()
    goal = AgentGoal(
        goal_type=AgentGoalType.WORKOUT_ANALYSIS,
        target_description="Review workouts",
        language="en",
        requires_agent_execution=True,
        target_domains=["workouts"],
    )
    step1 = PlanStep(
        step_id=1,
        description="Fetch 7-day workouts",
        action=StepAction(
            tool_name=TOOL_GET_RECENT_WORKOUTS, args={"days": 7}, rationale="Check logs"
        ),
        status=StepStatus.COMPLETED,
    )
    obs1 = observer.process_tool_result(1, TOOL_GET_RECENT_WORKOUTS, {"days": 7}, {"workouts": []})
    step1.observation = obs1

    budget = AgentBudgetConfig(max_replanning_attempts=1)
    eval_res = observer.evaluate_observations(
        goal=goal,
        steps=[step1],
        observations=[obs1],
        budget=budget,
        replans_count=1,  # Already used 1 replan
    )
    assert eval_res.needs_replanning is False
    assert len(eval_res.new_steps) == 0
