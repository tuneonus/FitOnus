"""Turns Gemini's raw text into a structured coach reply.

Ported from `parseGeminiOutput` (Node: modules/coach/infrastructure/gemini-coach-chat-service.ts).
Gemini is asked for JSON, but models sometimes add ```json fences or return plain prose, so the
parser strips fences, tries to read JSON, and otherwise falls back to the raw text.
"""

import json
import re
from typing import Literal

from onusfit_ai.contracts.coach_chat import CoachChatResult
from onusfit_ai.core.js_compat import js_string

Outcome = Literal["ok", "unstructured"]
FALLBACK_SOURCE = "OnusFit Coach Engine"
MEMORY_SOURCE = "AI Memory"


def strip_code_fences(raw: str) -> str:
    cleaned = raw
    if cleaned.startswith("```json"):
        cleaned = re.sub(r"^```json\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    elif cleaned.startswith("```"):
        cleaned = re.sub(r"^```\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned


def parse_coach_output(raw_text: str, *, has_memories: bool) -> tuple[CoachChatResult, Outcome]:
    outcome: Outcome = "unstructured"
    result = CoachChatResult(text=raw_text, follow_ups=[], sources=[FALLBACK_SOURCE])

    try:
        parsed = json.loads(strip_code_fences(raw_text))
    except ValueError:
        parsed = None

    if isinstance(parsed, dict) and isinstance(parsed.get("text"), str):
        follow_ups = parsed.get("followUps")
        sources = parsed.get("sources")
        blocks = parsed.get("blocks")
        outcome = "ok"
        result = CoachChatResult(
            text=parsed["text"],
            follow_ups=[js_string(x) for x in follow_ups] if isinstance(follow_ups, list) else [],
            sources=[js_string(x) for x in sources] if isinstance(sources, list) else [],
            medical_note=bool(parsed.get("medicalNote")),
            blocks=[b for b in blocks if isinstance(b, dict)] if isinstance(blocks, list) else None,
        )

    # Node adds this marker whenever memories were supplied to the model.
    if has_memories and MEMORY_SOURCE not in result.sources:
        result.sources.append(MEMORY_SOURCE)
    return result, outcome
