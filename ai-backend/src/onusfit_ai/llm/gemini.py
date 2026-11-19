"""The only module that talks to Google Gemini.

Behavior mirrors the Node implementation (backend/src/shared/ai/gemini-client.ts +
modules/app-settings/.../gemini-runtime-service.ts):
  * one attempt on the primary model, at most one attempt on the fallback model,
  * the fallback is only used for failures that another model could fix (never for bad API keys
    or a project-wide daily quota),
  * a model that just failed is put in a short cooldown,
  * no generic retries: every attempt may be billed, so retrying blindly could double the cost,
  * the whole thing runs inside one total deadline chosen by Node.
"""

import asyncio
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

from fastapi import Depends
from google import genai
from google.genai import types

from onusfit_ai.core.config import Settings, get_settings
from onusfit_ai.core.errors import AiError
from onusfit_ai.core.logging import log_event
from onusfit_ai.core.observability import category_for_gemini_kind
from onusfit_ai.llm.errors import ClassifiedError, ModelCooldown, classify_gemini_error

logger = logging.getLogger("onusfit_ai.llm")

# Do not start another attempt when less than this much of the deadline is left.
_MIN_ATTEMPT_SECONDS = 1.0

# Same wording as the Node implementation (user-facing, contains nothing from Google).
_BUSY_MESSAGE = (
    "The AI Coach is experiencing high demand right now. Please wait a moment and try again."
)


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


@dataclass(frozen=True)
class MediaInput:
    """An audio/image clip sent to Gemini together with the prompt."""

    mime_type: str
    data: bytes


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
    ) -> LlmResult: ...


