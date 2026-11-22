"""FastAPI wiring for the LLM: the one place that decides which `TextGenerator` the routers get."""

import threading

from fastapi import Depends

from onusfit_ai.shared.config.config import Settings, get_settings
from onusfit_ai.shared.llm.gemini import GeminiClient, get_coach_tools
from onusfit_ai.shared.llm.ports import EmbeddingsGenerator, TextGenerator

__all__ = ["get_llm", "get_embeddings_generator", "get_coach_tools"]

# One client per process so the cooldown state survives between requests.
_shared: dict[str | None, GeminiClient] = {}
# FastAPI runs sync dependencies on worker threads, so two requests can arrive here at once.
_shared_lock = threading.Lock()


def get_llm(settings: Settings = Depends(get_settings)) -> TextGenerator:
    """FastAPI dependency. Tests replace it with `app.dependency_overrides[get_llm]`."""
    key = settings.gemini_api_key
    with _shared_lock:
        if key not in _shared:
            _shared.clear()
            _shared[key] = GeminiClient(key, attempt_timeout_s=settings.gemini_attempt_timeout_s)
        return _shared[key]


def get_embeddings_generator(settings: Settings = Depends(get_settings)) -> EmbeddingsGenerator:
    """FastAPI dependency for embeddings.

    Tests replace with `app.dependency_overrides[get_embeddings_generator]`.
    """
    key = settings.gemini_api_key
    with _shared_lock:
        if key not in _shared:
            _shared.clear()
            _shared[key] = GeminiClient(key, attempt_timeout_s=settings.gemini_attempt_timeout_s)
        return _shared[key]
