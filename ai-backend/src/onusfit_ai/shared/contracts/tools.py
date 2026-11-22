"""Tool argument schemas and endpoint definitions for AI Coach internal tools.

Pure Pydantic models and constants: zero framework, zero SDK, zero network imports.
Belongs in shared.contracts so application, presentation, and shared adapters can
all depend on it without circular dependencies or boundary violations.
"""

from pydantic import BaseModel, ConfigDict, Field

# Tool identifier constants
TOOL_GET_RECENT_WORKOUTS = "get_recent_workouts"
TOOL_GET_NUTRITION_SUMMARY = "get_nutrition_summary"
TOOL_GET_WEIGHT_TREND = "get_weight_trend"
TOOL_SEARCH_EXERCISES = "search_exercises"

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


TOOL_ARG_SCHEMAS: dict[str, type[BaseModel]] = {
    TOOL_GET_RECENT_WORKOUTS: GetRecentWorkoutsArgs,
    TOOL_GET_NUTRITION_SUMMARY: GetNutritionSummaryArgs,
    TOOL_GET_WEIGHT_TREND: GetWeightTrendArgs,
    TOOL_SEARCH_EXERCISES: SearchExercisesArgs,
}

TOOL_ENDPOINT_PATHS: dict[str, str] = {
    TOOL_GET_RECENT_WORKOUTS: "/api/v1/internal/tools/recent-workouts",
    TOOL_GET_NUTRITION_SUMMARY: "/api/v1/internal/tools/nutrition-summary",
    TOOL_GET_WEIGHT_TREND: "/api/v1/internal/tools/weight-trend",
    TOOL_SEARCH_EXERCISES: "/api/v1/internal/tools/search-exercises",
}

# Mapping from tool names to client-facing source labels for CoachResponse.sources
TOOL_SOURCE_LABELS: dict[str, str] = {
    TOOL_GET_RECENT_WORKOUTS: "recent_workouts",
    TOOL_GET_NUTRITION_SUMMARY: "nutrition_summary",
    TOOL_GET_WEIGHT_TREND: "weight_trend",
    TOOL_SEARCH_EXERCISES: "exercise_catalog",
}
