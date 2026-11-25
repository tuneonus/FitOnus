"""AI Coach presentation routes."""

from fastapi import APIRouter

from onusfit_ai.features.coach.presentation import (
    coach_chat,
    coach_chat_stream,
    coach_insights,
    memory_extract,
)

router = APIRouter()
router.include_router(coach_chat.router)
router.include_router(coach_chat_stream.router)
router.include_router(coach_insights.router)
router.include_router(memory_extract.router)

__all__ = ["coach_chat", "coach_chat_stream", "coach_insights", "memory_extract", "router"]
