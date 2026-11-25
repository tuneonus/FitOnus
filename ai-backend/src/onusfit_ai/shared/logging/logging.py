"""Production-safe structured logging: one JSON object per line on stdout, secrets masked.

Why this exists: under uvicorn nothing configures the `onusfit_ai.*` loggers, so the metadata lines
the use cases write (model, outcome, tokens, durations) were being dropped. Render collects stdout,
so this installs one stdout handler. Lines are JSON with the same field names the Node API writes
(`time`, `level`, `service`, `event`, `msg`, `correlationId`, `aiRequestId`, `feature`, `traceId`,
`spanId`, ...), so one search in Render's log viewer finds both services' lines for one request.

Rules (also enforced by tests): events carry metadata only, never prompts, user data, replies,
images, audio, tokens or keys. Three layers keep that true:
  1. `log_event` is the way to write an event; call sites pass enums, numbers and booleans.
  2. `clean_fields` drops what is not a primitive, truncates text, and replaces the value of any
     field whose NAME is sensitive (message, prompt, context, base64, token, health data, ...).
  3. `redact` masks anything that still looks like a Google API key, secret key, bearer token,
     JWT, or e-mail address in the final line, in case a library ever includes one.
JSON also escapes newlines, so a user cannot forge a log line.
"""

import contextvars
import json
import logging
import math
import re
import sys
from datetime import UTC, datetime
from typing import Any, Final

SERVICE_NAME: Final = "onusfit-ai-backend"

# Request-scoped ids, set once per request by the middleware in shared/observability/
# observability.py and added to every log line written while that request is handled.
correlation_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "correlation_id", default=None
)
ai_request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "ai_request_id", default=None
)
feature_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("feature", default=None)
trace_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("trace_id", default=None)
span_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("span_id", default=None)
parent_span_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "parent_span_id", default=None
)
llm_metrics_recorded_var: contextvars.ContextVar[bool] = contextvars.ContextVar(
    "llm_metrics_recorded", default=False
)

_REDACTIONS = (
    (re.compile(r"AIza[0-9A-Za-z_\-]{20,}"), "[redacted-api-key]"),
    (re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}\b"), "[redacted-secret-key]"),
    (re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/\-]+=*"), "Bearer [redacted]"),
    (re.compile(r"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]*"), "[redacted-jwt]"),
    (
        re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),
        "[redacted-email]",
    ),
)

# Field names whose value is replaced, compared after lower-casing and removing `_`/`-`.
# Exact names on purpose: `totalTokens` and `promptVersion` are metadata and must stay readable.
_SENSITIVE_FIELD_NAMES: Final = frozenset(
    {
        "authorization", "cookie", "setcookie", "token", "accesstoken", "refreshtoken", "idtoken",
        "servicetoken", "jwt", "bearer", "password", "passwd", "secret", "servicesecret", "apikey",
        "xapikey", "secretkey", "privatekey", "credentials", "authheader", "key",
        "prompt", "rawprompt", "systemprompt", "message", "messages", "text", "reply", "response",
        "transcript", "transcripts", "context", "history", "memories", "notes", "query",
        "rawinput", "rawoutput", "image", "audio", "base64", "imagebase64", "audiobase64",
        "email", "phone", "displayname", "user", "userid", "sub", "dob", "dateofbirth",
        "healthdata", "healthrecord", "medical", "medicalnote", "diagnosis", "symptoms",
        "injury", "injuries", "allergies", "medications", "weight", "height", "patient",
        "userprofile",
    }
)  # fmt: skip

_MAX_TEXT_LENGTH: Final = 200
_MAX_LIST_ITEMS: Final = 10

# Libraries that log request URLs or payload details at INFO/DEBUG.
_QUIET_LOGGERS = (
    "httpx",
    "httpcore",
    "httpx2",
    "httpcore2",
    "google_genai",
    "google.genai",
    "urllib3",
)

# Python level name -> the name the Node API (pino) writes, so `level` filters work on both.
_LEVEL_NAMES = {
    "DEBUG": "debug",
    "INFO": "info",
    "WARNING": "warn",
    "ERROR": "error",
    "CRITICAL": "fatal",
}


def redact(text: str) -> str:
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


def sanitize_error_summary(error: BaseException | str, *, max_length: int = 120) -> str:
    """Return a privacy-safe error summary: exception class only or redacted short label."""
    if isinstance(error, BaseException):
        return type(error).__name__
    cleaned = redact(str(error)).replace("\n", " ").replace("\r", " ").strip()
    return cleaned[:max_length] if cleaned else "unknown_error"


