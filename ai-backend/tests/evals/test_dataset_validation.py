"""Pytest suite validating that all Golden Benchmark Datasets strictly adhere to schema."""

import sys
from pathlib import Path

import pytest

_TESTS_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_TESTS_ROOT) not in sys.path:
    sys.path.insert(0, str(_TESTS_ROOT))

from tests.evals.datasets.loader import (
    DATASET_FILES,
    load_all_benchmark_cases,
    load_benchmark_dataset,
)


def test_all_datasets_exist_and_validate_schema() -> None:
    cases = load_all_benchmark_cases()
    assert len(cases) >= 60, f"Expected at least 60 curated cases, got {len(cases)}"


def test_unique_case_ids() -> None:
    cases = load_all_benchmark_cases()
    ids = [c.case_id for c in cases]
    duplicates = [cid for cid in ids if ids.count(cid) > 1]
    assert len(duplicates) == 0, f"Duplicate case IDs found: {set(duplicates)}"


@pytest.mark.parametrize("key", list(DATASET_FILES.keys()))
def test_individual_datasets(key: str) -> None:
    cases = load_benchmark_dataset(key)
    assert len(cases) > 0, f"Dataset {key} is empty"
    for c in cases:
        assert c.case_id.strip() != ""
        assert c.description.strip() != ""
        assert c.ground_truth_source.strip() != ""


def test_nutrition_dataset_has_verified_sources_and_tolerances() -> None:
    nutrition_cases = load_benchmark_dataset("nutrition")
    verified_count = sum(1 for c in nutrition_cases if c.is_verified_ground_truth)
    assert verified_count >= 10, (
        f"Expected at least 10 verified IFCT/USDA cases, got {verified_count}"
    )

    for c in nutrition_cases:
        if c.expected_outcome == "ok":
            assert len(c.expected_nutrition) > 0
            for item in c.expected_nutrition:
                assert item.calories >= 0
                assert 0.0 < item.calorie_tolerance_pct <= 0.50
                assert 0.0 < item.macro_tolerance_pct <= 0.50
                assert 0.0 < item.weight_tolerance_pct <= 0.50


def test_multilingual_dataset_dialect_coverage() -> None:
    speech_cases = load_benchmark_dataset("speech")
    languages = {c.language for c in speech_cases}
    assert "ta" in languages
    assert "tanglish" in languages
    assert "en" in languages
