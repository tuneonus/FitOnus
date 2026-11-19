"""Production-safe logging: one line per event on stdout, secrets masked, noisy libraries quiet.

Why this exists: under uvicorn nothing configures the `onusfit_ai.*` loggers, so the metadata lines
the use cases write (model, outcome, tokens, durations) were being dropped. Render collects stdout,
so this installs one stdout handler.

Rules (also enforced by tests): messages carry metadata only, never prompts, user data, replies,
images, audio, tokens or keys. As a second line of defence the handler masks anything that looks
like a Google API key or a bearer token, in case a library ever includes one.
"""

import logging
import re
import sys

_REDACTIONS = (
    (re.compile(r"AIza[0-9A-Za-z_\-]{20,}"), "[redacted-api-key]"),
    (re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/\-]+=*"), "Bearer [redacted]"),
    (re.compile(r"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]*"), "[redacted-jwt]"),
)

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


def redact(text: str) -> str:
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


class RedactingFormatter(logging.Formatter):
    """Formats the whole record (message and any exception text), then masks secrets."""

    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))


def configure_logging(level: str = "INFO") -> None:
    """Idempotent: safe to call on every startup (and in tests)."""
    app_logger = logging.getLogger("onusfit_ai")
    app_logger.setLevel(level if level in logging.getLevelNamesMapping() else "INFO")
    if not any(getattr(h, "_onusfit_stdout", False) for h in app_logger.handlers):
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            RedactingFormatter(
                "%(asctime)s %(levelname)s %(name)s %(message)s", "%Y-%m-%dT%H:%M:%S%z"
            )
        )
        handler._onusfit_stdout = True  # type: ignore[attr-defined]
        app_logger.addHandler(handler)
    for name in _QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
