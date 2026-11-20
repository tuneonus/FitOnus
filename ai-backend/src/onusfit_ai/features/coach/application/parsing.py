"""Turns Gemini's raw text into a structured coach reply.

Ported from `parseGeminiOutput` (Node: modules/coach/infrastructure/gemini-coach-chat-service.ts).
Gemini is asked for JSON, but models sometimes add ```json fences or return plain prose, so the
parser strips fences, tries to read JSON, and otherwise falls back to the raw text.
"""

from typing import Literal

from onusfit_ai.features.coach.domain.chat import CoachChatResult
from onusfit_ai.shared.utils.js_compat import js_string, strict_json_loads, strip_code_fences

Outcome = Literal["ok", "unstructured"]
FALLBACK_SOURCE = "OnusFit Coach Engine"
MEMORY_SOURCE = "AI Memory"


def parse_coach_output(raw_text: str, *, has_memories: bool) -> tuple[CoachChatResult, Outcome]:
    outcome: Outcome = "unstructured"
    result = CoachChatResult(text=raw_text, follow_ups=[], sources=[FALLBACK_SOURCE])

    try:
        parsed = strict_json_loads(strip_code_fences(raw_text))
    except ValueError:
        parsed = None

    if isinstance(parsed, dict) and isinstance(parsed.get("text"), str):
        follow_ups = parsed.get("followUps")
        sources = parsed.get("sources")
        outcome = "ok"
        result = CoachChatResult(
            text=parsed["text"],
            follow_ups=[js_string(x) for x in follow_ups] if isinstance(follow_ups, list) else [],
            sources=[js_string(x) for x in sources] if isinstance(sources, list) else [],
            medical_note=bool(parsed.get("medicalNote")),
            # `blocks` is deliberately NOT read from the model's JSON, so it stays None. The prompt
            # never asks for blocks, and the mobile app renders them (an "action" block even runs
            # writes after a tap), so a block the model made up must not reach it.
        )

    # Node adds this marker whenever memories were supplied to the model.
    if has_memories and MEMORY_SOURCE not in result.sources:
        result.sources.append(MEMORY_SOURCE)
    return result, outcome
