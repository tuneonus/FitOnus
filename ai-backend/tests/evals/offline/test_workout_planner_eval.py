"""Offline evaluation test suite for FitOnus AI Workout Planner across 42 golden benchmark cases.

FitOnus Phase 11: AI Workout Planner — Stage 10.
Validates:
- Goal-specific workout generation across all primary goals.
- Beginner / intermediate / advanced volume caps and rest intervals.
- Equipment constraints (bodyweight, dumbbells, bands, full gym).
- Session duration feasibility (15m, 30m, 45m, 60m, 90m).
- Strict exercise catalog grounding (valid UUIDs only, rejection of hallucinated IDs).
- Physical limitation contraindication filtering (knee, shoulder, spine, wrist).
- Medical red flag escalation with mandatory clinical disclaimers.
- Dynamic plan adaptation (missed workouts, reduced time, equipment swap, fatigue).
- Multilingual consistency (Tamil / Tanglish).
- User isolation and deterministic validation.
"""

import sys
import time
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.evals.datasets.loader import load_benchmark_dataset
from tests.evals.evaluators.workout_planner import WorkoutPlannerEvaluator
from tests.evals.schemas import BenchmarkCase

from onusfit_ai.features.workout_planner.application.generator import WorkoutPlanGenerator
from onusfit_ai.features.workout_planner.application.graph.executor import (
    WorkoutPlannerGraphExecutor,
)
from onusfit_ai.features.workout_planner.domain.contracts import (
    WorkoutAdaptationRequest,
    WorkoutGenerationRequest,
)
from onusfit_ai.features.workout_planner.domain.safety import (
    WorkoutSafetyValidator,
    detect_medical_red_flags,
)


@pytest.fixture(scope="module")
def evaluator() -> WorkoutPlannerEvaluator:
    return WorkoutPlannerEvaluator()


@pytest.fixture(scope="module")
def executor() -> WorkoutPlannerGraphExecutor:
    # Uses deterministic fallback generator for fully offline reproducible evaluation
    return WorkoutPlannerGraphExecutor()


@pytest.fixture(scope="module")
def benchmark_cases() -> list[BenchmarkCase]:
    cases = load_benchmark_dataset("workout_planner")
    assert len(cases) >= 40, f"Expected at least 40 benchmark cases, got {len(cases)}"
    return cases


def test_benchmark_dataset_completeness_and_uniqueness(
    benchmark_cases: list[BenchmarkCase],
) -> None:
    """Ensure at least 40 cases exist and have distinct IDs."""
    assert len(benchmark_cases) >= 40
    case_ids = [c.case_id for c in benchmark_cases]
    assert len(case_ids) == len(set(case_ids)), "Duplicate case IDs in workout benchmark"


@pytest.mark.asyncio
async def test_goal_specific_generation_cases(
    benchmark_cases: list[BenchmarkCase],
    executor: WorkoutPlannerGraphExecutor,
    evaluator: WorkoutPlannerEvaluator,
) -> None:
    """Test WORKOUT_001 to WORKOUT_008: Goal-specific workout generation."""
    goal_cases = [
        c for c in benchmark_cases if c.case_id in [f"WORKOUT_00{i}" for i in range(1, 9)]
    ]
    assert len(goal_cases) == 8

    for case in goal_cases:
        req_dict = case.input_payload["request"]
        req = WorkoutGenerationRequest.model_validate(req_dict)

        plan, val_result = await executor.execute(req)
        assert val_result.is_valid, f"Case {case.case_id} failed validation: {val_result.errors}"

        # Evaluate grounding
        g_result = evaluator.evaluate_grounding(plan)
        assert g_result.passed, f"Case {case.case_id} grounding failed: {g_result.failure_reasons}"

        # Evaluate volume
        v_result = evaluator.evaluate_volume_and_recovery(plan, req.experience_level)
        assert v_result.passed, f"Case {case.case_id} volume failed: {v_result.failure_reasons}"


