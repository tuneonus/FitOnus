"""AI Coach application use cases and parsing."""

from onusfit_ai.features.coach.application.chat import (
    generate_coach_reply,
    is_coach_chat_structured_output_enabled,
)
from onusfit_ai.features.coach.application.insights import (
    generate_coach_insights,
    is_coach_insights_structured_output_enabled,
)
from onusfit_ai.features.coach.application.insights_parsing import parse_insights_output
from onusfit_ai.features.coach.application.parsing import parse_coach_output
from onusfit_ai.features.coach.application.schemas import (
    GeminiCoachInsightsOutput,
    GeminiCoachReplyOutput,
    GeminiInsightItemOutput,
)

__all__ = [
    "GeminiCoachInsightsOutput",
    "GeminiCoachReplyOutput",
    "GeminiInsightItemOutput",
    "generate_coach_insights",
    "generate_coach_reply",
    "is_coach_chat_structured_output_enabled",
    "is_coach_insights_structured_output_enabled",
    "parse_coach_output",
    "parse_insights_output",
]
