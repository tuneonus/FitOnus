"""Distributed tracing primitives with W3C `traceparent` propagation and bounded spans.

Pure stdlib implementation so any inner application layer or shared LLM module can propagate
trace context across Node.js, Python FastAPI, Gemini, RAG, MCP, and agent workflows without
pulling in heavy OpenTelemetry SDK packages or breaking clean architecture boundaries.
"""

import contextvars
import re
import secrets
import threading
import time
from collections import deque
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass, field
from typing import Any, Final

from onusfit_ai.shared.logging.logging import (
    SERVICE_NAME,
    ai_request_id_var,
    clean_fields,
    correlation_id_var,
    parent_span_id_var,
    span_id_var,
    trace_id_var,
)

TRACEPARENT_HEADER: Final = "traceparent"
_TRACEPARENT_RE: Final = re.compile(r"^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$")
_ZERO_TRACE_ID: Final = "0" * 32
_ZERO_SPAN_ID: Final = "0" * 16
_DEFAULT_MAX_SPANS: Final = 500
_SAFE_HEADER_ID: Final = re.compile(r"^[A-Za-z0-9._-]{8,128}$")


def new_trace_id() -> str:
    """Generate a non-zero 128-bit W3C hex trace ID."""
    return secrets.token_hex(16)


def new_span_id() -> str:
    """Generate a non-zero 64-bit W3C hex span ID."""
    return secrets.token_hex(8)


@dataclass(frozen=True)
class TraceContext:
    """Immutable distributed trace context carried across process and async boundaries."""

    trace_id: str
    span_id: str
    parent_span_id: str | None = None
    trace_flags: str = "01"
    correlation_id: str | None = None
    ai_request_id: str | None = None

    def to_traceparent(self) -> str:
        return f"00-{self.trace_id}-{self.span_id}-{self.trace_flags}"


def parse_traceparent(header: str | None) -> TraceContext | None:
    """Parse a W3C `traceparent` header safely, returning None on malformed or zero IDs."""
    if not header or not isinstance(header, str):
        return None
    normalized = header.strip().lower()
    match = _TRACEPARENT_RE.fullmatch(normalized)
    if not match:
        return None
    trace_id, span_id, trace_flags = match.groups()
    if trace_id == _ZERO_TRACE_ID or span_id == _ZERO_SPAN_ID:
        return None
    return TraceContext(
        trace_id=trace_id,
        span_id=new_span_id(),
        parent_span_id=span_id,
        trace_flags=trace_flags,
    )


def create_root_trace_context(
    *,
    correlation_id: str | None = None,
    ai_request_id: str | None = None,
    traceparent: str | None = None,
) -> TraceContext:
    """Create a request TraceContext, continuing an upstream valid `traceparent` if supplied."""
    parsed = parse_traceparent(traceparent)
    if parsed is not None:
        return TraceContext(
            trace_id=parsed.trace_id,
            span_id=parsed.span_id,
            parent_span_id=parsed.parent_span_id,
            trace_flags=parsed.trace_flags,
            correlation_id=correlation_id,
            ai_request_id=ai_request_id,
        )
    return TraceContext(
        trace_id=new_trace_id(),
        span_id=new_span_id(),
        parent_span_id=None,
        trace_flags="01",
        correlation_id=correlation_id,
        ai_request_id=ai_request_id,
    )


def create_child_span_context(parent: TraceContext | None = None) -> TraceContext:
    """Derive a child span context preserving trace_id and setting parent_span_id."""
    active = parent or current_trace_context()
    if active is None:
        return create_root_trace_context(
            correlation_id=correlation_id_var.get(),
            ai_request_id=ai_request_id_var.get(),
        )
    return TraceContext(
        trace_id=active.trace_id,
        span_id=new_span_id(),
        parent_span_id=active.span_id,
        trace_flags=active.trace_flags,
        correlation_id=active.correlation_id or correlation_id_var.get(),
        ai_request_id=active.ai_request_id or ai_request_id_var.get(),
    )


def current_trace_context() -> TraceContext | None:
    """Read the active TraceContext from contextvars, or None when outside a trace."""
    trace_id = trace_id_var.get()
    span_id = span_id_var.get()
    if not trace_id or not span_id:
        return None
    return TraceContext(
        trace_id=trace_id,
        span_id=span_id,
        parent_span_id=parent_span_id_var.get(),
        correlation_id=correlation_id_var.get(),
        ai_request_id=ai_request_id_var.get(),
    )


@dataclass(frozen=True)
class TraceContextTokens:
    trace_token: contextvars.Token[str | None]
    span_token: contextvars.Token[str | None]
    parent_span_token: contextvars.Token[str | None]


def bind_trace_context(ctx: TraceContext) -> TraceContextTokens:
    """Bind TraceContext fields into contextvars so logs and child spans inherit them."""
    return TraceContextTokens(
        trace_token=trace_id_var.set(ctx.trace_id),
        span_token=span_id_var.set(ctx.span_id),
        parent_span_token=parent_span_id_var.set(ctx.parent_span_id),
    )


def reset_trace_context(tokens: TraceContextTokens) -> None:
    """Restore contextvars bound by `bind_trace_context`."""
    trace_id_var.reset(tokens.trace_token)
    span_id_var.reset(tokens.span_token)
    parent_span_id_var.reset(tokens.parent_span_token)