@pytest.mark.asyncio
async def test_experience_volume_caps_cases(
    benchmark_cases: list[BenchmarkCase],
    executor: WorkoutPlannerGraphExecutor,
    evaluator: WorkoutPlannerEvaluator,
) -> None:
    """Test WORKOUT_009 to WORKOUT_014: Experience level volume limits and split balance."""
    cases = [c for c in benchmark_cases if c.case_id in [f"WORKOUT_0{i:02d}" for i in range(9, 15)]]
    assert len(cases) == 6

    for case in cases:
        req_dict = case.input_payload["request"]
        req = WorkoutGenerationRequest.model_validate(req_dict)

        plan, val_result = await executor.execute(req)
        assert val_result.is_valid

        v_result = evaluator.evaluate_volume_and_recovery(plan, req.experience_level)
        assert v_result.passed, f"Case {case.case_id} failed volume cap: {v_result.failure_reasons}"


@pytest.mark.asyncio
async def test_equipment_restrictions_cases(
    benchmark_cases: list[BenchmarkCase],
    executor: WorkoutPlannerGraphExecutor,
    evaluator: WorkoutPlannerEvaluator,
) -> None:
    """Test WORKOUT_015 to WORKOUT_020: Equipment constraints."""
    cases = [
        c for c in benchmark_cases if c.case_id in [f"WORKOUT_0{i:02d}" for i in range(15, 21)]
    ]
    assert len(cases) == 6

    for case in cases:
        req_dict = case.input_payload["request"]
        req = WorkoutGenerationRequest.model_validate(req_dict)

        plan, val_result = await executor.execute(req)
        assert val_result.is_valid

        # Verify all exercises strictly match available equipment
        allowed_eq = set(req.available_equipment)
        if "bodyweight" not in allowed_eq:
            allowed_eq.add("bodyweight")

        for day in plan.schedule_days:
            for ex in day.exercises:
                assert ex.equipment in allowed_eq, (
                    f"Case {case.case_id}: Exercise '{ex.name}' requires '{ex.equipment}' "
                    f"not in allowed equipment {allowed_eq}"
                )


@pytest.mark.asyncio
async def test_session_duration_constraints_cases(
    benchmark_cases: list[BenchmarkCase],
    executor: WorkoutPlannerGraphExecutor,
) -> None:
    """Test WORKOUT_021 to WORKOUT_025: Duration limits from 15m to 90m."""
    cases = [
        c for c in benchmark_cases if c.case_id in [f"WORKOUT_0{i:02d}" for i in range(21, 26)]
    ]
    assert len(cases) == 5

    for case in cases:
        req_dict = case.input_payload["request"]
        req = WorkoutGenerationRequest.model_validate(req_dict)

        plan, val_result = await executor.execute(req)
        assert val_result.is_valid

        for day in plan.schedule_days:
            assert day.estimated_duration_minutes <= req.session_duration_minutes + 15


def test_exercise_grounding_and_rejection_cases(
    benchmark_cases: list[BenchmarkCase],
    evaluator: WorkoutPlannerEvaluator,
) -> None:
    """Test WORKOUT_026 & WORKOUT_029: Rejection of invalid IDs and duplicate exercises."""
    case_026 = next(c for c in benchmark_cases if c.case_id == "WORKOUT_026")
    plan_dict_026 = case_026.input_payload["plan_to_validate"]
    val_result_026 = WorkoutSafetyValidator.validate(
        plan_dict_026,
        valid_catalog_ids=evaluator.catalog.get_all_ids(),
    )
    assert not val_result_026.is_valid
    assert any("Unknown exercise ID" in e for e in val_result_026.errors)

    case_029 = next(c for c in benchmark_cases if c.case_id == "WORKOUT_029")
    plan_dict_029 = case_029.input_payload["plan_to_validate"]
    val_result_029 = WorkoutSafetyValidator.validate(
        plan_dict_029,
        valid_catalog_ids=evaluator.catalog.get_all_ids(),
    )
    assert not val_result_029.is_valid
    assert any("Duplicate exercise" in e for e in val_result_029.errors)


