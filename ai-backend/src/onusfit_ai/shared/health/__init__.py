"""Health check endpoint and contracts."""

from onusfit_ai.shared.health.models import HealthResponse
from onusfit_ai.shared.health.router import router

__all__ = ["HealthResponse", "router"]
