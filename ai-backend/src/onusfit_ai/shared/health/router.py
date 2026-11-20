"""Liveness endpoint. Routes stay thin: read settings, build the contract, return it."""

from fastapi import APIRouter

from onusfit_ai import __version__
from onusfit_ai.shared.config.config import get_settings
from onusfit_ai.shared.health.models import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", response_model=HealthResponse)
def live() -> HealthResponse:
    """The process is up. It checks no database or provider (none are connected to it)."""
    return HealthResponse(
        status="ok",
        service="onusfit-ai-backend",
        version=__version__,
        environment=get_settings().environment,
    )
