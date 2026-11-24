"""LangGraph workflow executor for Workout Planning."""

import logging
import time
import uuid
from typing import Any

from onusfit_ai.features.workout_planner.application.generator import WorkoutPlanGenerator
from onusfit_ai.features.workout_planner.application.graph.builder import (
    build_workout_planner_graph,
)
from onusfit_ai.features.workout_planner.application.graph.state import WorkoutPlannerGraphState
from onusfit_ai.features.workout_planner.application.grounding import ExerciseCatalogIndex
from onusfit_ai.features.workout_planner.domain.contracts import (
    PlanValidationResult,
    WeeklyWorkoutSchedule,
    WorkoutGenerationRequest,
)
from onusfit_ai.features.workout_planner.domain.safety import validate_plan_safety
from onusfit_ai.shared.llm.ports import TextGenerator

logger = logging.getLogger("onusfit_ai.workout_planner.graph.executor")


class WorkoutPlannerGraphExecutor:
    """Executes the LangGraph Workout Planning workflow with telemetry and fault tolerance."""

    def __init__(
        self,
        llm: TextGenerator | None = None,
        tools_client: Any | None = None,
        catalog_index: ExerciseCatalogIndex | None = None,
        generator: WorkoutPlanGenerator | None = None,
        max_repairs: int = 2,
    ) -> None:
        self.llm = llm
        self.tools_client = tools_client
        self.catalog_index = catalog_index or ExerciseCatalogIndex()
        self.generator = generator or WorkoutPlanGenerator(catalog_index=self.catalog_index)
        self.max_repairs = max_repairs
        self.graph = build_workout_planner_graph(
            llm=self.llm,
            tools_client=self.tools_client,
            catalog_index=self.catalog_index,
            generator=self.generator,
        )

    async def execute(
        self,
        request: WorkoutGenerationRequest,
        trace_id: str | None = None,
        deadline_ms: int = 25000,
    ) -> tuple[WeeklyWorkoutSchedule, PlanValidationResult]:
        """Execute the LangGraph workflow with deadline bounds and fallback."""
        tid = trace_id or f"wp-{uuid.uuid4().hex[:8]}"
        t_start = time.time()
        deadline = t_start + (deadline_ms / 1000.0)

        initial_state: WorkoutPlannerGraphState = {
            "user_id": request.user_id,
            "trace_id": tid,
            "request": request,
            "goal_interpretation": {},
            "context": None,
            "retrieved_exercises": [],
            "generated_plan": None,
            "validation_result": None,
            "repair_attempts": 0,
            "max_repairs": self.max_repairs,
            "is_finalized": False,
            "errors": [],
            "telemetry_events": [],
            "start_time": t_start,
            "deadline": deadline,
        }

        try:
            # Check deadline before execution
            if time.time() > deadline:
                logger.warning(
                    "Workout planner deadline exceeded before graph launch for trace %s", tid
                )
                return self._fallback_execution(request, tid, "Deadline exceeded before execution")

            result_state = await self.graph.ainvoke(initial_state)

            final_plan = result_state.get("generated_plan")
            val_result = result_state.get("validation_result")

            if final_plan is None or val_result is None:
                logger.warning(
                    "Graph completed without generated plan for trace %s; falling back", tid
                )
                return self._fallback_execution(request, tid, "Incomplete graph execution")

            return final_plan, val_result

        except Exception as exc:
            logger.error(
                "Error executing LangGraph workout planner for trace %s: %s",
                tid,
                exc,
                exc_info=True,
            )
            return self._fallback_execution(request, tid, f"Graph exception: {exc}")

    def _fallback_execution(
        self,
        request: WorkoutGenerationRequest,
        trace_id: str,
        reason: str,
    ) -> tuple[WeeklyWorkoutSchedule, PlanValidationResult]:
        """Graceful fallback to deterministic plan generator."""
        logger.info(
            "Executing deterministic fallback plan for trace %s (reason: %s)", trace_id, reason
        )
        from onusfit_ai.features.workout_planner.application.context import AssembledWorkoutContext

        ctx = AssembledWorkoutContext(
            user_id=request.user_id,
            goal=request.goal,
            experience_level=request.experience_level,
            available_equipment=request.available_equipment,
            days_per_week=request.days_per_week,
            session_duration_minutes=request.session_duration_minutes,
            environment=request.environment,
            physical_limitations=request.physical_limitations,
            target_muscles=request.target_muscles,
            preferred_exercises=request.preferred_exercises,
            excluded_exercises=request.excluded_exercises,
            language=request.language,
        )
        plan = self.generator.generate_deterministic_plan(request, ctx)
        val = validate_plan_safety(
            plan, request, valid_catalog_ids=self.catalog_index.get_all_ids()
        )
        val.warnings.append(f"Generated via deterministic fallback engine: {reason}")
        return plan, val
