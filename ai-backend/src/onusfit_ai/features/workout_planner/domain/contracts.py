"""Typed domain contracts for the FitOnus AI Workout Planner subsystem."""

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WorkoutGoal(StrEnum):
    """Supported workout training goals."""

    GENERAL_FITNESS = "general_fitness"
    MUSCLE_BUILDING = "muscle_building"
    STRENGTH = "strength"
    FAT_LOSS = "fat_loss"
    ENDURANCE = "endurance"


class ExperienceLevel(StrEnum):
    """User training experience levels."""

    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class WorkoutEnvironment(StrEnum):
    """Target training environment."""

    HOME = "home"
    GYM = "gym"
    BODYWEIGHT = "bodyweight"


class EquipmentItem(StrEnum):
    """Canonical equipment definitions."""

    BARBELL = "barbell"
    DUMBBELLS = "dumbbells"
    KETTLEBELLS = "kettlebells"
    CABLE_MACHINE = "cable_machine"
    BENCH = "bench"
    PULL_UP_BAR = "pull_up_bar"
    RESISTANCE_BANDS = "resistance_bands"
    BODYWEIGHT = "bodyweight"
    CARDIO_MACHINE = "cardio_machine"
    NONE = "none"


class ExerciseAlternative(BaseModel):
    """Alternative exercise mapping for equipment or preference swaps."""

    model_config = ConfigDict(extra="forbid")

    exercise_id: str = Field(description="UUID of the alternative exercise from catalog")
    name: str = Field(description="Display name of the alternative exercise")
    equipment: str = Field(description="Equipment required for this alternative")
    reason: str = Field(description="Reason why this is a suitable substitute")


class ExerciseSelection(BaseModel):
    """A single scheduled exercise within a workout session."""

    model_config = ConfigDict(extra="forbid")

    exercise_id: str = Field(description="Valid UUID matching the exercise catalog record")
    name: str = Field(description="Exercise name")
    target_muscle: str = Field(description="Primary targeted muscle group")
    equipment: str = Field(description="Equipment used for this exercise")
    target_sets: int = Field(ge=1, le=10, description="Prescribed number of working sets")
    target_reps: str = Field(
        description="Prescribed repetition target or range (e.g. '8-10', '12-15')"
    )
    rest_seconds: int = Field(ge=15, le=300, description="Rest duration between sets in seconds")
    target_weight_kg: float = Field(
        ge=0.0, default=0.0, description="Target weight in kg (0.0 for bodyweight)"
    )
    intensity: str = Field(
        default="moderate", description="Prescribed intensity, e.g. RPE 7-8 or 'Moderate'"
    )
    notes: str | None = Field(default=None, description="Form cue, tempo, or execution instruction")
    order_index: int = Field(ge=0, default=0, description="Zero-based execution order index")
    alternatives: list[ExerciseAlternative] = Field(
        default_factory=list,
        description="Grounded alternatives from catalog for equipment swaps or injuries",
    )


class WarmupCooldown(BaseModel):
    """Warmup and cooldown structure."""

    model_config = ConfigDict(extra="forbid")

    exercises: list[str] = Field(
        default_factory=list, description="Warmup or cooldown dynamic mobility drills"
    )
    duration_minutes: int = Field(ge=0, le=20, default=5, description="Duration in minutes")
    notes: str | None = Field(default=None, description="Coaching guidance for warmup/cooldown")


class SingleSessionPlan(BaseModel):
    """A planned workout session for a specific day."""

    model_config = ConfigDict(extra="forbid")

    session_id: str = Field(description="Deterministic or unique session identifier")
    day_name: str = Field(
        description="Day identifier (e.g. 'Day 1 - Push & Core', 'Monday - Strength')"
    )
    focus: str = Field(
        description="Session anatomical or functional focus (e.g. 'Upper Body Hypertrophy')"
    )
    estimated_duration_minutes: int = Field(
        ge=15, le=120, description="Estimated workout duration in minutes"
    )
    difficulty: ExperienceLevel = Field(description="Session difficulty level")
    warmup: WarmupCooldown = Field(default_factory=WarmupCooldown)
    exercises: list[ExerciseSelection] = Field(
        min_length=1, description="Ordered exercises for this session"
    )
    cooldown: WarmupCooldown = Field(default_factory=WarmupCooldown)
    notes: str | None = Field(default=None, description="Session-level coaching remarks")


