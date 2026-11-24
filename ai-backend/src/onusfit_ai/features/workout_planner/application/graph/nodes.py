"""Node execution implementations for the LangGraph Workout Planning Workflow."""

import time
import uuid
from typing import Any

from onusfit_ai.features.workout_planner.application.context import WorkoutContextAssembler
from onusfit_ai.features.workout_planner.application.generator import WorkoutPlanGenerator
from onusfit_ai.features.workout_planner.application.graph.state import WorkoutPlannerGraphState
from onusfit_ai.features.workout_planner.application.graph.telemetry import WorkoutPlannerTelemetry
from onusfit_ai.features.workout_planner.application.grounding import ExerciseCatalogIndex
from onusfit_ai.features.workout_planner.domain.safety import (
    WorkoutSafetyValidator,
    validate_plan_safety,
)
from onusfit_ai.shared.llm.ports import TextGenerator


async def understand_goal_node(
    state: WorkoutPlannerGraphState,
    llm: TextGenerator | None = None,
) -> dict[str, Any]:
    """Node 1: Understand Goal and check medical red flags."""
    t0 = time.time()
    req = state["request"]
    red_flags = WorkoutSafetyValidator.check_medical_red_flags(req.physical_limitations)

    goal_interp = {
        "primary_goal": req.goal.value,
        "experience": req.experience_level.value,
        "split_frequency": req.days_per_week,
        "session_duration": req.session_duration_minutes,
        "environment": req.environment.value,
        "has_red_flags": len(red_flags) > 0,
        "red_flags": red_flags,
    }

    event = WorkoutPlannerTelemetry.record_node_event(
        node_name="understand_goal",
        user_id=state["user_id"],
        trace_id=state["trace_id"],
        duration_ms=(time.time() - t0) * 1000,
        metadata={"goal": req.goal.value, "has_red_flags": len(red_flags) > 0},
    )
    return {
        "goal_interpretation": goal_interp,
        "errors": red_flags if red_flags else [],
        "telemetry_events": [event],
    }


async def assemble_context_node(
    state: WorkoutPlannerGraphState,
    tools_client: Any | None = None,
) -> dict[str, Any]:
    """Node 2: Assemble personalized context."""
    t0 = time.time()
    req = state["request"]
    context = await WorkoutContextAssembler.assemble_context(
        request=req,
        tools_client=tools_client,
        trace_id=state["trace_id"],
    )
    event = WorkoutPlannerTelemetry.record_node_event(
        node_name="assemble_context",
        user_id=state["user_id"],
        trace_id=state["trace_id"],
        duration_ms=(time.time() - t0) * 1000,
        metadata={"recent_sessions": context.recent_sessions_count},
    )
    return {
        "context": context,
        "telemetry_events": [event],
    }


async def retrieve_exercises_node(
    state: WorkoutPlannerGraphState,
    catalog_index: ExerciseCatalogIndex | None = None,
) -> dict[str, Any]:
    """Node 3: Retrieve and ground matching exercises from catalog."""
    t0 = time.time()
    index = catalog_index or ExerciseCatalogIndex()
    req = state["request"]
    matched = index.filter_exercises(
        available_equipment=req.available_equipment,
        limitations=req.physical_limitations,
        excluded_names_or_ids=req.excluded_exercises,
    )
    event = WorkoutPlannerTelemetry.record_node_event(
        node_name="retrieve_exercises",
        user_id=state["user_id"],
        trace_id=state["trace_id"],
        duration_ms=(time.time() - t0) * 1000,
        metadata={"matched_count": len(matched)},
    )
    return {
        "retrieved_exercises": matched,
        "telemetry_events": [event],
    }


