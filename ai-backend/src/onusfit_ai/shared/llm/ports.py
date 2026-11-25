"""What the use cases need from an LLM: plain data types and one Protocol, nothing else.

This module imports no SDK, no FastAPI and no other part of the app, so the domain and application
layers can depend on it without dragging Gemini or HTTP along. The only real implementation is
`gemini.GeminiClient`; tests provide a fake with the same shape (see tests/conftest.py `FakeLlm`).
"""

import re
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

from pydantic import BaseModel

_RE_BEARER = re.compile(r"Bearer\s+[A-Za-z0-9\-_=.]+", re.IGNORECASE)
_RE_URL = re.compile(r"https?://[^\s'\"]+", re.IGNORECASE)
_RE_IP = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b")


def sanitize_tool_error(name: str, raw_error: Any) -> dict[str, Any]:
    """Sanitize any error into a safe, domain-level error dictionary for Gemini.

    Guarantees no internal URLs, ports, IP addresses, JWT tokens, DB schema names,
    or raw stack traces leak to the LLM.
    """
    raw_str = str(raw_error)
    cleaned = _RE_BEARER.sub("Bearer [REDACTED]", raw_str)
    cleaned = _RE_URL.sub("[INTERNAL_ENDPOINT]", cleaned)
    cleaned = _RE_IP.sub("[INTERNAL_HOST]", cleaned)

    lower = cleaned.lower()
    if "invalid arguments" in lower or "validation" in lower:
        msg = f"Invalid arguments provided for tool '{name}'."
    elif "status" in lower:
        msg = cleaned
    elif "timed out" in lower or "timeout" in lower:
        msg = f"Tool '{name}' timed out."
    elif "not found" in lower or "404" in cleaned:
        msg = f"Requested data not found for tool '{name}'."
    elif "network" in lower or "connection" in lower:
        msg = f"Tool '{name}' network failure"
    elif "limit" in lower and "exceeded" in lower:
        msg = cleaned
    else:
        msg = f"Tool '{name}' temporary failure"

    return {"error": msg}


@dataclass(frozen=True)
class ToolExecutionResult:
    tool_name: str
    args: dict[str, Any]
    result: dict[str, Any]


@dataclass(frozen=True)
class EmbeddingResult:
    """Vector representation of text output by Gemini embedding models."""

    values: list[float]


@dataclass(frozen=True)
class LlmUsage:
    model: str
    is_fallback: bool
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    thinking_tokens: int
    total_tokens: int
    duration_ms: int


@dataclass(frozen=True)
class LlmResult:
    text: str
    usage: LlmUsage
    parsed: Any | None = None
    finish_reason: str | None = None
    tool_calls: list[ToolExecutionResult] = field(default_factory=list)


@dataclass(frozen=True)
class LlmStreamChunk:
    """One incremental unit yielded by `StreamingTextGenerator.generate_text_stream`."""

    text_delta: str = ""
    model: str = ""
    is_fallback: bool = False
    usage: LlmUsage | None = None
    finish_reason: str | None = None
    tool_calls: list[ToolExecutionResult] = field(default_factory=list)
    is_final: bool = False


@dataclass(frozen=True)
class MediaInput:
    """An audio/image clip sent to Gemini together with the prompt."""

    mime_type: str
    data: bytes


class LlmServiceError(Exception):
    """Raised when LLM generation fails or response violates safety/limits.

    Pure infrastructure/adapter exception containing no HTTP status codes or web framework types.
    """

    def __init__(
        self,
        *,
        code: str,
        message: str,
        retry_after_seconds: int | None = None,
        dispatched: bool = False,
        usage: LlmUsage | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retry_after_seconds = retry_after_seconds
        self.dispatched = dispatched
        self.usage = usage


class TextGenerator(Protocol):
    """What the rest of the app needs from an LLM. Tests provide a fake with this shape."""

    async def generate_text(
        self,
        prompt: str,
        *,
        primary_model: str,
        fallback_model: str | None,
        deadline_s: float,
        media: MediaInput | Sequence[MediaInput] | None = None,
        schema: type[BaseModel] | None = None,
        tools: list[Any] | None = None,
        tool_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None = None,
        max_tool_rounds: int = 3,
        max_total_tool_calls: int = 5,
        max_total_tokens: int | None = None,
        max_output_tokens: int | None = None,
        system_instruction: str | None = None,
        user_id: str | None = None,
    ) -> LlmResult: ...


class StreamingTextGenerator(Protocol):
    """Optional streaming extension of TextGenerator using genuine incremental chunks."""

    def generate_text_stream(
        self,
        prompt: str,
        *,
        primary_model: str,
        fallback_model: str | None,
        deadline_s: float,
        media: MediaInput | Sequence[MediaInput] | None = None,
        schema: type[BaseModel] | None = None,
        tools: list[Any] | None = None,
        tool_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None = None,
        max_tool_rounds: int = 3,
        max_total_tool_calls: int = 5,
        max_total_tokens: int | None = None,
        max_output_tokens: int | None = None,
        system_instruction: str | None = None,
        user_id: str | None = None,
        on_tool_status: Callable[[str], Awaitable[None]] | None = None,
    ) -> AsyncIterator[LlmStreamChunk]: ...


class EmbeddingsGenerator(Protocol):
    """Protocol for generating text embeddings (e.g., gemini-embedding-001)."""

    async def embed_content(
        self,
        contents: list[str],
        *,
        model: str = "gemini-embedding-001",
        output_dimensionality: int = 768,
        task_type: str = "RETRIEVAL_DOCUMENT",
        title: str | None = None,
    ) -> list[EmbeddingResult]: ...
