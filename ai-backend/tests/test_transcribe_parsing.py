"""The Python parser must give the same results as the former Node `transcribeAudio` parsing.

tests/fixtures/transcribe/parse_cases.json holds 21 raw model replies and the exact result the Node
code produced for each.
"""

import json
from typing import Any

import pytest

from conftest import TRANSCRIBE_FIXTURES
from onusfit_ai.features.speech.application.parsing import parse_transcription

CASES = json.loads((TRANSCRIBE_FIXTURES / "parse_cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_parse_matches_node_golden(case: dict[str, Any]) -> None:
    result, _outcome = parse_transcription(case["raw"])
    assert result.model_dump(by_alias=True) == case["expected"]


@pytest.mark.parametrize(
    ("name", "outcome"),
    [
        ("plain_json_english", "ok"),
        ("fenced_json", "ok"),
        ("empty_object", "ok"),
        ("json_array_root", "ok"),
        ("prose_not_json", "unstructured"),
        ("empty_string", "unstructured"),
        ("json_null_root", "unstructured"),
        ("nan_literal", "unstructured"),
        ("truncated_json", "unstructured"),
    ],
)
def test_outcome_flag_makes_the_silent_fallback_visible(name: str, outcome: str) -> None:
    case = next(c for c in CASES if c["name"] == name)
    assert parse_transcription(case["raw"])[1] == outcome
