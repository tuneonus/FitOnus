"""Unit tests for the Stage 04 Evaluation Runner, Live Benchmarking, and Reporting."""

import asyncio
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

_TESTS_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_TESTS_ROOT) not in sys.path:
    sys.path.insert(0, str(_TESTS_ROOT))

_SRC_ROOT = _TESTS_ROOT / "src"
if str(_SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(_SRC_ROOT))

from tests.conftest import FakeLlm
from tests.evals.datasets.loader import load_benchmark_dataset
from tests.evals.reporter import generate_json_report, generate_markdown_report
from tests.evals.runner import main, run_live_evaluation, run_offline_evaluation


def test_offline_evaluation_execution() -> None:
    results = run_offline_evaluation()
    assert len(results) == 277, f"Expected exactly 277 benchmark results, got {len(results)}"
    failures = [r for r in results if not r["passed"]]
    assert len(failures) == 0, f"Offline evaluation failures: {failures}"


def test_report_generation_offline(tmp_path: Path) -> None:
    results = run_offline_evaluation("tools")
    json_path = tmp_path / "report.json"
    md_path = tmp_path / "report.md"

    json_data = generate_json_report(
        eval_mode="offline", case_results=results, output_path=json_path
    )
    assert json_data["mode"] == "offline"
    assert json_data["is_live_evaluation"] is False
    assert json_data["live_baseline_status"] == "NOT MEASURED"
    assert json_path.exists()

    md_content = generate_markdown_report(json_data, output_path=md_path)
    assert "LIVE BASELINE: NOT MEASURED" in md_content
    assert "# OnusFit AI Evaluation & Benchmark Report" in md_content
    assert md_path.exists()


def test_filtered_dataset_evaluation() -> None:
    nutrition_results = run_offline_evaluation("nutrition")
    assert len(nutrition_results) == 16
    assert all(r["category"] in ("meal_photo", "voice_meal") for r in nutrition_results)


def test_offline_evaluation_negative_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify that an invalid candidate payload causes offline evaluation to fail and record reasons."""
    cases = load_benchmark_dataset("nutrition")
    assert len(cases) > 0
    test_case = cases[0].model_copy(deep=True)

    # Invalidate nutrition values far outside physiological tolerance bands (+500% calories)
    test_case.offline_candidate = {
        "isFood": True,
        "summary": "Corrupted high-calorie test meal",
        "confidence": 0.95,
        "items": [
            {
                "name": test_case.expected_nutrition[0].name,
                "calories": test_case.expected_nutrition[0].calories * 10,  # 10x target
                "proteinG": 0.0,
                "carbsG": 0.0,
                "fatG": 0.0,
                "servingWeightG": 50.0,
            }
        ],
    }

    with patch("tests.evals.runner.load_all_benchmark_cases", return_value=[test_case]):
        results = run_offline_evaluation()
        assert len(results) == 1
        assert results[0]["passed"] is False
        assert len(results[0]["failure_reasons"]) > 0
        assert any("outside" in reason for reason in results[0]["failure_reasons"])


def test_runner_main_nonzero_exit_code_on_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify CLI quality gate returns exit code 1 if any evaluation case fails."""
    failing_results = [
        {
            "case_id": "TEST_FAIL_001",
            "category": "coach_chat",
            "language": "en",
            "is_verified_ground_truth": False,
            "passed": False,
            "score": 0.0,
            "failure_reasons": ["Intentional test failure for quality gate check"],
            "duration_ms": 1.2,
        }
    ]

    with patch("tests.evals.runner.run_offline_evaluation", return_value=failing_results):
        monkeypatch.setattr(
            sys,
            "argv",
            ["runner.py", "--output-json", "/tmp/t.json", "--output-md", "/tmp/t.md"],
        )
        exit_code = main()
        assert exit_code == 1, "Expected exit code 1 when evaluation has failing cases"


def test_live_evaluation_with_mock_llm(tmp_path: Path) -> None:
    """Verify live evaluation flow with a mock LLM (0 real API calls)."""
    mock_llm = FakeLlm(
        text='{"text":"Great workout! Consult a doctor if chest pain persists.","followUps":["Rest"],"sources":["Profile"],"medicalNote":true}',
        parsed={
            "text": "Great workout! Consult a doctor if chest pain persists.",
            "followUps": ["Rest"],
            "sources": ["Profile"],
            "medicalNote": True,
        },
    )

    results = asyncio.run(run_live_evaluation(dataset_key="coach_chat", trials=1, llm=mock_llm))
    assert len(results) == 12
    # Verify latency and token usage are populated
    for r in results:
        assert "duration_ms" in r
        assert "token_usage" in r
        assert r["model"] == "gemini-2.5-flash"
        assert r["is_fallback"] is False

    json_path = tmp_path / "live_report.json"
    md_path = tmp_path / "live_report.md"
    report = generate_json_report(eval_mode="live", case_results=results, output_path=json_path)

    assert report["is_live_evaluation"] is True
    assert report["live_baseline_status"] == "MEASURED"
    assert report["summary"]["total_cases"] == 12

    md_content = generate_markdown_report(report, output_path=md_path)
    assert "Live Model Benchmark" in md_content
    assert "**`MEASURED`**" in md_content


def test_live_evaluation_missing_credentials_safely_skips(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Verify live evaluation safely aborts and returns empty list when GEMINI_API_KEY is not set."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    results = asyncio.run(run_live_evaluation(llm=None))
    assert results == []
    captured = capsys.readouterr()
    assert "LIVE BASELINE: NOT MEASURED" in captured.out
