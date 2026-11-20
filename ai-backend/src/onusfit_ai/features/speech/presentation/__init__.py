"""Speech presentation routes."""

from fastapi import APIRouter

from onusfit_ai.features.speech.presentation import transcribe

router = APIRouter()
router.include_router(transcribe.router)

__all__ = ["router", "transcribe"]
