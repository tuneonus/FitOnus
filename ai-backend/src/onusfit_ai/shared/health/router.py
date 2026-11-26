"""Liveness and readiness endpoints.

Routes stay thin: read state/settings, build contract, return.
"""

from fastapi import APIRouter

from onusfit_ai import __version__
from onusfit_ai.shared.config.config import configuration_problems, get_settings, is_production
from onusfit_ai.shared.errors.errors import AiError
from onusfit_ai.shared.health.models import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])

_shutting_down = False


def set_shutting_down(value: bool) -> None:
    """Mark the service as draining/shutting down so `/health/ready` fails closed with 503."""
    global _shutting_down
    _shutting_down = value


def is_shutting_down() -> bool:
    """Return True when the process is draining for shutdown."""
    return _shutting_down


@router.get("/live", response_model=HealthResponse)
def live() -> HealthResponse:
    """The process is up. It checks no database or provider (none are connected to it)."""
    return HealthResponse(
        status="ok",
        service="onusfit-ai-backend",
        version=__version__,
        environment=get_settings().environment,
    )


@router.get("/ready", response_model=HealthResponse)
def ready() -> HealthResponse:
    """Readiness probe: 200 when not draining and configuration is valid for the environment."""
    if _shutting_down:
        raise AiError(
            status_code=503,
            code="SERVICE_UNAVAILABLE",
            message="The AI service is shutting down.",
            dispatched=False,
        )
    settings = get_settings()
    if is_production(settings) and configuration_problems():
        raise AiError(
            status_code=503,
            code="SERVICE_UNAVAILABLE",
            message="The AI service is not configured.",
            dispatched=False,
        )
    return HealthResponse(
        status="ok",
        service="onusfit-ai-backend",
        version=__version__,
        environment=settings.environment,
    )
