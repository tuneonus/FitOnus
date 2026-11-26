"""Offline regression and safety evaluation suite for Phase 07 AI Memory Systems."""

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.evals.datasets.loader import load_benchmark_dataset
from tests.evals.evaluators.memory import MemoryExtractionEvaluator


def test_memory_benchmark_dataset_loads_and_has_required_cases() -> None:
    cases = load_benchmark_dataset("memory")
    assert len(cases) >= 25, f"Expected at least 25 memory benchmark cases, got {len(cases)}"


def test_memory_evaluator_evaluates_all_benchmark_cases() -> None:
    cases = load_benchmark_dataset("memory")
    evaluator = MemoryExtractionEvaluator()

    for case in cases:
        assert case.offline_candidate is not None, f"Case {case.case_id} lacks offline_candidate"
        raw_candidates = case.offline_candidate.get("candidates", [])

        result = evaluator.evaluate(
            candidates_raw=raw_candidates,
            expected_outcome=case.expected_outcome,
            category_hint=case.category,
        )

        assert result.passed, f"Case {case.case_id} failed memory eval: {result.failure_reasons}"
        assert result.score >= 0.70, f"Case {case.case_id} score too low: {result.score}"


def test_sensitive_injuries_and_medical_are_strictly_sensitive() -> None:
    cases = load_benchmark_dataset("memory")
    sensitive_count = 0

    for case in cases:
        if case.offline_candidate:
            for c in case.offline_candidate.get("candidates", []):
                if c.get("category") in ("injuries", "medical"):
                    assert c.get("sensitive") is True, (
                        f"Case {case.case_id} category {c.get('category')} must be sensitive=True"
                    )
                    sensitive_count += 1

    assert sensitive_count >= 5, (
        f"Expected at least 5 sensitive health/injury cases, got {sensitive_count}"
    )


def test_adversarial_prompt_injections_yield_zero_candidates() -> None:
    cases = load_benchmark_dataset("memory")
    injection_cases = [c for c in cases if "injection" in c.description.lower()]

    assert len(injection_cases) >= 3, (
        f"Expected at least 3 prompt injection cases, got {len(injection_cases)}"
    )

    for case in injection_cases:
        candidates = (case.offline_candidate or {}).get("candidates", [])
        # For pure injection cases (MEM_010, MEM_011, MEM_023), candidates must be 0
        if case.case_id in ("MEM_010", "MEM_011", "MEM_023"):
            assert len(candidates) == 0, (
                f"Adversarial case {case.case_id} should have 0 candidates, got {len(candidates)}"
            )


def test_multilingual_coverage_tamil_and_tanglish() -> None:
    cases = load_benchmark_dataset("memory")
    tamil_cases = [c for c in cases if c.language == "ta"]
    tanglish_cases = [c for c in cases if c.language == "tanglish"]

    assert len(tamil_cases) >= 3, f"Expected >= 3 Tamil cases, got {len(tamil_cases)}"
    assert len(tanglish_cases) >= 4, f"Expected >= 4 Tanglish cases, got {len(tanglish_cases)}"

    # Check non-empty valid extractions for normal preferences
    for case in tamil_cases:
        if case.expected_outcome == "ok":
            candidates = (case.offline_candidate or {}).get("candidates", [])
            assert len(candidates) > 0, f"Tamil case {case.case_id} should have extracted candidate"

    for case in tanglish_cases:
        if case.expected_outcome == "ok":
            candidates = (case.offline_candidate or {}).get("candidates", [])
            assert len(candidates) > 0, (
                f"Tanglish case {case.case_id} should have extracted candidate"
            )
