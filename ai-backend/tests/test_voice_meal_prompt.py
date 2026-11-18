"""The voice meal prompt must equal what the former Node implementation produced."""

import json

import pytest

from conftest import VOICE_FIXTURES
from onusfit_ai.prompts.voice_meal import build_prompt

CASES = json.loads((VOICE_FIXTURES / "prompt_cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_prompt_matches_node_golden(case: dict) -> None:  # type: ignore[type-arg]
    given = case["input"]
    actual = build_prompt(given["transcript"], given["lang"], given["mealType"])
    assert actual == case["prompt"]


def test_fixture_covers_the_interesting_branches() -> None:
    names = {c["name"] for c in CASES}
    assert {"text_full", "text_minimal", "audio_hints_only", "empty_strings_are_ignored"} <= names
