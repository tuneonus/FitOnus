"""Application entry point: `uvicorn onusfit_ai.main:app`."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from onusfit_ai import __version__
from onusfit_ai.features.coach.presentation import router as coach_router
from onusfit_ai.features.knowledge.presentation import router as knowledge_router
from onusfit_ai.features.mcp.application.a2a import A2AMediator
from onusfit_ai.features.mcp.presentation import router as mcp_router
from onusfit_ai.features.mcp.presentation.server import get_fitonus_mcp_server
from onusfit_ai.features.meals.presentation import router as meals_router
from onusfit_ai.features.speech.presentation import router as speech_router
from onusfit_ai.features.workout_planner.application.context import AssembledWorkoutContext
from onusfit_ai.features.workout_planner.application.generator import WorkoutPlanGenerator
from onusfit_ai.features.workout_planner.domain.contracts import (
    ExperienceLevel,
    WeeklyWorkoutSchedule,
    WorkoutAdaptationRequest,
    WorkoutEnvironment,
    WorkoutGenerationRequest,
    WorkoutGoal,
)
from onusfit_ai.features.workout_planner.domain.safety import WorkoutSafetyValidator
from onusfit_ai.features.workout_planner.presentation import router as workout_planner_router
from onusfit_ai.shared.config import Settings, configuration_problems, get_settings, is_production
from onusfit_ai.shared.errors import register_error_handlers
from onusfit_ai.shared.health import router as health_router
from onusfit_ai.shared.logging import configure_logging, log_event
from onusfit_ai.shared.observability import RequestObservabilityMiddleware
from onusfit_ai.shared.observability.router import router as observability_router
from onusfit_ai.shared.request_limits import MAX_REQUEST_BODY_BYTES, RequestBodyLimitMiddleware
from onusfit_ai.shared.tools import set_multi_agent_providers, set_shared_mcp_server

logger = logging.getLogger("onusfit_ai.main")


class _WorkoutPlannerPortAdapter:
    """Composition-root adapter bridging Coach WorkoutAgent to Phase 11 WorkoutPlanner."""

    def __init__(self) -> None:
        self._generator = WorkoutPlanGenerator()

    async def generate_preview_plan(
        self,
        *,
        user_id: str,
        goal: str,
        experience_level: str,
        available_equipment: list[str],
        days_per_week: int,
        session_duration_minutes: int,
        physical_limitations: list[str],
        language: str,
        recent_performance: dict[str, float],
        rag_context: list[str],
    ) -> dict[str, object]:
        try:
            goal_enum = WorkoutGoal(goal)
        except ValueError:
            goal_enum = WorkoutGoal.GENERAL_FITNESS
        try:
            level_enum = ExperienceLevel(experience_level)
        except ValueError:
            level_enum = ExperienceLevel.INTERMEDIATE

        req = WorkoutGenerationRequest(
            user_id=user_id,
            goal=goal_enum,
            experience_level=level_enum,
            available_equipment=available_equipment or ["bodyweight"],
            days_per_week=max(1, min(7, days_per_week)),
            session_duration_minutes=max(15, min(120, session_duration_minutes)),
            physical_limitations=list(physical_limitations),
            language=language,
            rag_context=list(rag_context),
            recent_performance=dict(recent_performance),
        )
        ctx = AssembledWorkoutContext(
            user_id=user_id,
            goal=req.goal,
            experience_level=req.experience_level,
            available_equipment=req.available_equipment,
            days_per_week=req.days_per_week,
            session_duration_minutes=req.session_duration_minutes,
            environment=WorkoutEnvironment.HOME
            if req.available_equipment == ["bodyweight"]
            else WorkoutEnvironment.GYM,
            physical_limitations=req.physical_limitations,
            target_muscles=[],
            preferred_exercises=[],
            excluded_exercises=[],
            language=req.language,
            rag_knowledge_excerpts=req.rag_context,
        )
        plan, val = await self._generator.generate_workout_plan(req, ctx, llm=None)
        return {
            "preview_only": True,
            "plan": plan.model_dump(),
            "validation": val.model_dump(),
        }

    async def adapt_preview_plan(
        self,
        *,
        user_id: str,
        current_plan: dict[str, object],
        feedback: str,
        recovery_score: float | None,
        reduced_duration_minutes: int | None,
        new_equipment: list[str] | None,
        language: str,
    ) -> dict[str, object]:
        parsed_plan = WeeklyWorkoutSchedule.model_validate(current_plan)
        req = WorkoutAdaptationRequest(
            user_id=user_id,
            current_plan=parsed_plan,
            user_feedback=feedback,
            recovery_score=recovery_score,
            reduced_duration_minutes=reduced_duration_minutes,
            new_equipment=new_equipment,
            difficulty_feedback="too_hard"
            if (recovery_score is not None and recovery_score < 45)
            else None,
            language=language,
        )
        adapted, val = self._generator.adapt_workout_plan(req, llm=None)
        return {
            "preview_only": True,
            "plan": adapted.model_dump(),
            "validation": val.model_dump(),
        }

    def check_medical_red_flags(
        self, limitations: list[str], user_notes: str | None = None
    ) -> list[str]:
        return WorkoutSafetyValidator.check_medical_red_flags(limitations, user_notes)


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
    app.include_router(observability_router)
    app.include_router(coach_router)
    app.include_router(meals_router)
    app.include_router(speech_router)
    app.include_router(knowledge_router)
    app.include_router(workout_planner_router)
    app.include_router(mcp_router)

    # Wire in-process MCP server and Phase 13 multi-agent providers
    mcp_srv = get_fitonus_mcp_server()
    set_shared_mcp_server(mcp_srv)
    set_multi_agent_providers(
        a2a_factory=A2AMediator,
        workout_planner_factory=_WorkoutPlannerPortAdapter,
    )

    return app


app = create_app()
