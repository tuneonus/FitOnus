"""TypedDict state definitions for LangGraph workout planning workflow."""

from typing import Annotated, Any, TypedDict

from onusfit_ai.features.workout_planner.application.context import AssembledWorkoutContext
from onusfit_ai.features.workout_planner.domain.contracts import (
    ExerciseItemGrounding,
    PlanValidationResult,
    WeeklyWorkoutSchedule,
    WorkoutGenerationRequest,
)


def append_events(left: list[dict[str, Any]], right: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reducer that appends telemetry events monotonically."""
    return left + right


def append_errors(left: list[str], right: list[str]) -> list[str]:
    """Reducer that appends errors monotonically."""
    return left + right


class WorkoutPlannerGraphState(TypedDict):
    """Execution state for the dedicated Workout Planner LangGraph workflow."""

    user_id: str
    trace_id: str
    request: WorkoutGenerationRequest
    goal_interpretation: dict[str, Any]
    context: AssembledWorkoutContext | None
    retrieved_exercises: list[ExerciseItemGrounding]
    generated_plan: WeeklyWorkoutSchedule | None
    validation_result: PlanValidationResult | None
    repair_attempts: int
    max_repairs: int
    is_finalized: bool
    errors: Annotated[list[str], append_errors]
    telemetry_events: Annotated[list[dict[str, Any]], append_events]
    start_time: float
    deadline: float
