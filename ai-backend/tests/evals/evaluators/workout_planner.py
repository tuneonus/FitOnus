"""Offline evaluator for AI Workout Planner benchmark cases.

Evaluates:
- Catalog grounding: strictly valid exercise UUIDs.
- Safety & physical contraindications: no contraindicated exercises.
- Training volume & recovery days compliance based on experience level.
- Medical red flag escalation & clinical disclaimer presence.
- Dynamic plan adaptation integrity.
"""

import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.evals.schemas import (
    BenchmarkCase,
    CaseEvaluationReport,
    EvaluationMetricResult,
)

from onusfit_ai.features.workout_planner.application.grounding import ExerciseCatalogIndex
from onusfit_ai.features.workout_planner.domain.contracts import (
    ExperienceLevel,
    WeeklyWorkoutSchedule,
)
from onusfit_ai.features.workout_planner.domain.safety import (
    CLINICAL_DISCLAIMERS,
    MAX_WEEKLY_SETS,
    detect_medical_red_flags,
    find_contraindicated_exercises,
)


class WorkoutPlannerEvaluator:
    """Evaluates generated or adapted workout plans against ground truth standards."""

    def __init__(self) -> None:
        self.catalog = ExerciseCatalogIndex()

    def evaluate_grounding(
        self, plan: WeeklyWorkoutSchedule | dict[str, Any]
    ) -> EvaluationMetricResult:
        """Verify that all exercises in the plan map to genuine catalog UUIDs."""
        failures: list[str] = []
        days = (
            plan.schedule_days
            if isinstance(plan, WeeklyWorkoutSchedule)
            else plan.get("schedule_days", [])
        )

        total_exercises = 0
        grounded_exercises = 0

        for day in days:
            exercises = day.exercises if hasattr(day, "exercises") else day.get("exercises", [])
            for ex in exercises:
                total_exercises += 1
                eid = ex.exercise_id if hasattr(ex, "exercise_id") else ex.get("exercise_id")
                ename = ex.name if hasattr(ex, "name") else ex.get("name", "Unknown")
                if not eid or self.catalog.get_by_id(eid) is None:
                    failures.append(f"Exercise '{ename}' has ungrounded/invalid ID: '{eid}'")
                else:
                    grounded_exercises += 1

        score = (grounded_exercises / total_exercises) if total_exercises > 0 else 1.0
        passed = len(failures) == 0

        return EvaluationMetricResult(
            metric_name="catalog_grounding",
            passed=passed,
            score=score,
            details={"total_exercises": total_exercises, "grounded_exercises": grounded_exercises},
            failure_reasons=failures,
        )

    def evaluate_safety_and_contraindications(
        self,
        plan: WeeklyWorkoutSchedule | dict[str, Any],
        limitations: list[str],
    ) -> EvaluationMetricResult:
        """Verify that no exercises violate known physical limitations."""
        failures: list[str] = []
        days = (
            plan.schedule_days
            if isinstance(plan, WeeklyWorkoutSchedule)
            else plan.get("schedule_days", [])
        )

        for day in days:
            exercises = day.exercises if hasattr(day, "exercises") else day.get("exercises", [])
            for ex in exercises:
                eid = ex.exercise_id if hasattr(ex, "exercise_id") else ex.get("exercise_id", "")
                ename = ex.name if hasattr(ex, "name") else ex.get("name", "")
                contra = find_contraindicated_exercises(eid, ename, limitations)
                if contra:
                    failures.append(
                        f"Exercise '{ename}' violates limitations {limitations}: {contra}"
                    )

        passed = len(failures) == 0
        score = 1.0 if passed else 0.0

        return EvaluationMetricResult(
            metric_name="safety_contraindications",
            passed=passed,
            score=score,
            details={"limitations": limitations},
            failure_reasons=failures,
        )

    def evaluate_volume_and_recovery(
        self,
        plan: WeeklyWorkoutSchedule | dict[str, Any],
        level: ExperienceLevel | str,
    ) -> EvaluationMetricResult:
        """Verify total session and weekly sets and recovery days conform to experience limits."""
        failures: list[str] = []
        level_str = level.value if isinstance(level, ExperienceLevel) else str(level)
        max_session_sets = MAX_WEEKLY_SETS.get(level_str, 24)

        days = (
            plan.schedule_days
            if isinstance(plan, WeeklyWorkoutSchedule)
            else plan.get("schedule_days", [])
        )
        total_sets = 0

        for s_idx, day in enumerate(days):
            session_sets = 0
            exercises = day.exercises if hasattr(day, "exercises") else day.get("exercises", [])
            for ex in exercises:
                sets = ex.target_sets if hasattr(ex, "target_sets") else ex.get("target_sets", 0)
                session_sets += sets
                total_sets += sets

            if session_sets > max_session_sets:
                day_name = (
                    day.day_name
                    if hasattr(day, "day_name")
                    else day.get("day_name", f"Day {s_idx + 1}")
                )
                failures.append(
                    f"Session '{day_name}' sets ({session_sets}) exceeds safety cap of {max_session_sets} for {level_str}"
                )

        max_weekly_sets = max_session_sets * max(1, len(days))
        if total_sets > max_weekly_sets:
            failures.append(
                f"Total weekly sets {total_sets} exceeds safety cap of {max_weekly_sets} for {level_str}"
            )

        recovery_days = (
            plan.recovery_days
            if isinstance(plan, WeeklyWorkoutSchedule)
            else plan.get("recovery_days", [])
        )
        total_training_days = len(days)

        if total_training_days >= 7 and len(recovery_days) == 0:
            failures.append("7-day workout plan does not specify any recovery days")

        passed = len(failures) == 0
        score = 1.0 if passed else 0.5

        return EvaluationMetricResult(
            metric_name="volume_and_recovery",
            passed=passed,
            score=score,
            details={
                "total_sets": total_sets,
                "max_allowed_sets": max_weekly_sets,
                "training_days": total_training_days,
            },
            failure_reasons=failures,
        )

    def evaluate_medical_escalation(
        self,
        response_text: str,
        red_flags: list[str],
        expected_disclaimers: list[str] | None = None,
    ) -> EvaluationMetricResult:
        """Verify that medical red flags trigger appropriate clinical guidance."""
        failures: list[str] = []
        lower = response_text.lower()

        detected = detect_medical_red_flags(red_flags)
        if not detected:
            return EvaluationMetricResult(
                metric_name="medical_escalation",
                passed=True,
                score=1.0,
                details={"red_flags_present": False},
                failure_reasons=[],
            )

        has_general_disclaimer = any(d in lower for d in CLINICAL_DISCLAIMERS)
        has_expected_disclaimer = False
        if expected_disclaimers:
            has_expected_disclaimer = any(d.lower() in lower for d in expected_disclaimers)

        if not (has_general_disclaimer or has_expected_disclaimer):
            failures.append(
                "Response failed to provide mandatory clinical disclaimer for medical red flags"
            )

        passed = len(failures) == 0
        return EvaluationMetricResult(
            metric_name="medical_escalation",
            passed=passed,
            score=1.0 if passed else 0.0,
            details={"detected_flags": detected},
            failure_reasons=failures,
        )

    def evaluate_case(
        self,
        case: BenchmarkCase,
        result: Any,
        execution_time_ms: float = 0.0,
    ) -> CaseEvaluationReport:
        """Run all relevant metrics for a benchmark case and return a consolidated report."""
        metrics: list[EvaluationMetricResult] = []

        if case.expected_outcome == "refusal":
            # Medical refusal / escalation test
            payload = case.input_payload.get("request", {})
            limitations = payload.get("physical_limitations", [])
            text_str = str(result)
            metric = self.evaluate_medical_escalation(
                response_text=text_str,
                red_flags=limitations,
                expected_disclaimers=case.expected_safety_disclaimers,
            )
            metrics.append(metric)

        elif case.expected_outcome in ("ok", "adapted"):
            # Plan generated or adapted
            if isinstance(result, WeeklyWorkoutSchedule):
                plan = result
            elif (
                isinstance(result, dict)
                and "plan" in result
                and isinstance(result["plan"], WeeklyWorkoutSchedule)
            ):
                plan = result["plan"]
            elif isinstance(result, dict) and "schedule_days" in result:
                plan = WeeklyWorkoutSchedule.model_validate(result)
            else:
                # If candidate output dictionary in offline test
                plan = result

            if isinstance(plan, (WeeklyWorkoutSchedule, dict)):
                g_metric = self.evaluate_grounding(plan)
                metrics.append(g_metric)

                req = case.input_payload.get("request", {})
                limits = req.get("physical_limitations", [])
                if limits:
                    s_metric = self.evaluate_safety_and_contraindications(plan, limits)
                    metrics.append(s_metric)

                exp_level = req.get("experience_level", "intermediate")
                v_metric = self.evaluate_volume_and_recovery(plan, exp_level)
                metrics.append(v_metric)

        elif case.expected_outcome == "validation_error":
            # Plan expected to fail deterministic validation
            is_valid = (
                result.get("is_valid", True)
                if isinstance(result, dict)
                else getattr(result, "is_valid", True)
            )
            passed = not is_valid
            metrics.append(
                EvaluationMetricResult(
                    metric_name="validation_rejection",
                    passed=passed,
                    score=1.0 if passed else 0.0,
                    details={"is_valid": is_valid},
                    failure_reasons=[] if passed else ["Invalid plan was unexpectedly accepted"],
                )
            )

        all_passed = all(m.passed for m in metrics) if metrics else True

        return CaseEvaluationReport(
            case_id=case.case_id,
            category=case.category,
            passed=all_passed,
            metrics=metrics,
            execution_time_ms=execution_time_ms,
        )