def _clean_value(value: Any) -> Any:
    if value is None or isinstance(value, bool | int):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        return redact(value)[:_MAX_TEXT_LENGTH]
    if isinstance(value, list | tuple):
        return [_clean_value(item) for item in value[:_MAX_LIST_ITEMS] if _is_scalar(item)]
    return (
        f"<{type(value).__name__}>"  # never serialize an arbitrary object: it could hold user data
    )


def _is_scalar(value: Any) -> bool:
    return value is None or isinstance(value, str | int | float | bool)


def clean_fields(fields: dict[str, Any]) -> dict[str, Any]:
    """Make event fields safe to print: primitives only, bounded size, sensitive names masked."""
    cleaned: dict[str, Any] = {}
    for key, value in fields.items():
        normalized = re.sub(r"[^a-z0-9]", "", str(key).lower())
        cleaned[str(key)] = (
            "[redacted]" if normalized in _SENSITIVE_FIELD_NAMES else _clean_value(value)
        )
    return cleaned


def log_event(
    logger: logging.Logger,
    event: str,
    *,
    level: int = logging.INFO,
    message: str | None = None,
    **fields: Any,
) -> None:
    """Write one structured event. `event` is a stable dotted name (`ai.call.completed`);
    `fields` are metadata (see the module docstring); `message` is optional human text."""
    if logger.isEnabledFor(level):
        logger.log(level, message or event, extra={"event": event, "fields": fields})


class ContextFilter(logging.Filter):
    """Copies the request-scoped ids onto every record so the formatters can print them."""

    def filter(self, record: logging.LogRecord) -> bool:
        context = {
            "correlationId": correlation_id_var.get(),
            "aiRequestId": ai_request_id_var.get(),
            "feature": feature_var.get(),
            "traceId": trace_id_var.get(),
            "spanId": span_id_var.get(),
            "parentSpanId": parent_span_id_var.get(),
        }
        record.context = {k: v for k, v in context.items() if v is not None}
        return True


def _record_fields(record: logging.LogRecord) -> dict[str, Any]:
    """Context ids first, then the event's own fields (which may override them)."""
    merged: dict[str, Any] = dict(getattr(record, "context", {}))
    merged.update(clean_fields(getattr(record, "fields", {})))
    return merged


def _iso_time(created: float) -> str:
    return (
        datetime.fromtimestamp(created, UTC)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


class JsonFormatter(logging.Formatter):
    """One JSON object per line, then masks secrets in the whole line (including exception text)."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "time": _iso_time(record.created),
            "level": _LEVEL_NAMES.get(record.levelname, record.levelname.lower()),
            "service": SERVICE_NAME,
            "logger": record.name,
        }
        event = getattr(record, "event", None)
        if event:
            payload["event"] = event
        payload["msg"] = record.getMessage()
        payload.update(_record_fields(record))
        if record.exc_info:
            payload["stack"] = self.formatException(record.exc_info)
        return redact(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str))


class TextFormatter(logging.Formatter):
    """Readable `time LEVEL logger message key=value ...` lines for local development."""

    def format(self, record: logging.LogRecord) -> str:
        pairs = " ".join(
            f"{k}={json.dumps(v, ensure_ascii=False)}" for k, v in _record_fields(record).items()
        )
        line = f"{_iso_time(record.created)} {record.levelname} {record.name} {record.getMessage()}"
        if pairs:
            line = f"{line} {pairs}"
        if record.exc_info:
            line = f"{line}\n{self.formatException(record.exc_info)}"
        return redact(line)


def configure_logging(level: str = "INFO", log_format: str = "json") -> None:
    """Idempotent: safe to call on every startup and in tests. Calling again switches the format."""
    app_logger = logging.getLogger("onusfit_ai")
    app_logger.setLevel(level if level in logging.getLevelNamesMapping() else "INFO")
    handler = next((h for h in app_logger.handlers if getattr(h, "_onusfit_stdout", False)), None)
    if handler is None:
        handler = logging.StreamHandler(sys.stdout)
        handler._onusfit_stdout = True  # type: ignore[attr-defined]
        handler.addFilter(ContextFilter())
        app_logger.addHandler(handler)
    handler.setFormatter(TextFormatter() if log_format == "text" else JsonFormatter())
    for name in _QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
