"""Gemini Function Calling tool specifications for AI Coach.

Pure application/domain contracts: re-exports tool argument schemas and constants
from shared.contracts.tools. Keeps the application layer free of framework and SDK dependencies.
"""

from onusfit_ai.shared.contracts.tools import (
    TOOL_ARG_SCHEMAS,
    TOOL_ENDPOINT_PATHS,
    TOOL_GET_EXERCISE_DETAILS,
    TOOL_GET_FITNESS_PROFILE,
    TOOL_GET_NUTRITION_SUMMARY,
    TOOL_GET_RECENT_WORKOUTS,
    TOOL_GET_WEIGHT_TREND,
    TOOL_JWT_AUDIENCE,
    TOOL_JWT_ISSUER,
    TOOL_JWT_SCOPE,
    TOOL_JWT_TTL_SECONDS,
    TOOL_PREVIEW_WORKOUT_ADAPTATION,
    TOOL_PREVIEW_WORKOUT_PLAN,
    TOOL_RETRIEVE_FITNESS_KNOWLEDGE,
    TOOL_SEARCH_EXERCISES,
    TOOL_SOURCE_LABELS,
    GetExerciseDetailsArgs,
    GetFitnessProfileArgs,
    GetNutritionSummaryArgs,
    GetRecentWorkoutsArgs,
    GetWeightTrendArgs,
    PreviewWorkoutAdaptationArgs,
    PreviewWorkoutPlanArgs,
    RetrieveFitnessKnowledgeArgs,
    SearchExercisesArgs,
)
from onusfit_ai.shared.llm.ports import sanitize_tool_error

__all__ = [
    "TOOL_ARG_SCHEMAS",
    "TOOL_ENDPOINT_PATHS",
    "TOOL_GET_EXERCISE_DETAILS",
    "TOOL_GET_FITNESS_PROFILE",
    "TOOL_GET_NUTRITION_SUMMARY",
    "TOOL_GET_RECENT_WORKOUTS",
    "TOOL_GET_WEIGHT_TREND",
    "TOOL_JWT_AUDIENCE",
    "TOOL_JWT_ISSUER",
    "TOOL_JWT_SCOPE",
    "TOOL_JWT_TTL_SECONDS",
    "TOOL_PREVIEW_WORKOUT_ADAPTATION",
    "TOOL_PREVIEW_WORKOUT_PLAN",
    "TOOL_RETRIEVE_FITNESS_KNOWLEDGE",
    "TOOL_SEARCH_EXERCISES",
    "TOOL_SOURCE_LABELS",
    "GetExerciseDetailsArgs",
    "GetFitnessProfileArgs",
    "GetNutritionSummaryArgs",
    "GetRecentWorkoutsArgs",
    "GetWeightTrendArgs",
    "PreviewWorkoutAdaptationArgs",
    "PreviewWorkoutPlanArgs",
    "RetrieveFitnessKnowledgeArgs",
    "SearchExercisesArgs",
    "sanitize_tool_error",
]
