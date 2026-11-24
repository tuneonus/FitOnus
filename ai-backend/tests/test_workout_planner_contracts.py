"""Unit tests for AI Workout Planner domain contracts and serialization."""

import pytest
from pydantic import ValidationError

from onusfit_ai.features.workout_planner.domain.contracts import (
    ExerciseSelection,
    ExperienceLevel,
    SingleSessionPlan,
    WeeklyWorkoutSchedule,
    WorkoutAdaptationRequest,
    WorkoutGenerationRequest,
    WorkoutGoal,
)


def test_exercise_selection_validation() -> None:
    ex = ExerciseSelection(
        exercise_id="a1111111-1111-4111-8111-111111111101",
        name="Push-Up",
        target_muscle="chest",
        equipment="bodyweight",
        target_sets=3,
        target_reps="10-12",
        rest_seconds=60,
    )
    assert ex.target_sets == 3
    assert ex.rest_seconds == 60
    assert ex.target_weight_kg == 0.0

    # Invalid sets (< 1)
    with pytest.raises(ValidationError):
        ExerciseSelection(
            exercise_id="a1111111-1111-4111-8111-111111111101",
            name="Push-Up",
            target_muscle="chest",
            equipment="bodyweight",
            target_sets=0,
            target_reps="10",
            rest_seconds=60,
        )


def test_single_session_plan_validation() -> None:
    ex = ExerciseSelection(
        exercise_id="a1111111-1111-4111-8111-111111111101",
        name="Push-Up",
        target_muscle="chest",
        equipment="bodyweight",
        target_sets=3,
        target_reps="10",
        rest_seconds=60,
    )
    session = SingleSessionPlan(
        session_id="sess_1",
        day_name="Day 1 - Chest",
        focus="Chest Hypertrophy",
        estimated_duration_minutes=45,
        difficulty=ExperienceLevel.INTERMEDIATE,
        exercises=[ex],
    )
    assert session.estimated_duration_minutes == 45
    assert len(session.exercises) == 1

    # Empty exercises list violates min_length=1
    with pytest.raises(ValidationError):
        SingleSessionPlan(
            session_id="sess_invalid",
            day_name="Day Empty",
            focus="Nothing",
            estimated_duration_minutes=45,
            difficulty=ExperienceLevel.BEGINNER,
            exercises=[],
        )


def test_weekly_workout_schedule_serialization() -> None:
    ex = ExerciseSelection(
        exercise_id="a1111111-1111-4111-8111-111111111101",
        name="Push-Up",
        target_muscle="chest",
        equipment="bodyweight",
        target_sets=3,
        target_reps="10",
        rest_seconds=60,
    )
    session = SingleSessionPlan(
        session_id="sess_1",
        day_name="Monday",
        focus="Upper Body",
        estimated_duration_minutes=40,
        difficulty=ExperienceLevel.BEGINNER,
        exercises=[ex],
    )
    plan = WeeklyWorkoutSchedule(
        plan_id="plan_1",
        title="Weekly Beginner Split",
        description="3-day full body split",
        goal=WorkoutGoal.GENERAL_FITNESS,
        level=ExperienceLevel.BEGINNER,
        total_days_per_week=1,
        schedule_days=[session],
        recovery_days=["Tuesday", "Thursday"],
    )

    dumped = plan.model_dump()
    assert dumped["title"] == "Weekly Beginner Split"
    assert dumped["goal"] == "general_fitness"
    assert len(dumped["schedule_days"]) == 1

    reloaded = WeeklyWorkoutSchedule.model_validate(dumped)
    assert reloaded.plan_id == "plan_1"
    assert reloaded.level == ExperienceLevel.BEGINNER


def test_workout_generation_request_defaults() -> None:
    req = WorkoutGenerationRequest(user_id="usr_test")
    assert req.user_id == "usr_test"
    assert req.goal == WorkoutGoal.GENERAL_FITNESS
    assert req.experience_level == ExperienceLevel.INTERMEDIATE
    assert req.days_per_week == 3
    assert req.session_duration_minutes == 45
    assert "bodyweight" in req.available_equipment


def test_workout_adaptation_request_validation() -> None:
    ex = ExerciseSelection(
        exercise_id="a1111111-1111-4111-8111-111111111101",
        name="Push-Up",
        target_muscle="chest",
        equipment="bodyweight",
        target_sets=3,
        target_reps="10",
        rest_seconds=60,
    )
    plan = WeeklyWorkoutSchedule(
        plan_id="plan_adapt",
        title="Active Plan",
        description="Adaptation target",
        goal=WorkoutGoal.MUSCLE_BUILDING,
        level=ExperienceLevel.INTERMEDIATE,
        total_days_per_week=1,
        schedule_days=[
            SingleSessionPlan(
                session_id="sess_adapt",
                day_name="Day 1",
                focus="Full Body",
                estimated_duration_minutes=60,
                difficulty=ExperienceLevel.INTERMEDIATE,
                exercises=[ex],
            )
        ],
    )
    adapt_req = WorkoutAdaptationRequest(
        user_id="usr_adapt",
        current_plan=plan,
        reduced_duration_minutes=30,
        difficulty_feedback="too_hard",
        recovery_score=45.0,
    )
    assert adapt_req.reduced_duration_minutes == 30
    assert adapt_req.difficulty_feedback == "too_hard"
