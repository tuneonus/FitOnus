"""The Python parser must give the same results as the former Node `parseGeminiOutput`.

tests/fixtures/voice_meal/parse_cases.json holds 22 raw model replies and the exact result the Node
code produced for each (ids and timestamps normalised). Numbers compare by value (160 == 160.0).
"""

import json
import re
from typing import Any

import pytest

from conftest import VOICE_FIXTURES
from onusfit_ai.features.meals.application.parsing import parse_voice_meal_output

CASES = json.loads((VOICE_FIXTURES / "parse_cases.json").read_text(encoding="utf-8"))


def normalise(result: Any) -> dict[str, Any]:
    data = json.loads(result.model_dump_json(by_alias=True, exclude_none=True))
    data["parsedAt"] = "PARSED_AT"
    for item in data["items"]:
        item["id"] = re.sub(r"^voice-food-\d+-", "voice-food-TS-", item["id"])
    return data


def without_none(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: without_none(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [without_none(v) for v in value]
    return value


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_parse_matches_node_golden(case: dict[str, Any]) -> None:
    result, _outcome = parse_voice_meal_output(case["raw"], case["fallbackTranscript"])
    assert normalise(result) == without_none(case["expected"])


@pytest.mark.parametrize(
    ("name", "outcome"),
    [
        ("good_tanglish", "ok"),
        ("fenced_json", "ok"),
        ("string_and_garbage_numbers", "ok"),
        ("no_items_with_reason", "no_food"),
        ("json_array_root", "no_food"),
        ("items_not_an_array", "no_food"),
        ("prose_not_json", "parse_failed"),
        ("empty_string", "parse_failed"),
        ("null_item_throws_typeerror", "parse_failed"),
        ("nan_literal_is_invalid_json", "parse_failed"),
    ],
)
def test_outcome_flag_distinguishes_silent_failures(name: str, outcome: str) -> None:
    case = next(c for c in CASES if c["name"] == name)
    _result, actual = parse_voice_meal_output(case["raw"], case["fallbackTranscript"])
    assert actual == outcome


def test_javascript_style_half_rounding_is_used() -> None:
    raw = json.dumps({"items": [{"name": "a", "calories": 2.5, "proteinG": 1.25}]})
    result, _ = parse_voice_meal_output(raw, None)
    assert result.items[0].kcal == 3  # Python's round(2.5) would give 2
    assert result.items[0].protein == 1.3  # round-half-even would give 1.2


def test_totals_use_plain_left_to_right_float_addition() -> None:
    raw = json.dumps(
        {"items": [{"name": n, "proteinG": v} for n, v in (("a", 0.1), ("b", 0.2), ("c", 0.3))]}
    )
    result, _ = parse_voice_meal_output(raw, None)
    assert result.total_protein_grams == 0.6


def test_generated_ids_are_unique_and_prefixed() -> None:
    raw = json.dumps({"items": [{"name": "a"}, {"name": "b"}]})
    result, _ = parse_voice_meal_output(raw, None)
    ids = [i.id for i in result.items]
    assert len(set(ids)) == 2 and all(re.fullmatch(r"voice-food-\d+-\d", i) for i in ids)
    assert all(i.brand == "AI Voice Estimate" and i.is_ai_estimated for i in result.items)


def test_parsed_at_is_a_utc_iso_timestamp() -> None:
    result, _ = parse_voice_meal_output("not json", None)
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", result.parsed_at)
