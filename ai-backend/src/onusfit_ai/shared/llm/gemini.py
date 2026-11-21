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
from typing import Any

from google import genai
from google.genai import types
from pydantic import BaseModel

from onusfit_ai.shared.llm.errors import (
    ClassifiedError,
    LlmServiceError,
    ModelCooldown,
    classify_gemini_error,
)
from onusfit_ai.shared.llm.ports import LlmResult, LlmUsage, MediaInput
from onusfit_ai.shared.logging.logging import log_event
from onusfit_ai.shared.observability.observability import category_for_gemini_kind

logger = logging.getLogger("onusfit_ai.llm")

# Do not start another attempt when less than this much of the deadline is left.
_MIN_ATTEMPT_SECONDS = 1.0

# Same wording as the Node implementation (user-facing, contains nothing from Google).
_BUSY_MESSAGE = (
    "The AI Coach is experiencing high demand right now. Please wait a moment and try again."
)


class GeminiClient:
    """The real `TextGenerator` (Protocol: ports.py; FastAPI wiring: dependencies.py)."""

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
                raise LlmServiceError(
                    code="PROVIDER_NOT_CONFIGURED",
                    message="Gemini API key is not configured on the AI backend.",
                    dispatched=False,
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
        schema: type[BaseModel] | None = None,
    ) -> LlmResult:
        """Execute text generation with deadline enforcement, cooldown tracking, and fallback.

        Flow:
        1. Verifies SDK initialization (fails fast if GEMINI_API_KEY is not configured).
        2. Determines execution plan: primary model first; fallback if primary is cooling down.
        3. Enforces total deadline budget; attempts are clamped to GEMINI_ATTEMPT_TIMEOUT_S.
        4. If primary fails with retryable error, tries fallback before deadline expires.
        5. Records model failures into cooldown tracker (circuit breaker).
        6. When schema is supplied, configures response_schema and response_mime_type.
        """
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
            raise LlmServiceError(
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
                    sdk,
                    model,
                    prompt,
                    min(remaining, self._attempt_timeout_s),
                    media,
                    schema=schema,
                )
            except Exception as exc:  # noqa: BLE001 - every SDK/network failure is classified below
                last = classify_gemini_error(exc)
                if last.kind != "BAD_REQUEST":
                    # A 400 is about this one request (e.g. a clip Gemini cannot read), not the
                    # model's health: a cooldown would let one bad upload block every other user.
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

            candidate = response.candidates[0] if getattr(response, "candidates", None) else None
            raw_finish = getattr(candidate, "finish_reason", None)
            finish_reason_name: str | None = None
            if raw_finish is not None:
                finish_reason_name = (
                    raw_finish.name
                    if hasattr(raw_finish, "name")
                    else str(raw_finish)
                )

            parsed_obj = getattr(response, "parsed", None)
            resp_text = (getattr(response, "text", None) or "").strip()

            if parsed_obj is None and schema is not None and resp_text:
                try:
                    import json
                    from onusfit_ai.shared.utils.js_compat import strip_code_fences
                    data = json.loads(strip_code_fences(resp_text))
                    if isinstance(data, dict):
                        parsed_obj = schema.model_validate(data)
                except Exception:
                    parsed_obj = None

            return LlmResult(
                text=resp_text,
                usage=_usage_from(response, model, is_fallback, self._clock() - attempt_started),
                parsed=parsed_obj,
                finish_reason=finish_reason_name,
            )

        raise _to_llm_error(last, attempts_made=attempts)

    async def _call(
        self,
        sdk: Any,
        model: str,
        prompt: str,
        timeout_s: float,
        media: MediaInput | None = None,
        schema: type[BaseModel] | None = None,
    ) -> Any:
        config_kwargs: dict[str, Any] = {
            "http_options": types.HttpOptions(
                timeout=int(timeout_s * 1000),
                retry_options=types.HttpRetryOptions(attempts=1),  # 1 = no SDK-level retries
            )
        }
        if schema is not None:
            config_kwargs["response_mime_type"] = "application/json"
            config_kwargs["response_schema"] = schema
        config = types.GenerateContentConfig(**config_kwargs)

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


def _to_llm_error(last: ClassifiedError | None, *, attempts_made: int) -> LlmServiceError:
    """Turn the final failure into a safe LLM service error. Nothing from Google leaks out."""
    if last is None:
        # The deadline ran out before any attempt could start.
        return LlmServiceError(
            code="PROVIDER_TIMEOUT",
            message="AI request timed out. Please try again.",
            dispatched=False,
        )
    if last.kind == "AUTH_ERROR":
        return LlmServiceError(
            code="PROVIDER_AUTH_ERROR",
            dispatched=True,
            message="AI service configuration error. Please ensure credentials are valid.",
        )
    if attempts_made > 1:  # primary AND fallback both failed
        return LlmServiceError(
            code="AI_UNAVAILABLE",
            dispatched=True,
            message=_BUSY_MESSAGE,
            retry_after_seconds=last.retry_after_seconds,
        )
    if last.kind == "QUOTA_EXHAUSTED_RPD" and last.is_project_wide:
        return LlmServiceError(
            code="PROVIDER_QUOTA_EXHAUSTED",
            dispatched=True,
            message="Daily AI Coach capacity has been reached. Please check back tomorrow.",
            retry_after_seconds=last.retry_after_seconds,
        )
    if last.kind in ("RATE_LIMIT_RPM", "QUOTA_EXHAUSTED_RPD"):
        return LlmServiceError(
            code="PROVIDER_RATE_LIMITED",
            dispatched=True,
            message=_BUSY_MESSAGE,
            retry_after_seconds=last.retry_after_seconds,
        )
    if last.kind == "TIMEOUT":
        return LlmServiceError(
            code="PROVIDER_TIMEOUT",
            dispatched=True,
            message="AI request timed out. Please try again.",
        )
    if last.kind in ("HIGH_DEMAND_503", "MODEL_NOT_FOUND"):
        return LlmServiceError(
            code="PROVIDER_UNAVAILABLE",
            dispatched=True,
            message="AI service is experiencing temporary peak demand. Please try again shortly.",
            retry_after_seconds=last.retry_after_seconds or None,
        )
    return LlmServiceError(
        code="PROVIDER_ERROR",
        dispatched=True,
        message="AI service is temporarily unavailable. Please try again.",
    )
