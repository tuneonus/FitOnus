"""The Python parser must give the same results as the former Node `parseGeminiOutput`.

tests/fixtures/meal_photo/parse_cases.json holds 48 raw model replies and the exact result the Node
code produced for each (ids and timestamps normalised). Numbers compare by value (160 == 160.0).
"""

import json
import re
from typing import Any

import pytest

from conftest import MEAL_PHOTO_FIXTURES
from onusfit_ai.meals.photo_parsing import parse_meal_photo_output

CASES = json.loads((MEAL_PHOTO_FIXTURES / "parse_cases.json").read_text(encoding="utf-8"))


def normalise(result: Any) -> dict[str, Any]:
    data = json.loads(result.model_dump_json(by_alias=True, exclude_none=True))
    data["analyzedAt"] = "ANALYZED_AT"
    for item in data["items"]:
        item["id"] = re.sub(r"^ai-food-\d+-", "ai-food-TS-", item["id"])
    return data


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_parse_matches_node_golden(case: dict[str, Any]) -> None:
    result, _outcome = parse_meal_photo_output(case["raw"])
    assert normalise(result) == case["expected"]


@pytest.mark.parametrize(
    ("name", "outcome"),
    [
        ("good_two_items", "ok"),
        ("fenced_json", "ok"),
        ("isfood_string_false_is_food", "ok"),
        ("item_missing_everything", "ok"),
        ("no_food_standard", "no_food"),
        ("isfood_false_with_items", "no_food"),
        ("empty_items_with_isfood_true", "no_food"),
        ("json_array_root", "no_food"),
        ("empty_object", "no_food"),
        ("prose_not_json", "parse_failed"),
        ("empty_string", "parse_failed"),
        ("json_null_root_throws", "parse_failed"),
        ("item_null_throws_typeerror", "parse_failed"),
        ("nan_literal", "parse_failed"),
        ("truncated_json", "parse_failed"),
    ],
)
def test_outcome_flag_distinguishes_silent_failures(name: str, outcome: str) -> None:
    case = next(c for c in CASES if c["name"] == name)
    assert parse_meal_photo_output(case["raw"])[1] == outcome


def test_malformed_reply_yields_the_exact_not_formatted_result_the_app_always_got() -> None:
    result, outcome = parse_meal_photo_output("I think this is rice.")
    assert outcome == "parse_failed"
    assert result.model_dump(by_alias=True, exclude={"analyzed_at"}) == {
        "isFood": False,
        "summary": "Unable to parse food analysis",
        "items": [],
        "overallConfidence": 0,
        "totalKcal": 0,
        "totalProteinGrams": 0,
        "totalCarbsGrams": 0,
        "totalFatGrams": 0,
        "totalFiberGrams": 0,
        "unclearReason": "AI response was not formatted correctly. Please try again.",
    }


def test_infinite_numbers_are_a_parse_failure_not_an_infinite_total() -> None:
    # Node serialised Infinity as `null` on the wire; Python reports the reply as unusable instead.
    raw = '{"isFood":true,"items":[{"name":"inf","calories":1e999}]}'
    assert parse_meal_photo_output(raw)[1] == "parse_failed"
