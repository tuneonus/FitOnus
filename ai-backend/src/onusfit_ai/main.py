"""Application entry point: `uvicorn onusfit_ai.main:app`."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from onusfit_ai import __version__
from onusfit_ai.api import coach_chat, coach_insights, health, meal_photo, transcribe, voice_meal
from onusfit_ai.core.config import Settings, configuration_problems, get_settings, is_production
from onusfit_ai.core.errors import register_error_handlers
from onusfit_ai.core.logging import configure_logging, log_event
from onusfit_ai.core.observability import RequestObservabilityMiddleware

logger = logging.getLogger("onusfit_ai.main")


def run_startup_checks() -> None:
    """Validate the environment and start logging; raise RuntimeError if it must not start.

    Production refuses to start with a bad configuration, so a broken deploy shows up as a failed
    deploy instead of a healthy-looking service that answers 503 to everything. An unparsable
    setting is fatal everywhere (every request would fail). Messages name variables only; values
    (secrets, keys) are never printed.
    """
    try:
        settings: Settings | None = get_settings()
    except ValueError:
        settings = None
    configure_logging(
        settings.log_level if settings else "INFO", settings.log_format if settings else "json"
    )

    problems = configuration_problems()
    fatal = settings is None or is_production(settings)
    if problems and fatal:
        for problem in problems:
            log_event(
                logger,
                "config.invalid",
                level=logging.ERROR,
                message=f"invalid configuration: {problem}",
            )
        raise RuntimeError("Invalid configuration: " + "; ".join(problems))
    for problem in problems:  # development: keep going, but say what will not work
        log_event(
            logger, "config.warning", level=logging.WARNING, message=f"configuration: {problem}"
        )
    if settings:
        log_event(
            logger,
            "service.starting",
            message="starting onusfit-ai-backend",
            version=__version__,
            environment=settings.environment,
            logFormat=settings.log_format,
            geminiKeyConfigured=bool(settings.gemini_api_key),  # presence only, never the value
            serviceSecretConfigured=bool(settings.service_jwt_secret),
        )


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Runs when uvicorn starts the app (a plain `TestClient(app)` does not run it)."""
    run_startup_checks()
    yield


def create_app() -> FastAPI:
    # No public API docs: this is an internal service (Node is the only caller).
    app = FastAPI(
        title="OnusFit AI Backend",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    register_error_handlers(app)
    # Ids bound here reach auth, the handlers and the Gemini client: every line carries them.
    app.add_middleware(RequestObservabilityMiddleware)
    app.include_router(health.router)
    app.include_router(coach_chat.router)
    app.include_router(coach_insights.router)
    app.include_router(voice_meal.router)
    app.include_router(meal_photo.router)
    app.include_router(transcribe.router)
    return app


app = create_app()
