"""Request-level observability for the internal AI endpoints.

Three things live here:
  * the error taxonomy (`AiErrorCategory`), identical to the Node API's
    (backend/src/shared/ai/ai-observability.ts) so both services speak the same words;
  * `RequestObservabilityMiddleware`, which gives every request its ids and writes one access line;
  * `log_ai_failure`, called by the error handlers, so auth and validation failures are not silent.

Privacy: nothing here reads a request or response BODY. Only headers named below, the method, the
route path (a constant such as `/internal/v1/ai/coach/chat`) and the status code are used.
"""

import logging
import re
import time
from typing import Any, Final, Literal

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from onusfit_ai.shared.logging.logging import (
    SERVICE_NAME,
    ai_request_id_var,
    clean_fields,
    correlation_id_var,
    feature_var,
    llm_metrics_recorded_var,
    log_event,
)
from onusfit_ai.shared.logging.metrics import metrics_registry
from onusfit_ai.shared.logging.tracing import (
    SpanRecord,
    bind_trace_context,
    create_root_trace_context,
    default_span_recorder,
    reset_trace_context,
)

logger = logging.getLogger("onusfit_ai.http")

AiErrorCategory = Literal[
    "gemini_timeout",
    "gemini_rate_limited",
    "gemini_quota_exhausted",
    "gemini_unavailable",
    "gemini_auth",
    "gemini_error",
    "python_unavailable",
    "python_timeout",
    "auth_failure",
    "invalid_ai_response",
    "invalid_request",
    "internal_error",
]

# Our own error codes (see shared/errors/errors.py, shared/llm/gemini.py `_to_ai_error`): category.
_CATEGORY_BY_ERROR_CODE: Final[dict[str, AiErrorCategory]] = {
    "PROVIDER_TIMEOUT": "gemini_timeout",
    "PROVIDER_RATE_LIMITED": "gemini_rate_limited",
    "PROVIDER_QUOTA_EXHAUSTED": "gemini_quota_exhausted",
    "PROVIDER_UNAVAILABLE": "gemini_unavailable",
    "AI_UNAVAILABLE": "gemini_unavailable",  # both models failed, or both are cooling down
    "PROVIDER_AUTH_ERROR": "gemini_auth",
    "PROVIDER_NOT_CONFIGURED": "gemini_auth",
    "PROVIDER_ERROR": "gemini_error",
    "AUTH_INVALID_TOKEN": "auth_failure",
    "AUTH_NOT_CONFIGURED": "auth_failure",
    "INVALID_REQUEST": "invalid_request",
    "PAYLOAD_TOO_LARGE": "invalid_request",
}

# Gemini failure kinds (shared/llm/errors.py `ErrorKind`) -> category, for the per-attempt log line.
_CATEGORY_BY_GEMINI_KIND: Final[dict[str, AiErrorCategory]] = {
    "TIMEOUT": "gemini_timeout",
    "RATE_LIMIT_RPM": "gemini_rate_limited",
    "QUOTA_EXHAUSTED_RPD": "gemini_quota_exhausted",
    "HIGH_DEMAND_503": "gemini_unavailable",
    "MODEL_NOT_FOUND": "gemini_unavailable",
    "AUTH_ERROR": "gemini_auth",
    "BAD_REQUEST": "gemini_error",
    "UNKNOWN": "gemini_error",
}

# Route path -> feature name, so every line written while a request is handled says which feature it
# belongs to. tests/test_observability.py fails if a new internal route is missing here.
FEATURE_BY_PATH: Final[dict[str, str]] = {
    "/internal/v1/ai/coach/chat": "coach_chat",
    "/internal/v1/ai/coach/chat/stream": "coach_chat",
    "/internal/v1/ai/coach/insights": "coach_insights",
    "/internal/v1/ai/coach/memories/extract": "coach_memory_extract",
    "/internal/v1/ai/meals/parse-voice": "voice_meal",
    "/internal/v1/ai/meals/analyze-photo": "meal_photo",
    "/internal/v1/ai/meals/analyze-multimodal": "multimodal_meal",
    "/internal/v1/ai/speech/transcribe": "transcribe",
    "/internal/v1/ai/embed": "knowledge_embed",
    "/internal/v1/ai/workout-planner/generate": "workout_planner",
    "/internal/v1/ai/workout-planner/adapt": "workout_planner",
    "/internal/v1/ai/workout-planner/validate": "workout_planner",
}

_SAFE_ID: Final = re.compile(r"^[A-Za-z0-9._-]{8,128}$")  # same rule as the Node API


def category_for_error_code(code: str) -> AiErrorCategory:
    return _CATEGORY_BY_ERROR_CODE.get(code, "internal_error")


def category_for_gemini_kind(kind: str) -> AiErrorCategory:
    return _CATEGORY_BY_GEMINI_KIND.get(kind, "gemini_error")


def safe_id(value: str | None) -> str | None:
    """An id from a header, or None if it is missing or not a plain token (never echo odd input)."""
    return value if value is not None and _SAFE_ID.fullmatch(value) else None


def _level_for_status(status: int) -> int:
    if status >= 500:
        return logging.ERROR
    if status >= 400:
        return logging.WARNING
    return logging.INFO


