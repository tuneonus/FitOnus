"""Process-wide settings, read from environment variables.

Secrets (the Gemini API key, the Node-to-Python signing secret) are read from the environment only,
never from code or request bodies, and are never logged.
"""

import os
from dataclasses import dataclass

# Minimum length of the shared secret used to verify Node's service tokens (HS256).
MIN_SERVICE_SECRET_LENGTH = 32


@dataclass(frozen=True)
class Settings:
    environment: str
    # Gemini
    gemini_api_key: str | None
    gemini_attempt_timeout_s: float
    # Service-to-service authentication (Node -> Python)
    service_jwt_secret: str | None
    service_jwt_issuer: str
    service_jwt_audience: str


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


def get_settings() -> Settings:
    """Read settings from the environment on every call (cheap; keeps tests simple)."""
    return Settings(
        environment=os.environ.get("ONUSFIT_AI_ENV", "development"),
        gemini_api_key=_clean(os.environ.get("GEMINI_API_KEY")),
        gemini_attempt_timeout_s=float(os.environ.get("GEMINI_ATTEMPT_TIMEOUT_S", "20")),
        service_jwt_secret=_clean(os.environ.get("AI_SERVICE_JWT_SECRET")),
        service_jwt_issuer=os.environ.get("AI_SERVICE_JWT_ISSUER", "onusfit-node-api"),
        service_jwt_audience=os.environ.get("AI_SERVICE_JWT_AUDIENCE", "onusfit-ai-backend"),
    )