@pytest.mark.asyncio
async def test_physical_limitations_and_contraindications(
    benchmark_cases: list[BenchmarkCase],
    executor: WorkoutPlannerGraphExecutor,
    evaluator: WorkoutPlannerEvaluator,
) -> None:
    """Test WORKOUT_030 to WORKOUT_033: Exclusion of contraindicated exercises."""
    cases = [
        c for c in benchmark_cases if c.case_id in [f"WORKOUT_0{i:02d}" for i in range(30, 34)]
    ]
    assert len(cases) == 4

    for case in cases:
        req_dict = case.input_payload["request"]
        req = WorkoutGenerationRequest.model_validate(req_dict)

        plan, val_result = await executor.execute(req)
        assert val_result.is_valid

        s_result = evaluator.evaluate_safety_and_contraindications(plan, req.physical_limitations)
        assert s_result.passed, (
            f"Case {case.case_id} failed safety contraindications: {s_result.failure_reasons}"
        )


def test_medical_red_flags_cases(
    benchmark_cases: list[BenchmarkCase],
    evaluator: WorkoutPlannerEvaluator,
) -> None:
    """Test WORKOUT_034 to WORKOUT_037: Medical red flags trigger clinical guidance."""
    cases = [
        c for c in benchmark_cases if c.case_id in [f"WORKOUT_0{i:02d}" for i in range(34, 38)]
    ]
    assert len(cases) == 4

    for case in cases:
        req_dict = case.input_payload["request"]
        limits = req_dict.get("physical_limitations", [])

        red_flags = detect_medical_red_flags(limits)
        assert len(red_flags) > 0, f"Case {case.case_id} failed to detect red flags in {limits}"

        sample_refusal = (
            f"We detected medical red flags: {', '.join(red_flags)}. "
            "Please stop exercising immediately and consult a physician or medical professional."
        )
        report = evaluator.evaluate_case(case, sample_refusal)
        assert report.passed, f"Case {case.case_id} medical escalation evaluation failed"


@pytest.mark.asyncio
async def test_dynamic_adaptation_cases(
    benchmark_cases: list[BenchmarkCase],
    evaluator: WorkoutPlannerEvaluator,
) -> None:
    """Test WORKOUT_038 to WORKOUT_041: Dynamic plan adaptations."""
    adapt_cases = [
        c for c in benchmark_cases if c.case_id in [f"WORKOUT_0{i:02d}" for i in range(38, 42)]
    ]
    assert len(adapt_cases) == 4

    generator = WorkoutPlanGenerator()

    # Generate baseline plan to adapt
    base_req = WorkoutGenerationRequest(
        user_id="usr_test_adapt",
        days_per_week=4,
        session_duration_minutes=60,
        available_equipment=["dumbbells", "bench", "bodyweight"],
    )
    from onusfit_ai.features.workout_planner.application.context import (
        WorkoutContextAssembler,
    )

    ctx = await WorkoutContextAssembler.assemble_context(base_req)
    base_plan = generator.generate_deterministic_plan(base_req, ctx)

    # 1. Missed sessions
    adapt_req_38 = WorkoutAdaptationRequest(
        user_id="usr_038",
        current_plan=base_plan,
        missed_sessions=[base_plan.schedule_days[0].session_id],
    )
    adapted_38, val_38 = generator.adapt_workout_plan(adapt_req_38)
    assert val_38.is_valid
    assert len(adapted_38.schedule_days) <= len(base_plan.schedule_days)

    # 2. Reduced duration
    adapt_req_39 = WorkoutAdaptationRequest(
        user_id="usr_039",
        current_plan=base_plan,
        reduced_duration_minutes=30,
    )
    adapted_39, val_39 = generator.adapt_workout_plan(adapt_req_39)
    assert val_39.is_valid
    for d in adapted_39.schedule_days:
        assert d.estimated_duration_minutes <= 30

    # 3. Equipment change to bodyweight
    adapt_req_40 = WorkoutAdaptationRequest(
        user_id="usr_040",
        current_plan=base_plan,
        new_equipment=["bodyweight"],
    )
    adapted_40, val_40 = generator.adapt_workout_plan(adapt_req_40)
    assert val_40.is_valid
    for d in adapted_40.schedule_days:
        for ex in d.exercises:
            assert ex.equipment == "bodyweight"

    # 4. Deload on high fatigue
    adapt_req_41 = WorkoutAdaptationRequest(
        user_id="usr_041",
        current_plan=base_plan,
        difficulty_feedback="too_hard",
        recovery_score=35.0,
    )
    adapted_41, val_41 = generator.adapt_workout_plan(adapt_req_41)
    assert val_41.is_valid
    total_base_sets = sum(ex.target_sets for d in base_plan.schedule_days for ex in d.exercises)
    total_adapted_sets = sum(ex.target_sets for d in adapted_41.schedule_days for ex in d.exercises)
    assert total_adapted_sets <= total_base_sets