class GeminiClient:
    def __init__(
        self,
        api_key: str | None,
        *,
        attempt_timeout_s: float = 20.0,
        sdk_client: Any | None = None,
        cooldown: ModelCooldown | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._api_key = api_key
        self._attempt_timeout_s = attempt_timeout_s
        self._sdk = sdk_client  # injected in tests; created lazily from the key otherwise
        self._cooldown = cooldown or ModelCooldown(clock)
        self._clock = clock

    def _sdk_client(self) -> Any:
        if self._sdk is None:
            if not self._api_key:
                raise AiError(
                    status_code=503,
                    code="PROVIDER_NOT_CONFIGURED",
                    message="Gemini API key is not configured on the AI backend.",
                )
            self._sdk = genai.Client(api_key=self._api_key)
        return self._sdk

    async def generate_text(
        self,
        prompt: str,
        *,
        primary_model: str,
        fallback_model: str | None,
        deadline_s: float,
        media: MediaInput | None = None,
    ) -> LlmResult:
        sdk = (
            self._sdk_client()
        )  # raises PROVIDER_NOT_CONFIGURED (dispatched=False) before any call
        started = self._clock()
        deadline = started + deadline_s

        fallback = fallback_model if fallback_model and fallback_model != primary_model else None
        fallback_ok = fallback is not None and self._cooldown.is_available(fallback)
        plan: list[tuple[str, bool]]  # (model, is_fallback)
        if self._cooldown.is_available(primary_model):
            plan = [(primary_model, False)]
            if fallback is not None and fallback_ok:
                plan.append((fallback, True))
        elif fallback is not None and fallback_ok:
            plan = [(fallback, True)]
            # The primary failed recently, so it is skipped without a call: logged as a fallback.
            log_event(
                logger,
                "ai.gemini.model_skipped",
                level=logging.WARNING,
                message="primary model is cooling down; using the fallback model",
                model=primary_model,
                reason="cooldown",
                cooldownRemainingSeconds=self._cooldown.remaining_seconds(primary_model),
            )
        else:
            wait = max(
                self._cooldown.remaining_seconds(primary_model),
                self._cooldown.remaining_seconds(fallback or primary_model),
            )
            raise AiError(
                status_code=503,
                code="AI_UNAVAILABLE",
                message=_BUSY_MESSAGE,
                retry_after_seconds=wait or 20,
                dispatched=False,  # nothing was sent to Gemini
            )

        last: ClassifiedError | None = None
        attempts = 0
        for index, (model, is_fallback) in enumerate(plan):
            remaining = deadline - self._clock()
            if remaining < _MIN_ATTEMPT_SECONDS:
                break
            attempts += 1
            attempt_started = self._clock()
            try:
                response = await self._call(
                    sdk, model, prompt, min(remaining, self._attempt_timeout_s), media
                )
            except Exception as exc:  # noqa: BLE001 - every SDK/network failure is classified below
                last = classify_gemini_error(exc)
                self._cooldown.record_failure(model, last.retry_after_seconds)
                can_try_next = last.is_retryable and not last.is_project_wide
                will_fallback = index < len(plan) - 1 and can_try_next
                # Log the category only: provider error text can contain request fragments.
                log_event(
                    logger,
                    "ai.gemini.attempt_failed",
                    level=logging.WARNING,
                    message="gemini attempt failed",
                    model=model,
                    modelFallbackUsed=is_fallback,
                    errorCategory=category_for_gemini_kind(last.kind),
                    geminiKind=last.kind,
                    durationMs=round((self._clock() - attempt_started) * 1000),
                    willTryFallbackModel=will_fallback,
                )
                if not will_fallback:
                    break
                continue

            self._cooldown.record_success(model)
            return LlmResult(
                text=(response.text or "").strip(),
                usage=_usage_from(response, model, is_fallback, self._clock() - attempt_started),
            )

        raise _to_ai_error(last, attempts_made=attempts)

    async def _call(
        self, sdk: Any, model: str, prompt: str, timeout_s: float, media: MediaInput | None = None
    ) -> Any:
        config = types.GenerateContentConfig(
            http_options=types.HttpOptions(
                timeout=int(timeout_s * 1000),
                retry_options=types.HttpRetryOptions(attempts=1),  # 1 = no SDK-level retries
            )
        )
        # Same content order as the former Node client: the clip first, then the prompt.
        contents: Any = (
            [types.Part.from_bytes(data=media.data, mime_type=media.mime_type), prompt]
            if media
            else prompt
        )
        async with asyncio.timeout(timeout_s):
            return await sdk.aio.models.generate_content(
                model=model, contents=contents, config=config
            )


def _usage_from(response: Any, model: str, is_fallback: bool, elapsed_s: float) -> LlmUsage:
    meta = getattr(response, "usage_metadata", None)
    input_tokens = getattr(meta, "prompt_token_count", None) or 0
    output_tokens = getattr(meta, "candidates_token_count", None) or 0
    cached = getattr(meta, "cached_content_token_count", None) or 0
    thinking = getattr(meta, "thoughts_token_count", None) or 0
    total = getattr(meta, "total_token_count", None) or (input_tokens + output_tokens)
    return LlmUsage(
        model=model,
        is_fallback=is_fallback,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_tokens=cached,
        thinking_tokens=thinking,
        total_tokens=total,
        duration_ms=int(elapsed_s * 1000),
    )


def _to_ai_error(last: ClassifiedError | None, *, attempts_made: int) -> AiError:
    """Turn the final failure into a safe wire error. Nothing from Google leaks out."""
    if last is None:
        # The deadline ran out before any attempt could start.
        return AiError(
            status_code=504,
            code="PROVIDER_TIMEOUT",
            message="AI request timed out. Please try again.",
            dispatched=False,
        )
    if last.kind == "AUTH_ERROR":
        return AiError(
            status_code=503,
            code="PROVIDER_AUTH_ERROR",
            dispatched=True,
            message="AI service configuration error. Please ensure credentials are valid.",
        )
    if attempts_made > 1:  # primary AND fallback both failed
        return AiError(
            status_code=503,
            code="AI_UNAVAILABLE",
            dispatched=True,
            message=_BUSY_MESSAGE,
            retry_after_seconds=last.retry_after_seconds,
        )
    if last.kind == "QUOTA_EXHAUSTED_RPD" and last.is_project_wide:
        return AiError(
            status_code=429,
            code="PROVIDER_QUOTA_EXHAUSTED",
            dispatched=True,
            message="Daily AI Coach capacity has been reached. Please check back tomorrow.",
            retry_after_seconds=last.retry_after_seconds,
        )
    if last.kind in ("RATE_LIMIT_RPM", "QUOTA_EXHAUSTED_RPD"):
        return AiError(
            status_code=429,
            code="PROVIDER_RATE_LIMITED",
            dispatched=True,
            message=_BUSY_MESSAGE,
            retry_after_seconds=last.retry_after_seconds,
        )
    if last.kind == "TIMEOUT":
        return AiError(
            status_code=504,
            code="PROVIDER_TIMEOUT",
            dispatched=True,
            message="AI request timed out. Please try again.",
        )
    if last.kind in ("HIGH_DEMAND_503", "MODEL_NOT_FOUND"):
        return AiError(
            status_code=503,
            code="PROVIDER_UNAVAILABLE",
            dispatched=True,
            message="AI service is experiencing temporary peak demand. Please try again shortly.",
            retry_after_seconds=last.retry_after_seconds or None,
        )
    return AiError(
        status_code=503,
        code="PROVIDER_ERROR",
        dispatched=True,
        message="AI service is temporarily unavailable. Please try again.",
    )


# One client per process so the cooldown state survives between requests.
_shared: dict[str | None, GeminiClient] = {}


def get_llm(settings: Settings = Depends(get_settings)) -> TextGenerator:
    """FastAPI dependency. Tests replace it with `app.dependency_overrides[get_llm]`."""
    key = settings.gemini_api_key
    if key not in _shared:
        _shared.clear()
        _shared[key] = GeminiClient(key, attempt_timeout_s=settings.gemini_attempt_timeout_s)
    return _shared[key]
