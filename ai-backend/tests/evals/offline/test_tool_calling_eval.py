"""Offline evaluation tests for Gemini Function Calling contracts and isolation."""

import pytest
from pydantic import ValidationError

from onusfit_ai.features.coach.application.tools import (
    TOOL_GET_NUTRITION_SUMMARY,
    TOOL_GET_RECENT_WORKOUTS,
    TOOL_GET_WEIGHT_TREND,
    TOOL_SEARCH_EXERCISES,
    GetNutritionSummaryArgs,
    GetRecentWorkoutsArgs,
    GetWeightTrendArgs,
    SearchExercisesArgs,
)
from onusfit_ai.shared.llm.gemini import get_coach_tool_declarations


def test_tool_declarations_expose_all_approved_tools() -> None:
    decls = get_coach_tool_declarations()
    names = {d.name for d in decls}
    expected = {
        TOOL_GET_RECENT_WORKOUTS,
        TOOL_GET_NUTRITION_SUMMARY,
        TOOL_GET_WEIGHT_TREND,
        TOOL_SEARCH_EXERCISES,
    }
    assert names == expected, f"Expected {expected}, got {names}"


def test_tool_arguments_strictly_forbid_user_id() -> None:
    """Anti-confused-deputy contract test: Model must NEVER pass userId in arguments."""
    forbidden_payloads = [
        {"days": 7, "userId": "user-123"},
        {"days": 7, "targetUserId": "victim-user"},
        {"days": 7, "user_id": "999"},
    ]
    for bad in forbidden_payloads:
        with pytest.raises(ValidationError):
            GetRecentWorkoutsArgs.model_validate(bad)
        with pytest.raises(ValidationError):
            GetNutritionSummaryArgs.model_validate(bad)
        with pytest.raises(ValidationError):
            GetWeightTrendArgs.model_validate(bad)


def test_recent_workouts_args_boundary_clamping() -> None:
    # Valid
    assert GetRecentWorkoutsArgs(days=1).days == 1
    assert GetRecentWorkoutsArgs(days=90).days == 90
    assert GetRecentWorkoutsArgs().days == 7

    # Out of bounds
    with pytest.raises(ValidationError):
        GetRecentWorkoutsArgs(days=0)
    with pytest.raises(ValidationError):
        GetRecentWorkoutsArgs(days=91)


def test_nutrition_summary_args_bounds_and_pattern() -> None:
    assert GetNutritionSummaryArgs(date="2026-11-20", days=7).date == "2026-11-20"
    assert GetNutritionSummaryArgs(days=30).days == 30

    # Invalid date pattern
    with pytest.raises(ValidationError):
        GetNutritionSummaryArgs(date="20-11-2026")
    # Days clamped to max 30
    with pytest.raises(ValidationError):
        GetNutritionSummaryArgs(days=31)


def test_search_exercises_args_bounds() -> None:
    valid = SearchExercisesArgs(query="Bench Press", muscle="chest", limit=5)
    assert valid.query == "Bench Press"
    assert valid.limit == 5

    # Max limit clamped to 10
    with pytest.raises(ValidationError):
        SearchExercisesArgs(query="Squat", limit=11)
    # Empty query disallowed
    with pytest.raises(ValidationError):
        SearchExercisesArgs(query="")
