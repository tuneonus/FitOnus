"""Observability and request middleware."""

from onusfit_ai.shared.observability.observability import (
    FEATURE_BY_PATH,
    AiErrorCategory,
    RequestObservabilityMiddleware,
    category_for_error_code,
    category_for_gemini_kind,
    log_ai_failure,
    safe_id,
)

__all__ = [
    "AiErrorCategory",
    "FEATURE_BY_PATH",
    "RequestObservabilityMiddleware",
    "category_for_error_code",
    "category_for_gemini_kind",
    "log_ai_failure",
    "safe_id",
]