class WeeklyWorkoutSchedule(BaseModel):
    """Complete weekly workout plan generated or adapted by AI."""

    model_config = ConfigDict(extra="forbid")

    plan_id: str = Field(description="Generated unique plan UUID")
    title: str = Field(description="Plan title (e.g. '4-Day Hypertrophy & Fat Loss Split')")
    description: str = Field(description="Clear plan overview and progression strategy")
    goal: WorkoutGoal = Field(description="Primary fitness goal")
    level: ExperienceLevel = Field(description="Experience level targeted")
    total_days_per_week: int = Field(ge=1, le=7, description="Number of training days per week")
    environment: WorkoutEnvironment = Field(default=WorkoutEnvironment.GYM)
    schedule_days: list[SingleSessionPlan] = Field(
        min_length=1, description="Workout sessions across the week"
    )
    recovery_days: list[str] = Field(
        default_factory=list, description="Prescribed active/passive recovery days"
    )
    rationale: list[str] = Field(
        default_factory=list,
        description="Structured rationale explaining choices based on user profile and evidence",
    )
    language: str = Field(
        default="en", description="Generation language: 'en', 'ta', or 'tanglish'"
    )


class ExerciseItemGrounding(BaseModel):
    """Exercise catalog item used for grounding generation."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(description="Catalog exercise UUID")
    name: str = Field(description="Exercise name")
    primary_muscles: list[str] = Field(default_factory=list)
    secondary_muscles: list[str] = Field(default_factory=list)
    equipment: str = Field(description="Required equipment")
    difficulty: str = Field(description="beginner, intermediate, or advanced")
    category: str = Field(default="strength")
    is_compound: bool = Field(default=False)


class WorkoutGenerationRequest(BaseModel):
    """Request payload to generate a new personalized workout plan."""

    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(description="Authenticated user UUID")
    goal: WorkoutGoal = Field(default=WorkoutGoal.GENERAL_FITNESS)
    experience_level: ExperienceLevel = Field(default=ExperienceLevel.INTERMEDIATE)
    available_equipment: list[str] = Field(
        default_factory=lambda: ["dumbbells", "bench", "bodyweight"],
        description="List of user's available equipment",
    )
    days_per_week: int = Field(default=3, ge=1, le=7, description="Target training days per week")
    session_duration_minutes: int = Field(
        default=45, ge=15, le=120, description="Preferred session duration"
    )
    environment: WorkoutEnvironment = Field(default=WorkoutEnvironment.GYM)
    physical_limitations: list[str] = Field(
        default_factory=list,
        description="Approved limitations (e.g. 'knee pain', 'shoulder impingement')",
    )
    target_muscles: list[str] = Field(
        default_factory=list, description="Target muscle groups to prioritize"
    )
    preferred_exercises: list[str] = Field(
        default_factory=list, description="Exercise names user prefers"
    )
    excluded_exercises: list[str] = Field(
        default_factory=list, description="Exercise names or IDs user dislikes/avoids"
    )
    language: str = Field(
        default="en", description="Output language: 'en', 'ta' (Tamil), or 'tanglish'"
    )
    rag_context: list[str] = Field(
        default_factory=list, description="Relevant science/knowledge grounding passages"
    )
    recent_performance: dict[str, float] = Field(
        default_factory=dict,
        description="Recent performance metrics e.g. {'volume_kg': 12000, 'sessions_completed': 4}",
    )


class WorkoutAdaptationRequest(BaseModel):
    """Request to adapt an existing workout plan dynamically."""

    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(description="Authenticated user UUID")
    current_plan: WeeklyWorkoutSchedule = Field(description="Existing active workout plan")
    missed_sessions: list[str] = Field(
        default_factory=list, description="Session IDs or day names missed"
    )
    reduced_duration_minutes: int | None = Field(default=None, ge=15, le=120)
    new_equipment: list[str] | None = Field(
        default=None, description="Updated equipment list if changed"
    )
    difficulty_feedback: Literal["too_easy", "just_right", "too_hard"] | None = Field(default=None)
    user_feedback: str | None = Field(
        default=None, description="Free text user feedback or pain report"
    )
    recovery_score: float | None = Field(
        default=None, ge=0.0, le=100.0, description="Recovery score (0-100)"
    )
    language: str = Field(default="en")


class PlanValidationResult(BaseModel):
    """Deterministic validation result of a generated or adapted workout plan."""

    model_config = ConfigDict(extra="forbid")

    is_valid: bool = Field(description="True if the plan passed all deterministic safety checks")
    errors: list[str] = Field(default_factory=list, description="Fatal safety or grounding errors")
    warnings: list[str] = Field(
        default_factory=list, description="Non-fatal coaching suggestions or notices"
    )
    safety_score: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Deterministic safety score (0.0 - 1.0)"
    )
    repaired: bool = Field(
        default=False, description="Whether this plan underwent automated bounded repair"
    )
    medical_red_flags: list[str] = Field(
        default_factory=list, description="Identified medical red flags requiring clinical care"
    )
