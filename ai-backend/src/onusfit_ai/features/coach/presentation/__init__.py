"""AI Coach presentation routes."""

from fastapi import APIRouter

from onusfit_ai.features.coach.presentation import coach_chat, coach_insights

router = APIRouter()
router.include_router(coach_chat.router)
router.include_router(coach_insights.router)

__all__ = ["coach_chat", "coach_insights", "router"]