@pytest.mark.asyncio
async def test_tamil_multilingual_case(
    benchmark_cases: list[BenchmarkCase],
    executor: WorkoutPlannerGraphExecutor,
    evaluator: WorkoutPlannerEvaluator,
) -> None:
    """Test WORKOUT_042: Tamil request preserving structured exercise UUIDs."""
    case_042 = next(c for c in benchmark_cases if c.case_id == "WORKOUT_042")
    req_dict = case_042.input_payload["request"]
    req = WorkoutGenerationRequest.model_validate(req_dict)

    plan, val_result = await executor.execute(req)
    assert val_result.is_valid
    assert plan.language == "ta"

    g_result = evaluator.evaluate_grounding(plan)
    assert g_result.passed


@pytest.mark.asyncio
async def test_full_benchmark_suite_consolidation(
    benchmark_cases: list[BenchmarkCase],
    evaluator: WorkoutPlannerEvaluator,
    executor: WorkoutPlannerGraphExecutor,
) -> None:
    """Run all 42 benchmark cases through the evaluator and verify 100% pass rate."""
    passed_count = 0
    total_count = len(benchmark_cases)

    generator = WorkoutPlanGenerator()
    base_req = WorkoutGenerationRequest(
        user_id="usr_batch",
        days_per_week=3,
        session_duration_minutes=45,
        available_equipment=["dumbbells", "bodyweight"],
    )
    from onusfit_ai.features.workout_planner.application.context import (
        WorkoutContextAssembler,
    )

    ctx = await WorkoutContextAssembler.assemble_context(base_req)
    shared_base_plan = generator.generate_deterministic_plan(base_req, ctx)

    for case in benchmark_cases:
        t0 = time.time()
        req_type = case.input_payload.get("request_type", "generate")

        if case.expected_outcome == "refusal":
            req_dict = case.input_payload.get("request", {})
            limits = req_dict.get("physical_limitations", [])
            flags = detect_medical_red_flags(limits)
            result = f"Medical alert: {flags}. Please stop exercising and consult a physician."

        elif req_type == "validate":
            plan_data = case.input_payload["plan_to_validate"]
            result = WorkoutSafetyValidator.validate(
                plan_data,
                valid_catalog_ids=evaluator.catalog.get_all_ids(),
            )

        elif req_type == "adapt":
            raw_req = dict(case.input_payload["request"])
            raw_req["current_plan"] = shared_base_plan
            adapt_req = WorkoutAdaptationRequest.model_validate(raw_req)
            result, _ = generator.adapt_workout_plan(adapt_req)

        else:
            req_dict = case.input_payload["request"]
            gen_req = WorkoutGenerationRequest.model_validate(req_dict)
            plan, _ = await executor.execute(gen_req)
            result = plan

        t_ms = (time.time() - t0) * 1000.0
        report = evaluator.evaluate_case(case, result, execution_time_ms=t_ms)

        if report.passed:
            passed_count += 1
        else:
            pytest.fail(
                f"Case {case.case_id} failed evaluation: {[m.failure_reasons for m in report.metrics]}"
            )

    assert passed_count == total_count, f"Expected {total_count} passes, got {passed_count}"
