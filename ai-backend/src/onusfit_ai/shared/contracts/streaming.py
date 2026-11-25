"""Pure Server-Sent Events (SSE) contracts and privacy/safety sanitizers.

Zero framework (FastAPI/Starlette) and zero provider SDK dependencies so domain,
application, and presentation layers can share strongly typed streaming contracts.
"""

from __future__ import annotations

import json
import re
from typing import Any, Literal

from pydantic import Field

from onusfit_ai.shared.contracts._base import ContractModel

SseEventType = Literal["start", "status", "delta", "complete", "error", "heartbeat"]

StreamStage = Literal[
    "connecting",
    "routing",
    "thinking",
    "tool_calling",
    "agent_working",
    "synthesizing",
    "streaming",
    "complete",
    "cancelled",
    "error",
]

_RE_GOOGLE_KEY = re.compile(r"AIza[0-9A-Za-z_\-]{20,}")
_RE_SK_KEY = re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}\b")
_RE_BEARER = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/\-]+=*")
_RE_JWT = re.compile(r"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]*")
_RE_INTERNAL_URL = re.compile(
    r"https?://(?:127\.0\.0\.1|localhost|0\.0\.0\.0|10\.\d+\.\d+\.\d+|"
    r"172\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)[^\s'\"]*",
    re.IGNORECASE,
)
_RE_INTERNAL_IP = re.compile(
    r"\b(?:127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"192\.168\.\d{1,3}\.\d{1,3})(?::\d+)?\b"
)
_RE_BREAKOUT_TAGS = re.compile(
    r"</?(?:retrieved_knowledge|knowledge_source|system|context_manifest|thought|thinking)[^>]*>",
    re.IGNORECASE,
)

_SAFE_ERROR_MESSAGE_BY_CODE: dict[str, str] = {
    "FEATURE_DISABLED": "Streaming AI Coach is currently disabled.",
    "RATE_LIMITED": "Too many requests. Please slow down and try again shortly.",
    "AI_QUOTA_EXCEEDED": "Daily AI Coach limit reached. Please try again tomorrow.",
    "PROVIDER_RATE_LIMITED": (
        "The AI Coach is experiencing high demand right now. Please wait a moment and try again."
    ),
    "PROVIDER_QUOTA_EXHAUSTED": (
        "Daily AI Coach capacity has been reached. Please check back tomorrow."
    ),
    "PROVIDER_TIMEOUT": "AI request timed out. Please try again.",
    "DEADLINE_EXCEEDED": "AI request timed out. Please try again.",
    "PROVIDER_UNAVAILABLE": "The AI Coach is temporarily unavailable. Please try again shortly.",
    "AI_UNAVAILABLE": (
        "The AI Coach is experiencing high demand right now. Please wait a moment and try again."
    ),
    "PROVIDER_AUTH_ERROR": "AI service configuration error. Please try again later.",
    "PROVIDER_NOT_CONFIGURED": "AI service is not configured.",
    "PROVIDER_ERROR": "Unable to complete your coaching response right now. Please try again.",
    "SAFETY_BLOCKED": "Coach response was blocked by safety policies.",
    "MAX_TOKENS": "Coach response reached the maximum length limit.",
    "INVALID_REQUEST": "Invalid coaching request.",
    "STREAM_CANCELLED": "Generation stopped.",
    "STREAM_INTERRUPTED": "Connection interrupted before completion.",
    "INTERNAL_ERROR": "An unexpected error occurred while streaming. Please try again.",
}

_RETRYABLE_ERROR_CODES: frozenset[str] = frozenset(
    {
        "PROVIDER_RATE_LIMITED",
        "PROVIDER_TIMEOUT",
        "DEADLINE_EXCEEDED",
        "PROVIDER_UNAVAILABLE",
        "AI_UNAVAILABLE",
        "PROVIDER_ERROR",
        "STREAM_INTERRUPTED",
    }
)


