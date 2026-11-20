"""AI Coach domain models and contracts."""

from onusfit_ai.features.coach.domain.chat import (
    ActiveGoalContext,
    ChatTurn,
    CoachChatRequest,
    CoachChatResponse,
    CoachChatResult,
    PlannedWorkoutContext,
    RecentWorkoutContext,
    TodayNutritionContext,
    UserFitnessContext,
    UserFitnessProfile,
)
from onusfit_ai.features.coach.domain.insights import (
    CoachInsightsRequest,
    CoachInsightsResponse,
    InsightItem,
    InsightsResult,
)

__all__ = [
    "ActiveGoalContext",
    "ChatTurn",
    "CoachChatRequest",
    "CoachChatResponse",
    "CoachChatResult",
    "CoachInsightsRequest",
    "CoachInsightsResponse",
    "InsightItem",
    "InsightsResult",
    "PlannedWorkoutContext",
    "RecentWorkoutContext",
    "TodayNutritionContext",
    "UserFitnessContext",
    "UserFitnessProfile",
]
