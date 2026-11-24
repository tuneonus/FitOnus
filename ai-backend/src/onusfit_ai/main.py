"""Application entry point: `uvicorn onusfit_ai.main:app`."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from onusfit_ai import __version__
from onusfit_ai.features.coach.presentation import router as coach_router
from onusfit_ai.features.knowledge.presentation import router as knowledge_router
from onusfit_ai.features.meals.presentation import router as meals_router
from onusfit_ai.features.speech.presentation import router as speech_router
from onusfit_ai.features.workout_planner.presentation import router as workout_planner_router
from onusfit_ai.shared.config import Settings, configuration_problems, get_settings, is_production
from onusfit_ai.shared.errors import register_error_handlers
from onusfit_ai.shared.health import router as health_router
from onusfit_ai.shared.logging import configure_logging, log_event
from onusfit_ai.shared.observability import RequestObservabilityMiddleware
from onusfit_ai.shared.request_limits import MAX_REQUEST_BODY_BYTES, RequestBodyLimitMiddleware

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
    """Create and configure the FastAPI application instance.

    Wires error handlers, observability middleware, and mounts feature routers.
    API documentation endpoints (Swagger/ReDoc) are disabled because this is a private
    internal service invoked exclusively by the Node.js backend.
    """
    app = FastAPI(
        title="OnusFit AI Backend",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    register_error_handlers(app)
    # Middleware added last is outermost: the body limit sits inside observability, so a refused
    # request is still logged with its correlation ids.
    app.add_middleware(RequestBodyLimitMiddleware, max_bytes=MAX_REQUEST_BODY_BYTES)
    # Observability middleware wraps requests to bind correlation IDs into contextvars for logging.
    app.add_middleware(RequestObservabilityMiddleware)

    # Mount modular feature routers
    app.include_router(health_router)
    app.include_router(coach_router)
    app.include_router(meals_router)
    app.include_router(speech_router)
    app.include_router(knowledge_router)
    app.include_router(workout_planner_router)
    return app


app = create_app()
