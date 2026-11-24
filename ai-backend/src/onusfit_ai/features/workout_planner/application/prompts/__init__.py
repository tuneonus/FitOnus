"""Workout planner prompts package."""

from onusfit_ai.features.workout_planner.application.prompts.workout_planner import (
    WORKOUT_PLANNER_SYSTEM_PROMPT,
    build_workout_adaptation_user_prompt,
    build_workout_generation_user_prompt,
)

__all__ = [
    "WORKOUT_PLANNER_SYSTEM_PROMPT",
    "build_workout_adaptation_user_prompt",
    "build_workout_generation_user_prompt",
]
