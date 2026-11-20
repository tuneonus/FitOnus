"""The insights prompt must equal the one the former Node implementation sent, for every context."""

import json
from typing import Any

import pytest

from conftest import INSIGHTS_FIXTURES
from onusfit_ai.features.coach.application.prompts.coach_insights import build_prompt
from onusfit_ai.features.coach.domain.chat import UserFitnessContext

CASES = json.loads((INSIGHTS_FIXTURES / "prompt_cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_prompt_matches_node_golden(case: dict[str, Any]) -> None:
    context = UserFitnessContext.model_validate(case["context"])
    assert build_prompt(context, case["lang"]) == case["prompt"]


def test_language_instruction_follows_lang() -> None:
    context = UserFitnessContext.model_validate(CASES[0]["context"])
    assert "Respond STRICTLY in Tamil" in build_prompt(context, "ta")
    assert "Respond STRICTLY in Tanglish" in build_prompt(context, "tanglish")
    for lang in ("en", None, "fr", "TA"):  # anything else is English, like Node
        assert "Respond in clean, encouraging English." in build_prompt(context, lang)


def test_real_user_values_reach_the_prompt_and_missing_ones_are_labelled() -> None:
    by_name = {c["name"]: c for c in CASES}
    full = build_prompt(UserFitnessContext.model_validate(by_name["A_full__en"]["context"]), "en")
    assert (
        "- Name: Karthik" in full
        and "Leg Day (~50 min)" in full
        and "Bench 100 kg: 80/100 kg" in full
    )
    sparse = build_prompt(
        UserFitnessContext.model_validate(by_name["B_minimal_nulls__en"]["context"]), "en"
    )
    assert "Current Weight: Not set kg" in sparse and "None scheduled" in sparse
    assert "None logged yet" in sparse and "ACTIVE GOALS:\nNone" in sparse
