"""Application entry point: `uvicorn onusfit_ai.main:app`."""

from fastapi import FastAPI

from onusfit_ai import __version__
from onusfit_ai.api import coach_chat, coach_insights, health, meal_photo, transcribe, voice_meal
from onusfit_ai.core.errors import register_error_handlers


def create_app() -> FastAPI:
    # No public API docs: this is an internal service (Node is the only caller).
    app = FastAPI(
        title="OnusFit AI Backend",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    register_error_handlers(app)
    app.include_router(health.router)
    app.include_router(coach_chat.router)
    app.include_router(coach_insights.router)
    app.include_router(voice_meal.router)
    app.include_router(meal_photo.router)
    app.include_router(transcribe.router)
    return app


app = create_app()
