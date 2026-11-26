"""Offline regression and safety evaluation suite for Phase 08 Context Engineering."""

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.evals.datasets.loader import load_benchmark_dataset
from tests.evals.evaluators.context import ContextEngineeringEvaluator


def test_context_benchmark_dataset_loads_and_has_30_cases() -> None:
    cases = load_benchmark_dataset("context")
    assert len(cases) >= 30, f"Expected 30 context engineering cases, got {len(cases)}"


def test_context_engineering_evaluator_evaluates_all_benchmark_cases() -> None:
    cases = load_benchmark_dataset("context")
    evaluator = ContextEngineeringEvaluator()

    for case in cases:
        assert case.offline_candidate is not None, f"Case {case.case_id} lacks offline_candidate"
        cand = case.offline_candidate

        result = evaluator.evaluate(
            candidate=cand,
            expected_intent=cand.get("intent"),
            should_retrieve_rag=cand.get("should_retrieve_rag"),
            expected_boost=cand.get("category_boost"),
            max_token_ceiling=4000,
            expected_outcome=case.expected_outcome,
        )

        assert result.passed, f"Case {case.case_id} failed context eval: {result.failure_reasons}"
        assert result.score >= 0.75, f"Case {case.case_id} score too low: {result.score}"


def test_intent_routing_skips_rag_for_greetings() -> None:
    cases = load_benchmark_dataset("context")
    greeting_cases = [
        c for c in cases if c.offline_candidate and c.offline_candidate.get("intent") == "greeting"
    ]

    assert len(greeting_cases) >= 3, "Expected at least 3 greeting cases across En, Ta, Tanglish"
    for case in greeting_cases:
        assert case.offline_candidate is not None
        assert case.offline_candidate.get("should_retrieve_rag") is False, (
            f"Case {case.case_id} must have should_retrieve_rag=False"
        )


def test_multilingual_tamil_tanglish_elevates_injuries() -> None:
    cases = load_benchmark_dataset("context")
    multilingual_pain = [
        c
        for c in cases
        if c.language in ("ta", "tanglish")
        and c.offline_candidate
        and c.offline_candidate.get("category_boost") == "injuries"
    ]

    assert len(multilingual_pain) >= 2, "Expected at least 2 Tamil/Tanglish pain cases"
    for case in multilingual_pain:
        assert case.offline_candidate is not None
        assert case.offline_candidate.get("should_retrieve_rag") is True
        assert case.offline_candidate.get("category_boost") == "injuries"


def test_prompt_injection_containment_in_eval_dataset() -> None:
    cases = load_benchmark_dataset("context")
    evaluator = ContextEngineeringEvaluator()
    injection_cases = [c for c in cases if "inject" in c.case_id.lower()]

    assert len(injection_cases) >= 4, "Expected at least 4 adversarial injection cases"
    for case in injection_cases:
        assert case.offline_candidate is not None
        res = evaluator.evaluate(candidate=case.offline_candidate)
        assert res.passed, f"Injection containment failed for {case.case_id}: {res.failure_reasons}"


def test_token_budget_ceiling_compliance() -> None:
    cases = load_benchmark_dataset("context")
    for case in cases:
        assert case.offline_candidate is not None
        tokens = case.offline_candidate.get("total_tokens", 0)
        assert tokens <= 4000, f"Case {case.case_id} exceeded token ceiling: {tokens} > 4000"
