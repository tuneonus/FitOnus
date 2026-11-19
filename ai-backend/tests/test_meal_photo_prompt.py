"""The meal photo prompt must equal the one the former Node implementation sent."""

import json
from typing import Any

import pytest

from conftest import MEAL_PHOTO_FIXTURES
from onusfit_ai.prompts.meal_photo import build_prompt

CASES = json.loads((MEAL_PHOTO_FIXTURES / "prompt_cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_prompt_matches_node_golden(case: dict[str, Any]) -> None:
    given = case["input"]
    assert build_prompt(given["mealType"], given["notes"]) == case["prompt"]


def test_prompt_asks_for_the_json_shape_the_parser_expects() -> None:
    prompt = build_prompt(None, None)
    for key in ("isFood", "summary", "portionDescription", "proteinG", "fiberG", "unclearReason"):
        assert f'"{key}"' in prompt


def test_user_context_appears_only_when_given() -> None:
    assert "ADDITIONAL CONTEXT" not in build_prompt(None, None)
    assert "ADDITIONAL CONTEXT: Assumed meal type: lunch\n" in build_prompt("lunch", None)
