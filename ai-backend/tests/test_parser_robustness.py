"""Hostile or degenerate model output never escapes a parser as an exception (audit L2).

A model that answers `[[[[[...` (or valid JSON nested hundreds of levels deep) used to raise
RecursionError. That surfaced as an HTTP 500 after Gemini had already been billed, and Node counts a
500 as "dispatched", so the member's quota unit was lost. Every parser must instead return an outcome.
"""

from collections.abc import Callable
from typing import Any

import pytest

from onusfit_ai.features.coach.application.insights_parsing import parse_insights_output
from onusfit_ai.features.coach.application.parsing import parse_coach_output
from onusfit_ai.features.meals.application.parsing import parse_voice_meal_output
from onusfit_ai.features.meals.application.photo_parsing import parse_meal_photo_output
from onusfit_ai.features.speech.application.parsing import parse_transcription
from onusfit_ai.shared.utils.js_compat import js_number, js_string, strict_json_loads

PARSERS: dict[str, Callable[[str], Any]] = {
    "coach": lambda raw: parse_coach_output(raw, has_memories=False),
    "insights": lambda raw: parse_insights_output(raw, "Sam"),
    "voice": lambda raw: parse_voice_meal_output(raw, None),
    "photo": parse_meal_photo_output,
    "speech": parse_transcription,
}


def nested(depth: int) -> str:
    return "[" * depth + "]" * depth


# (how the field is reached, which parsers read it)
DEEP_VALUE_PAYLOADS = {
    "coach": '{"text":"x","followUps":[' + nested(900) + "]}",
    "insights": '{"insights":[{"title":' + nested(900) + "}]}",
    "voice": '{"items":[{"name":' + nested(900) + "}]}",
    "photo": '{"isFood":true,"items":[{"name":' + nested(900) + "}]}",
    "speech": '{"transcript":' + nested(900) + "}",
}


@pytest.mark.parametrize("name", PARSERS)
def test_unterminated_deep_brackets_are_an_ordinary_unusable_reply(name: str) -> None:
    result, outcome = PARSERS[name]("[" * 100_000)
    assert outcome in {"unstructured", "unusable", "parse_failed"}


@pytest.mark.parametrize("name", PARSERS)
def test_valid_json_with_a_very_deeply_nested_value_does_not_crash(name: str) -> None:
    PARSERS[name](DEEP_VALUE_PAYLOADS[name])  # must simply return; the outcome does not matter here


def test_strict_json_loads_reports_runaway_nesting_as_invalid_json() -> None:
    with pytest.raises(ValueError, match="nested too deeply"):
        strict_json_loads("[" * 100_000)


def test_ordinary_nesting_still_behaves_like_javascript() -> None:
    # The depth guard must not change anything real output can contain.
    assert js_string([1, [2, [3, None]], "x"]) == "1,2,3,,x"
    assert js_number([[["7"]]]) == 7.0
