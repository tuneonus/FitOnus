"""Offline Phase 15 multimodal benchmark suite (>= 40 reproducible offline cases)."""

import json
import sys
from pathlib import Path
from typing import Any

import pytest

_TESTS_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_TESTS_ROOT) not in sys.path:
    sys.path.insert(0, str(_TESTS_ROOT))

from tests.evals.evaluators.multimodal import execute_multimodal_offline_case

DATASET_PATH = Path(__file__).resolve().parent.parent / "datasets" / "multimodal_benchmark.json"


def _load_cases() -> list[dict[str, Any]]:
    return json.loads(DATASET_PATH.read_text(encoding="utf-8"))


def test_multimodal_benchmark_has_at_least_forty_cases() -> None:
    cases = _load_cases()
    assert len(cases) >= 40
    ids = [c["case_id"] for c in cases]
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("case", _load_cases(), ids=lambda c: c["case_id"])
async def test_multimodal_offline_benchmark_case(case: dict[str, Any]) -> None:
    eval_res = await execute_multimodal_offline_case(case)
    assert eval_res.passed, f"{case['case_id']} failed: {eval_res.failure_reasons}"
