"""Unit tests for Workout Planner deterministic safety validator and red flag detection."""

from onusfit_ai.features.workout_planner.domain.contracts import (
    ExerciseSelection,
    ExperienceLevel,
    SingleSessionPlan,
    WeeklyWorkoutSchedule,
    WorkoutGenerationRequest,
    WorkoutGoal,
)
from onusfit_ai.features.workout_planner.domain.safety import (
    detect_medical_red_flags,
    find_contraindicated_exercises,
    validate_plan_safety,
)


def test_detect_medical_red_flags() -> None:
    flags1 = detect_medical_red_flags(["chest pain during running", "shortness of breath"])
    assert len(flags1) > 0
    assert any("chest pain" in f.lower() for f in flags1)

    flags2 = detect_medical_red_flags(["fractured tibia last week"])
    assert len(flags2) > 0

    flags3 = detect_medical_red_flags(["dizziness and blackouts"])
    assert len(flags3) > 0

    flags_clean = detect_medical_red_flags(["mild fatigue", "wants to build muscle"])
    assert len(flags_clean) == 0


def test_contraindicated_exercises_filtering() -> None:
    violations = find_contraindicated_exercises(
        exercise_id="eid_1",
        exercise_name="Heavy Barbell Squat",
        limitations=["patellar tendinitis in knee"],
    )
    assert len(violations) > 0
    assert any("knee" in v.lower() for v in violations)

    clean_violations = find_contraindicated_exercises(
        exercise_id="eid_2",
        exercise_name="Glute Bridge",
        limitations=["knee pain"],
    )
    assert len(clean_violations) == 0


def test_safety_validator_rejects_duplicate_exercises() -> None:
    ex1 = ExerciseSelection(
        exercise_id="a1111111-1111-4111-8111-111111111101",
        name="Push-Up",
        target_muscle="chest",
        equipment="bodyweight",
        target_sets=3,
        target_reps="10",
        rest_seconds=60,
    )
    ex2 = ExerciseSelection(
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
        day_name="Push Day",
        focus="Chest",
        estimated_duration_minutes=45,
        difficulty=ExperienceLevel.BEGINNER,
        exercises=[ex1, ex2],
    )
    plan = WeeklyWorkoutSchedule(
        plan_id="plan_dup",
        title="Duplicate Exercise Plan",
        description="Testing duplicate safety check",
        goal=WorkoutGoal.GENERAL_FITNESS,
        level=ExperienceLevel.BEGINNER,
        total_days_per_week=1,
        schedule_days=[session],
    )
    req = WorkoutGenerationRequest(user_id="usr_test", days_per_week=1)
    result = validate_plan_safety(plan, req)
    assert not result.is_valid
    assert any("Duplicate exercise" in e for e in result.errors)


def test_safety_validator_rejects_excessive_session_volume() -> None:
    # Beginner cap is 18 sets per session
    exercises = [
        ExerciseSelection(
            exercise_id=f"a1111111-1111-4111-8111-11111111110{i}",
            name=f"Exercise {i}",
            target_muscle="chest",
            equipment="bodyweight",
            target_sets=5,
            target_reps="10",
            rest_seconds=60,
        )
        for i in range(1, 5)  # 4 exercises * 5 sets = 20 sets > 18 cap
    ]
    session = SingleSessionPlan(
        session_id="sess_vol",
        day_name="High Vol Day",
        focus="Chest",
        estimated_duration_minutes=60,
        difficulty=ExperienceLevel.BEGINNER,
        exercises=exercises,
    )
    plan = WeeklyWorkoutSchedule(
        plan_id="plan_vol",
        title="Overvolume Plan",
        description="Testing volume safety cap",
        goal=WorkoutGoal.GENERAL_FITNESS,
        level=ExperienceLevel.BEGINNER,
        total_days_per_week=1,
        schedule_days=[session],
    )
    req = WorkoutGenerationRequest(
        user_id="usr_test",
        experience_level=ExperienceLevel.BEGINNER,
        days_per_week=1,
    )
    result = validate_plan_safety(plan, req)
    assert not result.is_valid
    assert any("exceeds maximum safe threshold" in e for e in result.errors)
