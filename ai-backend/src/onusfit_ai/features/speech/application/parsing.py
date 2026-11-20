"""Turns Gemini's raw text into `{transcript, detectedLanguage}`.

Ported 1:1 from the former Node `GeminiClient.transcribeAudio` parsing, including its coercions
(`String(x || "")`). tests/fixtures/transcribe/parse_cases.json holds 21 cases rendered by Node.
"""

from typing import Any, Literal

from onusfit_ai.features.speech.application.contracts import TranscribeResult
from onusfit_ai.shared.utils.js_compat import (
    js_or,
    js_prop,
    js_string,
    strict_json_loads,
    strip_code_fences,
)

TranscribeOutcome = Literal["ok", "unstructured"]


def parse_transcription(raw_text: str) -> tuple[TranscribeResult, TranscribeOutcome]:
    raw = raw_text.strip()
    try:
        parsed: Any = strict_json_loads(strip_code_fences(raw))
        transcript = js_string(js_or(js_prop(parsed, "transcript"), "")).strip()
        language = js_string(js_or(js_prop(parsed, "detectedLanguage"), "en"))
        return TranscribeResult(transcript=transcript, detected_language=language), "ok"
    except (ValueError, TypeError):
        # Not JSON (or `null`): the whole reply is treated as the transcript.
        return TranscribeResult(transcript=raw, detected_language="en"), "unstructured"