def build_propagation_headers(
    *,
    correlation_id: str | None = None,
    ai_request_id: str | None = None,
    trace_context: TraceContext | None = None,
) -> dict[str, str]:
    """Return safe outbound headers for propagating correlation and trace context."""
    headers: dict[str, str] = {}
    ctx = trace_context or current_trace_context()
    if ctx is not None:
        headers[TRACEPARENT_HEADER] = ctx.to_traceparent()
    corr = correlation_id or (ctx.correlation_id if ctx else None) or correlation_id_var.get()
    if corr and _SAFE_HEADER_ID.fullmatch(corr):
        headers["X-Correlation-Id"] = corr
    req_id = ai_request_id or (ctx.ai_request_id if ctx else None) or ai_request_id_var.get()
    if req_id and _SAFE_HEADER_ID.fullmatch(req_id):
        headers["X-Request-Id"] = req_id
    return headers


@dataclass(frozen=True)
class SpanRecord:
    """Completed execution span with bounded, sanitized metadata only."""

    trace_id: str
    span_id: str
    parent_span_id: str | None
    service: str
    operation: str
    status: str
    duration_ms: float
    started_at_monotonic: float
    correlation_id: str | None = None
    ai_request_id: str | None = None
    error_category: str | None = None
    attributes: dict[str, Any] = field(default_factory=dict)


class BoundedSpanRecorder:
    """Thread-safe ring buffer holding recent completed spans with bounded memory."""

    def __init__(self, max_spans: int = _DEFAULT_MAX_SPANS) -> None:
        self._max_spans = max(1, max_spans)
        self._spans: deque[SpanRecord] = deque(maxlen=self._max_spans)
        self._lock = threading.Lock()

    @property
    def capacity(self) -> int:
        return self._max_spans

    def record(self, span: SpanRecord) -> None:
        with self._lock:
            self._spans.append(span)

    def recent_spans(self, *, trace_id: str | None = None, limit: int = 100) -> list[SpanRecord]:
        with self._lock:
            items = list(self._spans)
        if trace_id is not None:
            items = [s for s in items if s.trace_id == trace_id]
        if limit > 0:
            items = items[-limit:]
        return items

    def count(self) -> int:
        with self._lock:
            return len(self._spans)

    def clear(self) -> None:
        with self._lock:
            self._spans.clear()


default_span_recorder = BoundedSpanRecorder()


class SpanHandle:
    """Mutable handle passed into `start_span` / `start_async_span` blocks."""

    def __init__(self, context: TraceContext) -> None:
        self.context = context
        self.status: str = "ok"
        self.error_category: str | None = None
        self.attributes: dict[str, Any] = {}

    def set_attribute(self, key: str, value: Any) -> None:
        if len(self.attributes) < 24:
            self.attributes[key] = value

    def mark_error(self, error_category: str) -> None:
        self.status = "error"
        self.error_category = error_category


def _finalize_span(
    recorder: BoundedSpanRecorder,
    handle: SpanHandle,
    operation: str,
    service: str,
    started: float,
) -> None:
    try:
        elapsed_ms = round(max(0.0, (time.monotonic() - started) * 1000.0), 3)
        safe_attrs = clean_fields(handle.attributes)
        recorder.record(
            SpanRecord(
                trace_id=handle.context.trace_id,
                span_id=handle.context.span_id,
                parent_span_id=handle.context.parent_span_id,
                service=service,
                operation=operation[:80],
                status=handle.status,
                duration_ms=elapsed_ms,
                started_at_monotonic=started,
                correlation_id=handle.context.correlation_id,
                ai_request_id=handle.context.ai_request_id,
                error_category=handle.error_category,
                attributes=safe_attrs,
            )
        )
    except Exception:  # noqa: BLE001 - observability must never break application flow
        return


@contextmanager
def start_span(
    operation: str,
    *,
    service: str = SERVICE_NAME,
    attributes: dict[str, Any] | None = None,
    recorder: BoundedSpanRecorder | None = None,
) -> Iterator[SpanHandle]:
    """Create and bind a child span around a synchronous block (fail-open)."""
    target_recorder = recorder or default_span_recorder
    child = create_child_span_context()
    tokens = bind_trace_context(child)
    handle = SpanHandle(child)
    if attributes:
        for k, v in list(attributes.items())[:24]:
            handle.set_attribute(k, v)
    started = time.monotonic()
    try:
        yield handle
    except Exception as exc:
        if handle.status != "error":
            handle.mark_error(type(exc).__name__)
        raise
    finally:
        _finalize_span(target_recorder, handle, operation, service, started)
        reset_trace_context(tokens)


@asynccontextmanager
async def start_async_span(
    operation: str,
    *,
    service: str = SERVICE_NAME,
    attributes: dict[str, Any] | None = None,
    recorder: BoundedSpanRecorder | None = None,
) -> AsyncIterator[SpanHandle]:
    """Create and bind a child span around an async coroutine block (fail-open)."""
    target_recorder = recorder or default_span_recorder
    child = create_child_span_context()
    tokens = bind_trace_context(child)
    handle = SpanHandle(child)
    if attributes:
        for k, v in list(attributes.items())[:24]:
            handle.set_attribute(k, v)
    started = time.monotonic()
    try:
        yield handle
    except Exception as exc:
        if handle.status != "error":
            handle.mark_error(type(exc).__name__)
        raise
    finally:
        _finalize_span(target_recorder, handle, operation, service, started)
        reset_trace_context(tokens)
