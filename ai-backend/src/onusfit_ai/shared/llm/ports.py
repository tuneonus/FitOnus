"""What the use cases need from an LLM: plain data types and one Protocol, nothing else.

This module imports no SDK, no FastAPI and no other part of the app, so the domain and application
layers can depend on it without dragging Gemini or HTTP along. The only real implementation is
`gemini.GeminiClient`; tests provide a fake with the same shape (see tests/conftest.py `FakeLlm`).
"""

from dataclasses import dataclass
from typing import Any, Protocol

from pydantic import BaseModel


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
        media: MediaInput | None = None,
        schema: type[BaseModel] | None = None,
    ) -> LlmResult: ...
