"""Dataset loader and schema validation utility for OnusFit AI benchmark benchmarks."""

import json
import sys
from pathlib import Path

_EVALS_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_EVALS_ROOT) not in sys.path:
    sys.path.insert(0, str(_EVALS_ROOT))

from tests.evals.schemas import BenchmarkCase

DATASETS_DIR = Path(__file__).resolve().parent

DATASET_FILES: dict[str, str] = {
    "coach_chat": "coach_chat_benchmark.json",
    "coach_insights": "coach_insights_benchmark.json",
    "nutrition": "nutrition_benchmark.json",
    "speech": "multilingual_speech_benchmark.json",
    "tools": "function_calling_benchmark.json",
    "safety": "safety_benchmark.json",
}


def load_benchmark_dataset(dataset_key: str) -> list[BenchmarkCase]:
    """Load and validate all benchmark cases from a specific dataset file."""
    if dataset_key not in DATASET_FILES:
        raise ValueError(f"Unknown dataset key '{dataset_key}'. Available: {list(DATASET_FILES)}")

    file_path = DATASETS_DIR / DATASET_FILES[dataset_key]
    with open(file_path, encoding="utf-8") as f:
        raw_list = json.load(f)

    return [BenchmarkCase.model_validate(item) for item in raw_list]


def load_all_benchmark_cases() -> list[BenchmarkCase]:
    """Load all benchmark cases across all 6 benchmark datasets."""
    all_cases: list[BenchmarkCase] = []
    for key in DATASET_FILES:
        all_cases.extend(load_benchmark_dataset(key))
    return all_cases
