"""Routing predicates for LangGraph Workout Planning Workflow."""

from typing import Literal

from onusfit_ai.features.workout_planner.application.graph.state import WorkoutPlannerGraphState


def route_after_validation(
    state: WorkoutPlannerGraphState,
) -> Literal["repair_plan", "finalize_plan"]:
    """Decide whether to proceed to finalization or execute a bounded repair."""
    val = state.get("validation_result")
    repairs = state.get("repair_attempts", 0)
    max_repairs = state.get("max_repairs", 2)

    # If valid, finalize directly
    if val is not None and val.is_valid:
        return "finalize_plan"

    # If invalid but repair budget remains, try repair
    if repairs < max_repairs:
        return "repair_plan"

    # Otherwise finalize (safety validator/generator enforces safe fallback)
    return "finalize_plan"
