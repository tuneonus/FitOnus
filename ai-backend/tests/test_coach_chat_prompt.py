"""The prompt must stay identical to the one the former Node implementation produced.

The golden files were rendered by Node's GeminiCoachChatService before it was removed. They now act as
regression fixtures: change the prompt deliberately, bump PROMPT_VERSION and regenerate them.
"""

import pytest

from conftest import FIXTURES, load_request
from onusfit_ai.contracts.coach_chat import CoachChatRequest
from onusfit_ai.prompts.coach_chat import build_prompt, js_num


@pytest.mark.parametrize("name", ["full", "sparse"])
def test_prompt_matches_node_golden(name: str) -> None:
    request = CoachChatRequest.model_validate(load_request(name))
    expected = (FIXTURES / f"{name}.prompt.golden.txt").read_text(encoding="utf-8")

    actual = build_prompt(request.message, request.context, request.history, request.memories)

    assert actual == expected


def test_only_last_six_history_turns_are_used() -> None:
    request = CoachChatRequest.model_validate(load_request("full"))
    prompt = build_prompt(request.message, request.context, request.history, request.memories)
    assert "turn 1 (dropped" not in prompt
    assert "turn 7" in prompt


@pytest.mark.parametrize(
    ("value", "expected"), [(72.0, "72"), (72.5, "72.5"), (0.0, "0"), (3, "3"), (None, "null")]
)
def test_js_num_formats_like_javascript(value: float | None, expected: str) -> None:
    assert js_num(value) == expected
