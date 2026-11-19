"""The transcription prompt must equal the one the former Node implementation sent."""

from conftest import TRANSCRIBE_FIXTURES
from onusfit_ai.prompts.transcribe import build_prompt


def test_prompt_matches_node_golden() -> None:
    expected = (TRANSCRIBE_FIXTURES / "prompt.golden.txt").read_text(encoding="utf-8")
    assert build_prompt() == expected


def test_prompt_asks_for_the_json_shape_the_parser_expects() -> None:
    prompt = build_prompt()
    assert '"transcript"' in prompt and '"detectedLanguage"' in prompt and "Tanglish" in prompt
