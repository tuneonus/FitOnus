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
    "memory": "memory_benchmark.json",
    "context": "context_engineering_benchmark.json",
    "agent": "agent_fundamentals_benchmark.json",
    "workout_planner": "workout_planner_benchmark.json",
    "mcp_tools": "mcp_tools_benchmark.json",
    "multi_agent": "multi_agent_benchmark.json",
    "multimodal": "multimodal_benchmark.json",
    "rag_evaluation": "rag_evaluation_benchmark.json",
    "agent_advanced": "agent_advanced_benchmark.json",
    "multimodal_advanced": "multimodal_advanced_benchmark.json",
    "security_adversarial": "security_adversarial_benchmark.json",
    "performance_eval": "performance_benchmark.json",
    "streaming": "streaming_benchmark.json",
}


def load_benchmark_dataset(dataset_key: str) -> list[BenchmarkCase]:
    """Load and validate all benchmark cases from a specific dataset file."""
    if dataset_key not in DATASET_FILES:
        raise ValueError(f"Unknown dataset key '{dataset_key}'. Available: {list(DATASET_FILES)}")

    file_path = DATASETS_DIR / DATASET_FILES[dataset_key]
    with open(file_path, encoding="utf-8") as f:
        raw_list = json.load(f)

    if dataset_key == "multimodal":
        cases: list[BenchmarkCase] = []
        for item in raw_list:
            expected = item.get("expected", {})
            raw_lang = expected.get("language", item.get("input", {}).get("lang", "en"))
            lang = raw_lang if raw_lang in ("en", "ta", "tanglish", "mixed") else "en"
            outcome = expected.get("outcome") or expected.get("raises") or "ok"
            cases.append(
                BenchmarkCase(
                    case_id=item["case_id"],
                    category="multimodal",
                    description=item["description"],
                    language=lang,
                    input_payload=item,
                    expected_outcome=str(outcome),
                    ground_truth_source="IFCT 2017 / USDA / Multimodal Security Suite",
                    is_verified_ground_truth=bool(expected.get("nutrition_targets")),
                    offline_candidate=item.get("mock_llm") or {"outcome": str(outcome)},
                )
            )
        return cases

    return [BenchmarkCase.model_validate(item) for item in raw_list]


def load_all_benchmark_cases() -> list[BenchmarkCase]:
    """Load all benchmark cases across all benchmark datasets."""
    all_cases: list[BenchmarkCase] = []
    for key in DATASET_FILES:
        all_cases.extend(load_benchmark_dataset(key))
    return all_cases
