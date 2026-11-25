"""Domain contracts and pure output builders for streaming AI Coach chat (Phase 14)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from onusfit_ai.features.coach.domain.chat import (
    CitationReference,
    CoachChatRequest,
    CoachChatResult,
)
from onusfit_ai.shared.contracts._base import ContractModel
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.contracts.streaming import (
    StreamDeltaEvent,
    StreamErrorEvent,
    StreamHeartbeatEvent,
    StreamStartEvent,
    StreamStatusEvent,
    sanitize_stream_delta,
)

# Safe user-facing status labels for tools & agents (never expose raw tool args or thoughts).
SAFE_TOOL_STATUS_MESSAGES: dict[str, str] = {
    "get_recent_workouts": "Checking your recent workouts...",
    "get_nutrition_summary": "Reviewing your nutrition logs...",
    "get_weight_trend": "Checking your weight trend...",
    "search_exercises": "Searching exercise library...",
    "retrieve_fitness_knowledge": "Consulting sports science guides...",
    "preview_workout_plan": "Preparing workout preview...",
    "preview_workout_adaptation": "Adapting workout schedule...",
    "validate_workout_plan": "Validating workout safety bounds...",
    "preview_nutrition_plan": "Calculating nutrition targets...",
    "get_exercise_details": "Checking exercise details...",
}

SAFE_AGENT_STATUS_MESSAGES: dict[str, str] = {
    "supervisor": "Coordinating your coaching response...",
    "workout": "Analyzing workout history and plan...",
    "nutrition": "Evaluating nutrition and macro balance...",
    "progress": "Reviewing training and weight progress...",
    "recovery": "Assessing recovery and training load...",
    "knowledge": "Checking evidence-based fitness sources...",
}

_MEDICAL_KEYWORDS = re.compile(
    r"\b(?:chest\s+pain|shortness\s+of\s+breath|dizzy|dizziness|faint|sharp\s+pain|"
    r"consult\s+(?:a\s+)?(?:doctor|physician|clinician|healthcare)|medical\s+attention|"
    r"injury|fracture|numbness)\b",
    re.IGNORECASE,
)

_EXTREME_UNSAFE_CALORIE_PROMO = re.compile(
    r"\b(?:eat\s+(?:only\s+)?(?:200|300|400|500|600|700)\s*(?:kcal|calories)\s+(?:a|per)\s+day|"
    r"starve\s+yourself|skip\s+all\s+meals)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class CoachStreamConfig:
    """Pure timing and safety configuration for a streaming coach response."""

    heartbeat_interval_s: float = 5.0
    max_queue_size: int = 64
    max_output_chars: int = 16_000


class CoachStreamCompleteEvent(ContractModel):
    type: Literal["complete"] = "complete"
    outcome: Literal["ok", "unstructured"] = "ok"
    result: CoachChatResult
    usage: Usage
    trace_id: str
    partial: bool = False


CoachStreamEvent = (
    StreamStartEvent
    | StreamStatusEvent
    | StreamDeltaEvent
    | CoachStreamCompleteEvent
    | StreamErrorEvent
    | StreamHeartbeatEvent
)


def safe_tool_progress_message(tool_name: str) -> str:
    """Return a closed, user-safe progress label for an allowlisted tool."""
    return SAFE_TOOL_STATUS_MESSAGES.get(tool_name, "Checking your fitness data...")


def safe_agent_progress_message(agent_role: str) -> str:
    """Return a closed, user-safe progress label for a specialist agent role."""
    return SAFE_AGENT_STATUS_MESSAGES.get(agent_role, "Analyzing your fitness context...")


def validate_stream_output_safety(text: str) -> tuple[str, bool]:
    """Sanitize final streamed text and enforce clinical/caloric/PED guardrails across languages.

    Returns ``(safe_text, medical_note)``.
    """
    from onusfit_ai.shared.utils.guardrails import apply_output_guardrail

    cleaned_delta = sanitize_stream_delta(text).strip()
    return apply_output_guardrail(cleaned_delta)


def build_default_follow_ups(request: CoachChatRequest, *, has_medical: bool) -> list[str]:
    """Generate safe, contextual follow-up chips matching request language."""
    msg = request.message.lower()
    if any("\u0b80" <= ch <= "\u0bff" for ch in request.message):
        return (
            ["மருத்துவரை எப்போது அணுக வேண்டும்?", "இன்றைய எளிய பயிற்சி என்ன?"]
            if has_medical
            else ["இன்றைய உணவு இலக்கு என்ன?", "என் பயிற்சி திட்டத்தை காட்டு"]
        )
    if any(w in msg for w in ("innaiku", "saapda", "mudiyuma", "sariya", "irukka", "pannalama")):
        return (
            ["Safe recovery options enna?", "Rest day steps sollunga"]
            if has_medical
            else ["Dinner-ku enna saapdalam?", "Innaiku workout plan enna?"]
        )
    if has_medical:
        return ["What safe mobility can I do?", "How should I adjust my routine?"]
    if any(w in msg for w in ("protein", "calorie", "kcal", "meal", "eat", "food", "biryani")):
        return ["Suggest a high-protein meal", "How are my macros today?"]
    if any(w in msg for w in ("workout", "squat", "bench", "plan", "leg", "push", "pull")):
        return ["Adjust sets for recovery", "Show exercise alternatives"]
    return ["How is my progress this week?", "What should I focus on today?"]


def build_streaming_coach_result(
    *,
    streamed_text: str,
    request: CoachChatRequest,
    tool_calls: list[str] | None = None,
    sources: list[str] | None = None,
    follow_ups: list[str] | None = None,
    medical_note: bool | None = None,
    citations: list[CitationReference] | None = None,
) -> CoachChatResult:
    """Assemble the final validated `CoachChatResult` after prose streaming completes."""
    safe_text, detected_medical = validate_stream_output_safety(streamed_text)
    if not safe_text:
        safe_text = "Here is your fitness coaching summary based on your current profile."

    final_medical = bool(medical_note) or detected_medical

    resolved_sources: list[str] = list(sources) if sources else ["Profile", "Today's Nutrition"]
    if request.memories and "AI Memory" not in resolved_sources:
        resolved_sources.append("AI Memory")
    if request.knowledge and citations:
        for cit in citations:
            if cit.document_title not in resolved_sources:
                resolved_sources.append(cit.document_title)

    resolved_follow_ups = (
        [f.strip() for f in follow_ups if f and f.strip()][:4]
        if follow_ups
        else build_default_follow_ups(request, has_medical=final_medical)
    )

    deduped_tools = list(dict.fromkeys(tool_calls)) if tool_calls else None

    return CoachChatResult(
        text=safe_text,
        follow_ups=resolved_follow_ups,
        sources=resolved_sources,
        medical_note=final_medical,
        blocks=None,
        tool_calls=deduped_tools,
        citations=citations if citations else None,
    )
