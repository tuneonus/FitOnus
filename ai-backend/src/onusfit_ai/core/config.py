"""Process-wide settings, read from environment variables.

Secrets (the Gemini API key, the Node-to-Python signing secret) are read from the environment only,
never from code or request bodies, and are never logged.
"""

import os
from dataclasses import dataclass

# Minimum length of the shared secret used to verify Node's service tokens (HS256).
MIN_SERVICE_SECRET_LENGTH = 32


# Upper bound for one Gemini attempt; Node's own deadlines (22-27 s) are shorter anyway.
MAX_ATTEMPT_TIMEOUT_S = 60.0


@dataclass(frozen=True)
class Settings:
    environment: str
    log_level: str
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
        log_level=(os.environ.get("LOG_LEVEL") or "INFO").strip().upper(),
        gemini_api_key=_clean(os.environ.get("GEMINI_API_KEY")),
        gemini_attempt_timeout_s=float(os.environ.get("GEMINI_ATTEMPT_TIMEOUT_S", "20")),
        service_jwt_secret=_clean(os.environ.get("AI_SERVICE_JWT_SECRET")),
        service_jwt_issuer=os.environ.get("AI_SERVICE_JWT_ISSUER", "onusfit-node-api"),
        service_jwt_audience=os.environ.get("AI_SERVICE_JWT_AUDIENCE", "onusfit-ai-backend"),
    )


def is_production(settings: Settings) -> bool:
    return settings.environment.strip().lower() == "production"


def configuration_problems() -> list[str]:
    """Everything wrong with the environment, as messages that name variables but never show values.

    Used at startup: in production any problem stops the process (so a bad deploy fails visibly
    instead of answering 503 to every request); elsewhere problems are only logged as warnings.
    """
    try:
        settings = get_settings()
    except ValueError:
        return ["GEMINI_ATTEMPT_TIMEOUT_S must be a number of seconds"]

    problems: list[str] = []
    secret = settings.service_jwt_secret
    if not secret:
        problems.append("AI_SERVICE_JWT_SECRET is not set (every request would be refused)")
    elif len(secret) < MIN_SERVICE_SECRET_LENGTH:
        problems.append(
            f"AI_SERVICE_JWT_SECRET must be at least {MIN_SERVICE_SECRET_LENGTH} characters"
        )
    if not settings.gemini_api_key:
        problems.append("GEMINI_API_KEY is not set (every AI request would fail)")
    if not 0 < settings.gemini_attempt_timeout_s <= MAX_ATTEMPT_TIMEOUT_S:
        problems.append(f"GEMINI_ATTEMPT_TIMEOUT_S must be between 0 and {MAX_ATTEMPT_TIMEOUT_S:g}")
    if not settings.service_jwt_issuer.strip():
        problems.append("AI_SERVICE_JWT_ISSUER must not be empty")
    if not settings.service_jwt_audience.strip():
        problems.append("AI_SERVICE_JWT_AUDIENCE must not be empty")
    if settings.log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        problems.append("LOG_LEVEL must be one of DEBUG, INFO, WARNING, ERROR, CRITICAL")
    return problems