def sanitize_stream_delta(chunk_text: str) -> str:
    """Redact accidental secrets, internal hosts, and prompt-injection tags from streamed text."""
    if not chunk_text:
        return ""
    from onusfit_ai.shared.utils.guardrails import (
        redact_runtime_secrets,
        sanitize_untrusted_text,
    )

    cleaned = _RE_GOOGLE_KEY.sub("[redacted]", chunk_text)
    cleaned = _RE_SK_KEY.sub("[redacted]", cleaned)
    cleaned = _RE_BEARER.sub("Bearer [redacted]", cleaned)
    cleaned = _RE_JWT.sub("[redacted]", cleaned)
    cleaned = _RE_INTERNAL_URL.sub("[redacted-endpoint]", cleaned)
    cleaned = _RE_INTERNAL_IP.sub("[redacted-host]", cleaned)
    cleaned = _RE_BREAKOUT_TAGS.sub("", cleaned)
    cleaned = redact_runtime_secrets(cleaned)
    return sanitize_untrusted_text(cleaned, strip_outer=False)


def sanitize_stream_error_message(code: str, fallback: str | None = None) -> str:
    """Return a strictly safe domain error message for SSE error frames.

    Never echoes raw provider messages, stack traces, internal URLs, keys, or user PII.
    """
    if code in _SAFE_ERROR_MESSAGE_BY_CODE:
        return _SAFE_ERROR_MESSAGE_BY_CODE[code]
    if fallback and code == "INVALID_REQUEST":
        safe = sanitize_stream_delta(fallback).replace("\n", " ").strip()
        return safe[:160] or _SAFE_ERROR_MESSAGE_BY_CODE["INVALID_REQUEST"]
    return _SAFE_ERROR_MESSAGE_BY_CODE["INTERNAL_ERROR"]


def is_retryable_stream_error(code: str) -> bool:
    """Return True when the failure is transient and safe for client retry or fallback."""
    return code in _RETRYABLE_ERROR_CODES


class StreamStartEvent(ContractModel):
    type: Literal["start"] = "start"
    trace_id: str
    request_id: str
    model: str
    timestamp: str


class StreamStatusEvent(ContractModel):
    type: Literal["status"] = "status"
    stage: StreamStage
    message: str = Field(max_length=160)
    agent_role: str | None = Field(default=None, max_length=40)
    tool_name: str | None = Field(default=None, max_length=64)
    step_index: int | None = Field(default=None, ge=0)
    total_steps: int | None = Field(default=None, ge=0)
    trace_id: str


class StreamDeltaEvent(ContractModel):
    type: Literal["delta"] = "delta"
    delta: str
    sequence: int = Field(ge=0)
    trace_id: str


class StreamErrorEvent(ContractModel):
    type: Literal["error"] = "error"
    code: str = Field(max_length=64)
    message: str = Field(max_length=300)
    dispatched: bool = True
    retryable: bool = False
    retry_after_seconds: int | None = Field(default=None, ge=0)
    has_partial: bool = False
    trace_id: str


class StreamHeartbeatEvent(ContractModel):
    type: Literal["heartbeat"] = "heartbeat"
    timestamp: str
    trace_id: str


def serialize_sse_data(payload: ContractModel | dict[str, Any]) -> str:
    if isinstance(payload, ContractModel):
        return payload.model_dump_json(by_alias=True)
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def format_sse_frame(
    event_type: SseEventType,
    payload: ContractModel | dict[str, Any],
    *,
    event_id: str | int | None = None,
) -> str:
    """Encode a single Server-Sent Events frame compliant with the WHATWG SSE specification."""
    lines: list[str] = []
    if event_id is not None:
        safe_id = str(event_id).replace("\r", "").replace("\n", "")
        lines.append(f"id: {safe_id}")
    lines.append(f"event: {event_type}")
    data_json = serialize_sse_data(payload)
    for data_line in data_json.splitlines() or ["{}"]:
        lines.append(f"data: {data_line}")
    return "\n".join(lines) + "\n\n"
