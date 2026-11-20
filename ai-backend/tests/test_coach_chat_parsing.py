import pytest

from onusfit_ai.features.coach.application.parsing import parse_coach_output
from onusfit_ai.shared.utils.js_compat import strip_code_fences

GOOD = '{"text":"Eat more protein","followUps":["Why?"],"sources":["Profile"],"medicalNote":true}'


def test_parses_plain_json() -> None:
    result, outcome = parse_coach_output(GOOD, has_memories=False)
    assert outcome == "ok"
    assert result.text == "Eat more protein"
    assert result.follow_ups == ["Why?"]
    assert result.sources == ["Profile"]
    assert result.medical_note is True


@pytest.mark.parametrize("fence", ["```json\n{}\n```", "```\n{}\n```"])
def test_strips_code_fences(fence: str) -> None:
    assert strip_code_fences(fence) == "{}"
    wrapped = fence.replace("{}", GOOD)
    result, outcome = parse_coach_output(wrapped, has_memories=False)
    assert outcome == "ok"
    assert result.text == "Eat more protein"


def test_prose_falls_back_to_raw_text() -> None:
    result, outcome = parse_coach_output("Just drink water.", has_memories=False)
    assert outcome == "unstructured"
    assert result.text == "Just drink water."
    assert result.sources == ["OnusFit Coach Engine"]
    assert result.medical_note is None


def test_json_without_text_field_falls_back() -> None:
    result, outcome = parse_coach_output('{"answer":"x"}', has_memories=False)
    assert outcome == "unstructured"
    assert result.text == '{"answer":"x"}'


def test_memory_source_added_when_memories_were_supplied() -> None:
    result, _ = parse_coach_output(GOOD, has_memories=True)
    assert result.sources == ["Profile", "AI Memory"]
    again, _ = parse_coach_output('{"text":"x","sources":["AI Memory"]}', has_memories=True)
    assert again.sources == ["AI Memory"]  # not duplicated


def test_bad_field_types_are_coerced_like_node() -> None:
    result, _ = parse_coach_output(
        '{"text":"x","followUps":[1,true,null],"sources":"nope"}', has_memories=False
    )
    assert result.follow_ups == ["1", "true", "null"]
    assert result.sources == []
