"""Unit tests for Phase 09 AI Agent Planner & Goal Interpretation."""

import pytest

from onusfit_ai.features.coach.application.agent.planner import (
    AgentPlanner,
    detect_language,
)
from onusfit_ai.features.coach.domain.agent import (
    AgentBudgetConfig,
    AgentGoalType,
)
from onusfit_ai.features.coach.domain.chat import (
    TodayNutritionContext,
    UserFitnessContext,
    UserFitnessProfile,
)
from onusfit_ai.shared.contracts.tools import (
    TOOL_GET_NUTRITION_SUMMARY,
    TOOL_GET_RECENT_WORKOUTS,
    TOOL_GET_WEIGHT_TREND,
    TOOL_SEARCH_EXERCISES,
)


@pytest.fixture
def mock_context() -> UserFitnessContext:
    return UserFitnessContext(
        profile=UserFitnessProfile(
            display_name="Karthik",
            current_weight_kg=78.5,
            target_weight_kg=72.0,
            primary_goal="Fat Loss & Muscle Retention",
        ),
        today_nutrition=TodayNutritionContext(
            calories_consumed=1800,
            protein_grams=120,
            carbs_grams=160,
            fat_grams=60,
            water_intake_ml=2500,
            calorie_target=2200,
            protein_target=140,
        ),
        recent_workouts=[],
        active_goals=[],
    )


def test_detect_language() -> None:
    assert detect_language("How are my workouts?") == "en"
    assert detect_language("வணக்கம் கோச், என் முன்னேற்றம் எப்படி") == "ta"
    assert (
        detect_language("En fitness progress check panni, indha week enna improve pannanum sollu")
        == "tanglish"
    )
    assert detect_language("vanakkam coach") == "tanglish"
    assert detect_language("innaiku workout enna") == "tanglish"


def test_greetings_bypass_planning(mock_context: UserFitnessContext) -> None:
    planner = AgentPlanner()

    for msg in ["Hello coach!", "Good morning", "வணக்கம்", "vanakkam coach", "thanks coach"]:
        goal = planner.interpret_goal(msg, mock_context)
        assert goal.requires_agent_execution is False
        assert goal.goal_type == AgentGoalType.GREETING
        plan = planner.create_plan(goal, msg, mock_context)
        assert len(plan.steps) == 0


def test_simple_metric_lookups_bypass_planning(mock_context: UserFitnessContext) -> None:
    planner = AgentPlanner()

    for msg in [
        "What is my current weight?",
        "how much water today",
        "இன்றைய தண்ணீர் அளவு என்ன",
        "innaiku calorie evlo",
    ]:
        goal = planner.interpret_goal(msg, mock_context)
        assert goal.requires_agent_execution is False
        assert goal.goal_type == AgentGoalType.SIMPLE_QA
        plan = planner.create_plan(goal, msg, mock_context)
        assert len(plan.steps) == 0


def test_fitness_progress_interpretation_and_planning(mock_context: UserFitnessContext) -> None:
    planner = AgentPlanner()
    msg = "En fitness progress check panni, indha week enna improve pannanum sollu"
    goal = planner.interpret_goal(msg, mock_context)

    assert goal.requires_agent_execution is True
    assert goal.goal_type == AgentGoalType.FITNESS_PROGRESS
    assert goal.language == "tanglish"
    assert "workouts" in goal.target_domains
    assert "nutrition" in goal.target_domains
    assert "weight" in goal.target_domains

    plan = planner.create_plan(goal, msg, mock_context)
    assert len(plan.steps) == 3
    tool_names = [s.action.tool_name for s in plan.steps]
    assert tool_names == [
        TOOL_GET_RECENT_WORKOUTS,
        TOOL_GET_NUTRITION_SUMMARY,
        TOOL_GET_WEIGHT_TREND,
    ]


def test_workout_history_planning_and_day_extraction(mock_context: UserFitnessContext) -> None:
    planner = AgentPlanner()
    msg = "Show my workout logs from the past 14 days"
    goal = planner.interpret_goal(msg, mock_context)

    assert goal.requires_agent_execution is True
    assert goal.goal_type == AgentGoalType.WORKOUT_ANALYSIS

    plan = planner.create_plan(goal, msg, mock_context)
    assert len(plan.steps) == 1
    assert plan.steps[0].action.tool_name == TOOL_GET_RECENT_WORKOUTS
    assert plan.steps[0].action.args == {"days": 14}


def test_nutrition_analysis_planning(mock_context: UserFitnessContext) -> None:
    planner = AgentPlanner()
    msg = "Review my diet and protein intake over the past 2 weeks"
    goal = planner.interpret_goal(msg, mock_context)

    assert goal.requires_agent_execution is True
    assert goal.goal_type == AgentGoalType.NUTRITION_ANALYSIS

    plan = planner.create_plan(goal, msg, mock_context)
    assert len(plan.steps) == 1
    assert plan.steps[0].action.tool_name == TOOL_GET_NUTRITION_SUMMARY
    assert plan.steps[0].action.args == {"days": 14}


def test_weight_trend_planning(mock_context: UserFitnessContext) -> None:
    planner = AgentPlanner()
    msg = "How has my weight trended over the past month?"
    goal = planner.interpret_goal(msg, mock_context)

    assert goal.requires_agent_execution is True
    assert goal.goal_type == AgentGoalType.WEIGHT_TREND

    plan = planner.create_plan(goal, msg, mock_context)
    assert len(plan.steps) == 1
    assert plan.steps[0].action.tool_name == TOOL_GET_WEIGHT_TREND
    assert plan.steps[0].action.args == {"days": 30}


def test_exercise_search_planning(mock_context: UserFitnessContext) -> None:
    planner = AgentPlanner()
    msg = "Suggest chest exercises with dumbbells"
    goal = planner.interpret_goal(msg, mock_context)

    assert goal.requires_agent_execution is True
    assert goal.goal_type == AgentGoalType.EXERCISE_SEARCH

    plan = planner.create_plan(goal, msg, mock_context)
    assert len(plan.steps) == 1
    assert plan.steps[0].action.tool_name == TOOL_SEARCH_EXERCISES
    args = plan.steps[0].action.args
    assert args["query"] == "chest"
    assert args["muscle"] == "chest"
    assert args["equipment"] == "dumbbell"


def test_plan_steps_respect_budget_cap(mock_context: UserFitnessContext) -> None:
    budget = AgentBudgetConfig(max_planning_steps=2)
    planner = AgentPlanner(budget)
    msg = "Comprehensive progress review across all metrics"
    goal = planner.interpret_goal(msg, mock_context)

    plan = planner.create_plan(goal, msg, mock_context)
    assert len(plan.steps) <= 2
