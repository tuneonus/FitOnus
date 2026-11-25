"""Tool argument schemas and endpoint definitions for AI Coach internal tools.

Pure Pydantic models and constants: zero framework, zero SDK, zero network imports.
Belongs in shared.contracts so application, presentation, and shared adapters can
all depend on it without circular dependencies or boundary violations.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# Tool identifier constants
TOOL_GET_RECENT_WORKOUTS = "get_recent_workouts"
TOOL_GET_NUTRITION_SUMMARY = "get_nutrition_summary"
TOOL_GET_WEIGHT_TREND = "get_weight_trend"
TOOL_SEARCH_EXERCISES = "search_exercises"
TOOL_GET_EXERCISE_DETAILS = "get_exercise_details"
TOOL_GET_FITNESS_PROFILE = "get_fitness_profile"
TOOL_RETRIEVE_FITNESS_KNOWLEDGE = "retrieve_fitness_knowledge"
TOOL_PREVIEW_WORKOUT_PLAN = "preview_workout_plan"
TOOL_PREVIEW_WORKOUT_ADAPTATION = "preview_workout_adaptation"
TOOL_VALIDATE_WORKOUT_PLAN = "validate_workout_plan"
TOOL_PERSIST_WORKOUT_PLAN = "persist_workout_plan"
TOOL_PREVIEW_NUTRITION_PLAN = "preview_nutrition_plan"

# Service JWT claims configuration
TOOL_JWT_ISSUER = "onusfit-ai-backend"
TOOL_JWT_AUDIENCE = "onusfit-node-api"
TOOL_JWT_SCOPE = "ai:tools:read"
TOOL_JWT_TTL_SECONDS = 30


class GetRecentWorkoutsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    days: int = Field(
        default=7,
        ge=1,
        le=90,
        description="Number of past days of workout sessions to retrieve (1-90). Default is 7.",
    )


class GetNutritionSummaryArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    date: str | None = Field(
        default=None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Optional single date to inspect in YYYY-MM-DD format.",
    )
    days: int = Field(
        default=7,
        ge=1,
        le=30,
        description="Number of days of nutrition history to retrieve (1-30). Default is 7.",
    )


class GetWeightTrendArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    days: int = Field(
        default=30,
        ge=1,
        le=90,
        description="Number of past days of weight logs to retrieve (1-90). Default is 30.",
    )


class SearchExercisesArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(
        min_length=1,
        max_length=50,
        description="Exercise name or keyword to search for in the verified catalog.",
    )
    muscle: str | None = Field(
        default=None,
        max_length=50,
        description="Optional target muscle group filter (e.g. chest, back, quadriceps, triceps).",
    )
    equipment: str | None = Field(
        default=None,
        max_length=50,
        description="Optional equipment filter (e.g. barbell, dumbbell, cable, bodyweight).",
    )
    limit: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Maximum number of exercises to return (1-10). Default is 5.",
    )


class GetExerciseDetailsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    exercise_id: str = Field(
        min_length=1,
        max_length=64,
        description="Unique identifier or UUID of the exercise in the catalog.",
    )


class GetFitnessProfileArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RetrieveFitnessKnowledgeArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(
        min_length=1,
        max_length=200,
        description="Search query to retrieve verified fitness and nutrition knowledge.",
    )
    category: str | None = Field(
        default=None,
        max_length=50,
        description="Optional knowledge category filter (fitness, nutrition, recovery, app_guide).",
    )
    limit: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Maximum number of relevant knowledge chunks to return (1-10). Default is 3.",
    )


class PreviewWorkoutPlanArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    primary_goal: str = Field(
        description="Primary goal: 'strength', 'hypertrophy', 'endurance', or 'general_fitness'."
    )
    experience_level: str = Field(
        default="intermediate",
        description="User experience tier: 'beginner', 'intermediate', or 'advanced'.",
    )
    days_per_week: int = Field(
        default=3,
        ge=2,
        le=6,
        description="Weekly training frequency (2-6 days). Default is 3.",
    )
    target_muscles: list[str] | None = Field(
        default=None,
        description="Target muscle groups to focus on.",
    )
    equipment: list[str] | None = Field(
        default=None,
        description="Available equipment list (e.g. ['barbell', 'dumbbell']).",
    )
    duration_minutes: int = Field(
        default=60,
        ge=20,
        le=120,
        description="Preferred session duration in minutes (20-120). Default is 60.",
    )


class PreviewWorkoutAdaptationArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feedback: str = Field(
        min_length=3,
        max_length=500,
        description="User feedback on active workout plan (fatigue, soreness, equipment change).",
    )
    current_plan: dict[str, Any] = Field(
        description="Current active weekly workout plan schedule dictionary.",
    )
    deload: bool = Field(
        default=False,
        description="Whether to apply a recovery deload reduction.",
    )


class ValidateWorkoutPlanArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan: dict[str, Any] = Field(
        description=(
            "Weekly workout plan schedule dictionary to validate for safety and volume constraints."
        ),
    )
    experience_level: str = Field(
        default="intermediate",
        description="Athlete experience level ('beginner', 'intermediate', 'advanced').",
    )
    limitations: list[str] | None = Field(
        default=None,
        description="Optional list of physical limitations or injuries to contraindicate.",
    )


class PersistWorkoutPlanArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan: dict[str, Any] = Field(
        description="Validated weekly workout plan schedule dictionary to persist.",
    )
    name: str = Field(
        min_length=1,
        max_length=100,
        description="Name of the saved workout plan.",
    )
    confirmed: bool = Field(
        default=False,
        description=(
            "Explicit human-in-the-loop user confirmation token. False produces an approval ticket."
        ),
    )
    idempotency_key: str | None = Field(
        default=None,
        max_length=64,
        description="Unique client idempotency key to prevent duplicate saves.",
    )


class PreviewNutritionPlanArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    goal: str = Field(
        description=(
            "Primary nutrition goal: 'fat_loss', 'muscle_building', 'maintenance', or 'endurance'."
        ),
    )
    weight_kg: float | None = Field(
        default=None,
        ge=30.0,
        le=300.0,
        description="Current athlete weight in kg.",
    )
    diet_type: str = Field(
        default="none",
        description="Dietary preference: 'none', 'vegetarian', 'vegan', 'keto', etc.",
    )
    target_calories: int | None = Field(
        default=None,
        ge=1000,
        le=6000,
        description="Optional custom target daily calories.",
    )


TOOL_ARG_SCHEMAS: dict[str, type[BaseModel]] = {
    TOOL_GET_RECENT_WORKOUTS: GetRecentWorkoutsArgs,
    TOOL_GET_NUTRITION_SUMMARY: GetNutritionSummaryArgs,
    TOOL_GET_WEIGHT_TREND: GetWeightTrendArgs,
    TOOL_SEARCH_EXERCISES: SearchExercisesArgs,
    TOOL_GET_EXERCISE_DETAILS: GetExerciseDetailsArgs,
    TOOL_GET_FITNESS_PROFILE: GetFitnessProfileArgs,
    TOOL_RETRIEVE_FITNESS_KNOWLEDGE: RetrieveFitnessKnowledgeArgs,
    TOOL_PREVIEW_WORKOUT_PLAN: PreviewWorkoutPlanArgs,
    TOOL_PREVIEW_WORKOUT_ADAPTATION: PreviewWorkoutAdaptationArgs,
    TOOL_VALIDATE_WORKOUT_PLAN: ValidateWorkoutPlanArgs,
    TOOL_PERSIST_WORKOUT_PLAN: PersistWorkoutPlanArgs,
    TOOL_PREVIEW_NUTRITION_PLAN: PreviewNutritionPlanArgs,
}

TOOL_ENDPOINT_PATHS: dict[str, str] = {
    TOOL_GET_RECENT_WORKOUTS: "/api/v1/internal/tools/recent-workouts",
    TOOL_GET_NUTRITION_SUMMARY: "/api/v1/internal/tools/nutrition-summary",
    TOOL_GET_WEIGHT_TREND: "/api/v1/internal/tools/weight-trend",
    TOOL_SEARCH_EXERCISES: "/api/v1/internal/tools/search-exercises",
    TOOL_GET_EXERCISE_DETAILS: "/api/v1/internal/tools/exercise-details",
    TOOL_GET_FITNESS_PROFILE: "/api/v1/internal/tools/fitness-profile",
    TOOL_RETRIEVE_FITNESS_KNOWLEDGE: "/api/v1/internal/tools/retrieve-knowledge",
}

# Mapping from tool names to client-facing source labels for CoachResponse.sources
TOOL_SOURCE_LABELS: dict[str, str] = {
    TOOL_GET_RECENT_WORKOUTS: "recent_workouts",
    TOOL_GET_NUTRITION_SUMMARY: "nutrition_summary",
    TOOL_GET_WEIGHT_TREND: "weight_trend",
    TOOL_SEARCH_EXERCISES: "exercise_catalog",
    TOOL_GET_EXERCISE_DETAILS: "exercise_details",
    TOOL_GET_FITNESS_PROFILE: "fitness_profile",
    TOOL_RETRIEVE_FITNESS_KNOWLEDGE: "fitness_knowledge",
    TOOL_PREVIEW_WORKOUT_PLAN: "workout_planner",
    TOOL_PREVIEW_WORKOUT_ADAPTATION: "workout_planner",
    TOOL_VALIDATE_WORKOUT_PLAN: "workout_safety",
    TOOL_PERSIST_WORKOUT_PLAN: "workout_storage",
    TOOL_PREVIEW_NUTRITION_PLAN: "nutrition_planner",
}
