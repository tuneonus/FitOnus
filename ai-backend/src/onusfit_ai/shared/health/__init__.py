"""Health check endpoint and contracts."""

from onusfit_ai.shared.health.models import HealthResponse
from onusfit_ai.shared.health.router import is_shutting_down, router, set_shutting_down

__all__ = ["HealthResponse", "is_shutting_down", "router", "set_shutting_down"]