async def generate_plan_node(
    state: WorkoutPlannerGraphState,
    generator: WorkoutPlanGenerator | None = None,
    llm: TextGenerator | None = None,
) -> dict[str, Any]:
    """Node 4: Generate structured workout plan."""
    t0 = time.time()
    gen = generator or WorkoutPlanGenerator()
    req = state["request"]
    ctx = state.get("context")
    if ctx is None:
        ctx = await WorkoutContextAssembler.assemble_context(req)

    # Check if red flags were detected during goal interpretation
    if state["goal_interpretation"].get("has_red_flags", False):
        plan, val = await gen.generate_workout_plan(req, ctx, llm=None)
    else:
        plan, val = await gen.generate_workout_plan(req, ctx, llm=llm, max_repair_attempts=0)

    event = WorkoutPlannerTelemetry.record_node_event(
        node_name="generate_plan",
        user_id=state["user_id"],
        trace_id=state["trace_id"],
        duration_ms=(time.time() - t0) * 1000,
        metadata={"plan_id": plan.plan_id, "is_valid": val.is_valid},
    )
    return {
        "generated_plan": plan,
        "validation_result": val,
        "telemetry_events": [event],
    }


async def validate_plan_node(
    state: WorkoutPlannerGraphState,
    catalog_index: ExerciseCatalogIndex | None = None,
) -> dict[str, Any]:
    """Node 5: Deterministically validate generated plan."""
    t0 = time.time()
    plan = state["generated_plan"]
    req = state["request"]
    index = catalog_index or ExerciseCatalogIndex()
    valid_ids = index.get_all_ids()

    if plan is None:
        val_result = validate_plan_safety(
            plan=gen_empty_plan(req),
            request=req,
            valid_catalog_ids=valid_ids,
        )
    else:
        val_result = validate_plan_safety(plan, req, valid_catalog_ids=valid_ids)

    event = WorkoutPlannerTelemetry.record_node_event(
        node_name="validate_plan",
        user_id=state["user_id"],
        trace_id=state["trace_id"],
        duration_ms=(time.time() - t0) * 1000,
        metadata={"is_valid": val_result.is_valid, "error_count": len(val_result.errors)},
    )
    return {
        "validation_result": val_result,
        "telemetry_events": [event],
    }


async def repair_plan_node(
    state: WorkoutPlannerGraphState,
    generator: WorkoutPlanGenerator | None = None,
) -> dict[str, Any]:
    """Node 6: Bounded repair of invalid plan."""
    t0 = time.time()
    gen = generator or WorkoutPlanGenerator()
    req = state["request"]
    plan = state["generated_plan"]
    val = state["validation_result"]
    retrieved = state["retrieved_exercises"]

    current_repairs = state["repair_attempts"] + 1

    if plan is not None and val is not None:
        repaired_plan = gen._repair_plan(plan, val.errors, req, retrieved)
        repaired_val = validate_plan_safety(
            repaired_plan, req, valid_catalog_ids=gen.catalog_index.get_all_ids()
        )
        repaired_val.repaired = True
    else:
        ctx = state.get("context") or await WorkoutContextAssembler.assemble_context(req)
        repaired_plan = gen.generate_deterministic_plan(req, ctx)
        repaired_val = validate_plan_safety(
            repaired_plan, req, valid_catalog_ids=gen.catalog_index.get_all_ids()
        )
        repaired_val.repaired = True

    event = WorkoutPlannerTelemetry.record_node_event(
        node_name="repair_plan",
        user_id=state["user_id"],
        trace_id=state["trace_id"],
        duration_ms=(time.time() - t0) * 1000,
        metadata={"repair_attempt": current_repairs, "repaired_is_valid": repaired_val.is_valid},
    )
    return {
        "generated_plan": repaired_plan,
        "validation_result": repaired_val,
        "repair_attempts": current_repairs,
        "telemetry_events": [event],
    }


async def finalize_plan_node(
    state: WorkoutPlannerGraphState,
) -> dict[str, Any]:
    """Node 7: Finalize generated plan and attach rationale."""
    t0 = time.time()
    event = WorkoutPlannerTelemetry.record_node_event(
        node_name="finalize_plan",
        user_id=state["user_id"],
        trace_id=state["trace_id"],
        duration_ms=(time.time() - t0) * 1000,
        metadata={"finalized": True},
    )
    return {
        "is_finalized": True,
        "telemetry_events": [event],
    }


def gen_empty_plan(req: Any) -> Any:
    from onusfit_ai.features.workout_planner.domain.contracts import WeeklyWorkoutSchedule

    return WeeklyWorkoutSchedule(
        plan_id=str(uuid.uuid4()),
        title="Empty Plan",
        description="Empty",
        goal=req.goal,
        level=req.experience_level,
        total_days_per_week=1,
        schedule_days=[],
    )
