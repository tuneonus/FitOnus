"""Liveness endpoint. Routes stay thin: read settings, build the contract, return it."""

from fastapi import APIRouter

from onusfit_ai import __version__
from onusfit_ai.contracts.health import HealthResponse
from onusfit_ai.core.config import get_settings

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