def log_ai_failure(
    *,
    code: str,
    status: int,
    dispatched: bool,
    retry_after_seconds: int | None = None,
    invalid_fields: list[str] | None = None,
    usage: Any | None = None,
) -> None:
    """One `ai.request.failed` event for an error the service is about to answer with.

    Carries the machine code and category, never the error's message text (which for validation
    errors could echo a value). `invalidFields` holds field NAMES only.
    """
    optional: dict[str, Any] = {}
    if retry_after_seconds is not None:
        optional["retryAfterSeconds"] = retry_after_seconds
    if invalid_fields is not None:
        optional["invalidFields"] = invalid_fields
    category = category_for_error_code(code)
    if not llm_metrics_recorded_var.get():
        try:
            if usage is not None:
                metrics_registry.record_llm_call(
                    feature=feature_var.get() or "_other",
                    model=str(getattr(usage, "model", "_other")),
                    duration_ms=float(getattr(usage, "duration_ms", 0)),
                    success=False,
                    input_tokens=int(getattr(usage, "input_tokens", 0)),
                    output_tokens=int(getattr(usage, "output_tokens", 0)),
                    cached_tokens=int(getattr(usage, "cached_tokens", 0)),
                    thinking_tokens=int(getattr(usage, "thinking_tokens", 0)),
                    total_tokens=int(getattr(usage, "total_tokens", 0)),
                    is_fallback=bool(getattr(usage, "is_fallback", False)),
                    error_category=category,
                    timeout=(category == "gemini_timeout"),
                )
                llm_metrics_recorded_var.set(True)
            else:
                metrics_registry.record_request_failure(
                    feature=feature_var.get(),
                    error_category=category,
                )
        except Exception:  # noqa: BLE001 - observability must never break error responses
            pass
    log_event(
        logger,
        "ai.request.failed",
        level=_level_for_status(status),
        success=False,
        errorCode=code,
        errorCategory=category,
        httpStatus=status,
        dispatched=dispatched,
        **optional,
    )


class RequestObservabilityMiddleware:
    """Pure ASGI middleware: it wraps the app and never touches a request or response body.

    For each HTTP request it reads `X-Correlation-Id` (the Node API's HTTP request id) and
    `X-Request-Id` (the id of this one AI call), binds them and the feature to context variables so
    EVERY line written while handling the request carries them, then writes one `http.request` line
    with the status and duration. Unhandled exceptions are logged by type only and re-raised, so
    Starlette's own 500 response (and the Node client's handling of it) is unchanged.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        path = str(scope["path"])
        correlation_id = safe_id(headers.get("x-correlation-id"))
        ai_request_id = safe_id(headers.get("x-request-id"))
        feature = FEATURE_BY_PATH.get(path)
        trace_ctx = create_root_trace_context(
            correlation_id=correlation_id,
            ai_request_id=ai_request_id,
            traceparent=headers.get("traceparent"),
        )
        tokens = (
            correlation_id_var.set(correlation_id),
            ai_request_id_var.set(ai_request_id),
            feature_var.set(feature),
            llm_metrics_recorded_var.set(False),
        )
        trace_tokens = bind_trace_context(trace_ctx)
        started = time.perf_counter()
        status = 500  # what Starlette answers if the application raises before responding
        unhandled_error_type: str | None = None

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = int(message["status"])
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            unhandled_error_type = type(exc).__name__
            log_event(
                logger,
                "http.unhandled_error",
                level=logging.ERROR,
                success=False,
                errorCategory="internal_error",
                errorType=unhandled_error_type,  # class only: exception text can hold user data
            )
            raise
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000)
            # Health checks are polled constantly; logging them would bury the real traffic.
            if not path.startswith("/health"):
                if not path.endswith("/observability"):
                    try:
                        metrics_registry.record_http_request(feature, status)
                        default_span_recorder.record(
                            SpanRecord(
                                trace_id=trace_ctx.trace_id,
                                span_id=trace_ctx.span_id,
                                parent_span_id=trace_ctx.parent_span_id,
                                service=SERVICE_NAME,
                                operation=f"http.{str(scope['method']).lower()}",
                                status="error" if status >= 500 or unhandled_error_type else "ok",
                                duration_ms=float(duration_ms),
                                started_at_monotonic=started,
                                correlation_id=correlation_id,
                                ai_request_id=ai_request_id,
                                error_category=("internal_error" if unhandled_error_type else None),
                                attributes=clean_fields(
                                    {"path": path, "httpStatus": status, "feature": feature}
                                ),
                            )
                        )
                    except Exception:  # noqa: BLE001 - fail-open observability
                        pass
                log_event(
                    logger,
                    "http.request",
                    level=_level_for_status(status),
                    method=str(scope["method"]),
                    path=path,
                    httpStatus=status,
                    durationMs=duration_ms,
                )
            reset_trace_context(trace_tokens)
            correlation_id_var.reset(tokens[0])
            ai_request_id_var.reset(tokens[1])
            feature_var.reset(tokens[2])
            llm_metrics_recorded_var.reset(tokens[3])
