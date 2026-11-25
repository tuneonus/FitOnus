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
import hashlib
import json
import logging
import time
from collections.abc import Awaitable, Callable, Sequence
from typing import Any

from google import genai
from google.genai import types
from pydantic import BaseModel

from onusfit_ai.shared.contracts.tools import (
    TOOL_GET_NUTRITION_SUMMARY,
    TOOL_GET_RECENT_WORKOUTS,
    TOOL_GET_WEIGHT_TREND,
    TOOL_SEARCH_EXERCISES,
    GetNutritionSummaryArgs,
    GetRecentWorkoutsArgs,
    GetWeightTrendArgs,
    SearchExercisesArgs,
)
from onusfit_ai.shared.llm.errors import (
    ClassifiedError,
    LlmServiceError,
    ModelCooldown,
    classify_gemini_error,
)
from onusfit_ai.shared.llm.ports import (
    EmbeddingResult,
    LlmResult,
    LlmUsage,
    MediaInput,
    ToolExecutionResult,
    sanitize_tool_error,
)
from onusfit_ai.shared.logging.logging import log_event
from onusfit_ai.shared.observability.observability import category_for_gemini_kind
from onusfit_ai.shared.utils.audio import estimate_audio_duration_seconds

logger = logging.getLogger("onusfit_ai.llm")

# Do not start another attempt when less than this much of the deadline is left.
_MIN_ATTEMPT_SECONDS = 1.0

# Headroom required for the final synthesis request in a multi-turn tool calling loop.
_MIN_SYNTHESIS_SECONDS = 2.0

# Execution limits for multi-turn function calling
_DEFAULT_MAX_TOOL_ROUNDS = 3
_DEFAULT_MAX_TOOL_CALLS = 5
_TOOL_CONCURRENCY_LIMIT = 3

# Same wording as the Node implementation (user-facing, contains nothing from Google).
_BUSY_MESSAGE = (
    "The AI Coach is experiencing high demand right now. Please wait a moment and try again."
)


def _normalize_media_inputs(
    media: MediaInput | Sequence[MediaInput] | None,
) -> tuple[MediaInput, ...]:
    if media is None:
        return ()
    if isinstance(media, MediaInput):
        return (media,)
    return tuple(media)


def estimate_multimodal_input_tokens(
    prompt: str,
    media: MediaInput | Sequence[MediaInput] | None = None,
    system_instruction: str | None = None,
) -> int:
    """Estimate pre-flight input tokens across text and image/audio parts for budget guards."""
    text_chars = len(prompt) + (len(system_instruction) if system_instruction else 0)
    tokens = max(1, (text_chars + 3) // 4)
    for item in _normalize_media_inputs(media):
        mime = item.mime_type.lower()
        if mime.startswith("image/"):
            # Base tile cost + bounded binary scaling for high-resolution images.
            tokens += 258 + min(1548, (len(item.data) // (512 * 1024)) * 258)
        elif mime.startswith("audio/"):
            duration_s = estimate_audio_duration_seconds(item.data)
            if duration_s is not None:
                tokens += max(32, int(duration_s * 32))
            else:
                tokens += max(32, len(item.data) // 1000)
        else:
            tokens += max(64, len(item.data) // 1024)
    return tokens


def _fingerprint_request(
    *,
    user_id: str | None,
    primary_model: str,
    fallback_model: str | None,
    prompt: str,
    media_items: tuple[MediaInput, ...],
    schema: type[BaseModel] | None,
    max_total_tokens: int | None,
    max_output_tokens: int | None,
    system_instruction: str | None,
) -> str:
    hasher = hashlib.sha256()
    hasher.update((f"user:{user_id}" if user_id is not None else "user:__none__").encode())
    hasher.update(b"\x00")
    hasher.update(primary_model.encode())
    hasher.update(b"\x00")
    hasher.update((fallback_model or "").encode())
    hasher.update(b"\x00")
    hasher.update((system_instruction or "").encode())
    hasher.update(b"\x00")
    hasher.update(prompt.encode())
    hasher.update(b"\x00")
    hasher.update((schema.__name__ if schema is not None else "").encode())
    hasher.update(f"\x00{max_total_tokens}\x00{max_output_tokens}".encode())
    for item in media_items:
        hasher.update(b"\x00")
        hasher.update(item.mime_type.encode())
        hasher.update(hashlib.sha256(item.data).digest())
    return hasher.hexdigest()


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
        self._inflight: dict[str, asyncio.Task[LlmResult]] = {}
        self._inflight_waiters: dict[str, int] = {}

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
        media: MediaInput | Sequence[MediaInput] | None = None,
        schema: type[BaseModel] | None = None,
        tools: list[Any] | None = None,
        tool_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None = None,
        max_tool_rounds: int = _DEFAULT_MAX_TOOL_ROUNDS,
        max_total_tool_calls: int = _DEFAULT_MAX_TOOL_CALLS,
        max_total_tokens: int | None = None,
        max_output_tokens: int | None = None,
        system_instruction: str | None = None,
        user_id: str | None = None,
    ) -> LlmResult:
        """Execute text or multimodal generation with budget checks, dedup, cooldown, and fallback.

        Flow:
        1. Verifies SDK initialization (fails fast if GEMINI_API_KEY is not configured).
        2. Checks pre-flight multimodal token budget when ``max_total_tokens`` is specified.
        3. Coalesces concurrent identical single-turn calls to prevent duplicate Gemini spend.
        4. Determines execution plan: primary model first; fallback if primary is cooling down.
        5. Enforces total deadline budget; attempts are clamped to GEMINI_ATTEMPT_TIMEOUT_S.
        6. If primary fails with retryable error, tries fallback before deadline expires.
        7. Records model failures into cooldown tracker (circuit breaker).
        8. When schema is supplied, configures response_schema and response_mime_type.
        9. When tools and tool_handler are supplied, coordinates multi-turn function
           calling loop with bounded concurrency, request-scoped caching, error sanitization,
           and token budgeting.
        """
        sdk = (
            self._sdk_client()
        )  # raises PROVIDER_NOT_CONFIGURED (dispatched=False) before any call
        media_items = _normalize_media_inputs(media)

        if max_total_tokens is not None:
            estimated_input = estimate_multimodal_input_tokens(
                prompt,
                media_items,
                system_instruction=system_instruction,
            )
            if estimated_input > max_total_tokens:
                raise LlmServiceError(
                    code="INVALID_REQUEST",
                    message="Request exceeds the allowed AI token budget.",
                    dispatched=False,
                )

        # Normalize empty/whitespace user_id so unauthenticated strings never coalesce accidentally.
        scoped_user_id = user_id.strip() if user_id is not None else None
        if (not tools or tool_handler is None) and (user_id is None or bool(scoped_user_id)):
            dedup_key = _fingerprint_request(
                user_id=scoped_user_id,
                primary_model=primary_model,
                fallback_model=fallback_model,
                prompt=prompt,
                media_items=media_items,
                schema=schema,
                max_total_tokens=max_total_tokens,
                max_output_tokens=max_output_tokens,
                system_instruction=system_instruction,
            )
            existing = self._inflight.get(dedup_key)
            if existing is not None and not existing.done():
                log_event(
                    logger,
                    "ai.gemini.request_deduplicated",
                    level=logging.INFO,
                    message="coalesced duplicate concurrent gemini request",
                    model=primary_model,
                )
                task = existing
            else:

                async def _run_single() -> LlmResult:
                    try:
                        return await self._execute_plan(
                            sdk=sdk,
                            prompt=prompt,
                            primary_model=primary_model,
                            fallback_model=fallback_model,
                            deadline_s=deadline_s,
                            media_items=media_items,
                            schema=schema,
                            tools=None,
                            tool_handler=None,
                            max_tool_rounds=max_tool_rounds,
                            max_total_tool_calls=max_total_tool_calls,
                            max_total_tokens=max_total_tokens,
                            max_output_tokens=max_output_tokens,
                            system_instruction=system_instruction,
                        )
                    finally:
                        if self._inflight.get(dedup_key) is task:
                            self._inflight.pop(dedup_key, None)

                task = asyncio.create_task(_run_single())
                self._inflight[dedup_key] = task

            self._inflight_waiters[dedup_key] = self._inflight_waiters.get(dedup_key, 0) + 1
            try:
                res = await asyncio.shield(task)
                return LlmResult(
                    text=res.text,
                    usage=res.usage,
                    parsed=res.parsed,
                    finish_reason=res.finish_reason,
                    tool_calls=list(res.tool_calls),
                )
            finally:
                remaining_waiters = self._inflight_waiters.get(dedup_key, 1) - 1
                if remaining_waiters <= 0:
                    self._inflight_waiters.pop(dedup_key, None)
                    if not task.done():
                        task.cancel()
                        if self._inflight.get(dedup_key) is task:
                            self._inflight.pop(dedup_key, None)
                else:
                    self._inflight_waiters[dedup_key] = remaining_waiters

        return await self._execute_plan(
            sdk=sdk,
            prompt=prompt,
            primary_model=primary_model,
            fallback_model=fallback_model,
            deadline_s=deadline_s,
            media_items=media_items,
            schema=schema,
            tools=tools,
            tool_handler=tool_handler,
            max_tool_rounds=max_tool_rounds,
            max_total_tool_calls=max_total_tool_calls,
            max_total_tokens=max_total_tokens,
            max_output_tokens=max_output_tokens,
            system_instruction=system_instruction,
        )

    async def _execute_plan(
        self,
        *,
        sdk: Any,
        prompt: str,
        primary_model: str,
        fallback_model: str | None,
        deadline_s: float,
        media_items: tuple[MediaInput, ...],
        schema: type[BaseModel] | None,
        tools: list[Any] | None,
        tool_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None,
        max_tool_rounds: int,
        max_total_tool_calls: int,
        max_total_tokens: int | None,
        max_output_tokens: int | None,
        system_instruction: str | None,
    ) -> LlmResult:
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

        # Request-scoped tool execution cache: persists across model fallback attempts
        # to ensure zero duplicate HTTP/DB calls for identical read-only tool calls.
        tool_cache: dict[tuple[str, str], dict[str, Any]] = {}

        last: ClassifiedError | None = None
        attempts = 0
        for index, (model, is_fallback) in enumerate(plan):
            remaining = deadline - self._clock()
            if remaining < _MIN_ATTEMPT_SECONDS:
                break
            attempts += 1
            attempt_started = self._clock()
            try:
                if tools and tool_handler is not None:
                    response, executed_tool_results, turn_usage = await self._call_multi_turn(
                        sdk,
                        model,
                        prompt,
                        deadline=deadline,
                        media_items=media_items,
                        schema=schema,
                        tools=tools,
                        tool_handler=tool_handler,
                        tool_cache=tool_cache,
                        max_tool_rounds=max_tool_rounds,
                        max_total_tool_calls=max_total_tool_calls,
                        max_total_tokens=max_total_tokens,
                        max_output_tokens=max_output_tokens,
                        system_instruction=system_instruction,
                    )
                else:
                    response = await self._call(
                        sdk,
                        model,
                        prompt,
                        min(remaining, self._attempt_timeout_s),
                        media_items=media_items,
                        schema=schema,
                        max_output_tokens=max_output_tokens,
                        system_instruction=system_instruction,
                    )
                    executed_tool_results = []
                    turn_usage = None
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
                    raw_finish.name if hasattr(raw_finish, "name") else str(raw_finish)
                )

            parsed_obj = getattr(response, "parsed", None)
            resp_text = (getattr(response, "text", None) or "").strip()

            if parsed_obj is None and schema is not None and resp_text:
                try:
                    from onusfit_ai.shared.utils.js_compat import strip_code_fences

                    data = json.loads(strip_code_fences(resp_text))
                    if isinstance(data, dict):
                        parsed_obj = schema.model_validate(data)
                except Exception:
                    parsed_obj = None

            if turn_usage is not None:
                usage = LlmUsage(
                    model=model,
                    is_fallback=is_fallback,
                    input_tokens=turn_usage["input_tokens"],
                    output_tokens=turn_usage["output_tokens"],
                    cached_tokens=turn_usage["cached_tokens"],
                    thinking_tokens=turn_usage["thinking_tokens"],
                    total_tokens=turn_usage["total_tokens"],
                    duration_ms=round((self._clock() - attempt_started) * 1000),
                )
            else:
                usage = _usage_from(response, model, is_fallback, self._clock() - attempt_started)

            return LlmResult(
                text=resp_text,
                usage=usage,
                parsed=parsed_obj,
                finish_reason=finish_reason_name,
                tool_calls=executed_tool_results,
            )

        raise _to_llm_error(last, attempts_made=attempts)

    async def _call_multi_turn(
        self,
        sdk: Any,
        model: str,
        prompt: str,
        *,
        deadline: float,
        media_items: tuple[MediaInput, ...] = (),
        schema: type[BaseModel] | None = None,
        tools: list[Any],
        tool_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]],
        tool_cache: dict[tuple[str, str], dict[str, Any]],
        max_tool_rounds: int = _DEFAULT_MAX_TOOL_ROUNDS,
        max_total_tool_calls: int = _DEFAULT_MAX_TOOL_CALLS,
        max_total_tokens: int | None = None,
        max_output_tokens: int | None = None,
        system_instruction: str | None = None,
    ) -> tuple[Any, list[ToolExecutionResult], dict[str, int]]:
        round_count = 0
        total_tool_calls = 0
        executed_tool_results: list[ToolExecutionResult] = []
        accumulated_usage = {
            "input_tokens": 0,
            "output_tokens": 0,
            "cached_tokens": 0,
            "thinking_tokens": 0,
            "total_tokens": 0,
        }
        semaphore = asyncio.Semaphore(_TOOL_CONCURRENCY_LIMIT)

        # Build initial contents
        initial_parts: list[types.Part] = [
            types.Part.from_bytes(data=item.data, mime_type=item.mime_type) for item in media_items
        ]
        initial_parts.append(types.Part.from_text(text=prompt))
        contents: list[types.Content] = [types.Content(role="user", parts=initial_parts)]

        final_response: Any = None

        while True:
            remaining = deadline - self._clock()
            if remaining < _MIN_SYNTHESIS_SECONDS:
                raise TimeoutError(
                    "Insufficient deadline remaining for AI tool execution/synthesis"
                )

            turn_timeout_s = min(remaining, self._attempt_timeout_s)

            tools_enabled = (
                round_count < max_tool_rounds
                and total_tool_calls < max_total_tool_calls
                and (
                    max_total_tokens is None or accumulated_usage["total_tokens"] < max_total_tokens
                )
            )

            config_kwargs: dict[str, Any] = {
                "http_options": types.HttpOptions(
                    timeout=int(turn_timeout_s * 1000),
                    retry_options=types.HttpRetryOptions(attempts=1),
                )
            }
            if max_output_tokens is not None:
                config_kwargs["max_output_tokens"] = max_output_tokens
            if system_instruction is not None:
                config_kwargs["system_instruction"] = system_instruction

            if tools_enabled:
                config_kwargs["tools"] = tools
            else:
                config_kwargs["tool_config"] = types.ToolConfig(
                    function_calling_config=types.FunctionCallingConfig(
                        mode=types.FunctionCallingConfigMode.NONE
                    )
                )
                if schema is not None:
                    config_kwargs["response_mime_type"] = "application/json"
                    config_kwargs["response_schema"] = schema

            config = types.GenerateContentConfig(**config_kwargs)

            async with asyncio.timeout(turn_timeout_s):
                response = await sdk.aio.models.generate_content(
                    model=model, contents=contents, config=config
                )

            final_response = response

            meta = getattr(response, "usage_metadata", None)
            turn_input = getattr(meta, "prompt_token_count", None) or 0
            turn_output = getattr(meta, "candidates_token_count", None) or 0
            turn_cached = getattr(meta, "cached_content_token_count", None) or 0
            turn_thinking = getattr(meta, "thoughts_token_count", None) or 0
            turn_total = getattr(meta, "total_token_count", None) or (turn_input + turn_output)

            accumulated_usage["input_tokens"] += turn_input
            accumulated_usage["output_tokens"] += turn_output
            accumulated_usage["cached_tokens"] += turn_cached
            accumulated_usage["thinking_tokens"] += turn_thinking
            accumulated_usage["total_tokens"] += turn_total

            function_calls = getattr(response, "function_calls", None) or []
            if not function_calls or not tools_enabled:
                if schema is not None and not getattr(response, "parsed", None):
                    resp_text = (getattr(response, "text", None) or "").strip()
                    parsed_ok = False
                    if resp_text:
                        try:
                            from onusfit_ai.shared.utils.js_compat import strip_code_fences

                            parsed_data = json.loads(strip_code_fences(resp_text))
                            if isinstance(parsed_data, dict):
                                schema.model_validate(parsed_data)
                                parsed_ok = True
                        except Exception:
                            parsed_ok = False
                    if not parsed_ok and (round_count > 0 or not tools_enabled):
                        round_count = max_tool_rounds
                        continue
                break

            round_count += 1
            candidate = response.candidates[0] if getattr(response, "candidates", None) else None
            model_content = getattr(candidate, "content", None)
            if model_content is None:
                model_content = types.Content(
                    role="model",
                    parts=[types.Part(function_call=fc) for fc in function_calls],
                )

            async def _run_single(fc: Any) -> tuple[Any, dict[str, Any]]:
                nonlocal total_tool_calls
                call_name = getattr(fc, "name", str(fc))
                raw_args = getattr(fc, "args", {}) or {}
                if not isinstance(raw_args, dict):
                    raw_args = dict(raw_args)

                if total_tool_calls >= max_total_tool_calls:
                    return fc, {
                        "error": f"Tool execution limit of {max_total_tool_calls} calls exceeded."
                    }

                total_tool_calls += 1
                cache_key = (call_name, json.dumps(raw_args, sort_keys=True))
                if cache_key in tool_cache:
                    return fc, tool_cache[cache_key]

                try:
                    async with semaphore:
                        res = await tool_handler(call_name, raw_args)
                except Exception as exc:
                    res = sanitize_tool_error(call_name, exc)

                tool_cache[cache_key] = res
                return fc, res

            call_results = await asyncio.gather(*[_run_single(fc) for fc in function_calls])

            response_parts: list[types.Part] = []
            for fc, res in call_results:
                call_name = getattr(fc, "name", str(fc))
                raw_args = getattr(fc, "args", {}) or {}
                if not isinstance(raw_args, dict):
                    raw_args = dict(raw_args)

                executed_tool_results.append(
                    ToolExecutionResult(tool_name=call_name, args=raw_args, result=res)
                )
                response_parts.append(
                    types.Part.from_function_response(name=call_name, response=res)
                )

            contents.append(model_content)
            contents.append(types.Content(role="user", parts=response_parts))

        return final_response, executed_tool_results, accumulated_usage

    async def _call(
        self,
        sdk: Any,
        model: str,
        prompt: str,
        timeout_s: float,
        media_items: tuple[MediaInput, ...] = (),
        schema: type[BaseModel] | None = None,
        max_output_tokens: int | None = None,
        system_instruction: str | None = None,
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
        if max_output_tokens is not None:
            config_kwargs["max_output_tokens"] = max_output_tokens
        if system_instruction is not None:
            config_kwargs["system_instruction"] = system_instruction
        config = types.GenerateContentConfig(**config_kwargs)

        # Same content order as the former Node client: media clips first, then the prompt.
        contents: Any = (
            [
                *[
                    types.Part.from_bytes(data=item.data, mime_type=item.mime_type)
                    for item in media_items
                ],
                prompt,
            ]
            if media_items
            else prompt
        )
        async with asyncio.timeout(timeout_s):
            return await sdk.aio.models.generate_content(
                model=model, contents=contents, config=config
            )

    def _build_model_plan(
        self,
        primary_model: str,
        fallback_model: str | None,
    ) -> list[tuple[str, bool]]:
        fallback = fallback_model if fallback_model and fallback_model != primary_model else None
        fallback_ok = fallback is not None and self._cooldown.is_available(fallback)
        if self._cooldown.is_available(primary_model):
            plan: list[tuple[str, bool]] = [(primary_model, False)]
            if fallback is not None and fallback_ok:
                plan.append((fallback, True))
            return plan
        if fallback is not None and fallback_ok:
            log_event(
                logger,
                "ai.gemini.model_skipped",
                level=logging.WARNING,
                message="primary model is cooling down; using the fallback model",
                model=primary_model,
                reason="cooldown",
                cooldownRemainingSeconds=self._cooldown.remaining_seconds(primary_model),
            )
            return [(fallback, True)]
        wait = max(
            self._cooldown.remaining_seconds(primary_model),
            self._cooldown.remaining_seconds(fallback or primary_model),
        )
        raise LlmServiceError(
            code="AI_UNAVAILABLE",
            message=_BUSY_MESSAGE,
            retry_after_seconds=wait or 20,
            dispatched=False,
        )

    async def embed_content(
        self,
        contents: list[str],
        *,
        model: str = "gemini-embedding-001",
        output_dimensionality: int = 768,
        task_type: str = "RETRIEVAL_DOCUMENT",
        title: str | None = None,
    ) -> list[EmbeddingResult]:
        """Generate vector embeddings using Google Gemini gemini-embedding-001.

        Uses output_dimensionality=768 (Matryoshka Representation Learning)
        and semantic task_type for asymmetric retrieval.
        """
        if not contents:
            return []

        sdk = self._sdk_client()
        config_kwargs: dict[str, Any] = {
            "task_type": task_type,
            "output_dimensionality": output_dimensionality,
        }
        if title:
            config_kwargs["title"] = title

        config = types.EmbedContentConfig(**config_kwargs)

        try:
            response = await sdk.aio.models.embed_content(
                model=model,
                contents=contents,
                config=config,
            )
            raw_embeddings = getattr(response, "embeddings", None) or []
            return [
                EmbeddingResult(values=list(getattr(emb, "values", []))) for emb in raw_embeddings
            ]
        except Exception as exc:  # noqa: BLE001
            classified = classify_gemini_error(exc)
            log_event(
                logger,
                "ai.gemini.embed_failed",
                level=logging.WARNING,
                message="gemini embedding attempt failed",
                model=model,
                errorCategory=category_for_gemini_kind(classified.kind),
                geminiKind=classified.kind,
            )
            raise _to_llm_error(classified, attempts_made=1) from exc


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


def get_coach_tool_declarations() -> list[types.FunctionDeclaration]:
    """Return Gemini FunctionDeclaration objects for all AI Coach tools."""
    return [
        types.FunctionDeclaration(
            name=TOOL_GET_RECENT_WORKOUTS,
            description=(
                "Retrieve the authenticated user's recent completed workouts, exercise volume, "
                "and personal records. Use when the user asks about recent training, strength "
                "gains, or workout consistency."
            ),
            parameters_json_schema=GetRecentWorkoutsArgs.model_json_schema(),
        ),
        types.FunctionDeclaration(
            name=TOOL_GET_NUTRITION_SUMMARY,
            description=(
                "Retrieve the authenticated user's daily nutrition consumption (calories, "
                "protein, carbs, fat, water intake) and target comparisons. Use when the user "
                "asks about diet, macros, calorie balance, or water intake."
            ),
            parameters_json_schema=GetNutritionSummaryArgs.model_json_schema(),
        ),
        types.FunctionDeclaration(
            name=TOOL_GET_WEIGHT_TREND,
            description=(
                "Retrieve the authenticated user's body weight history logs and current progress "
                "toward their target weight. Use when the user asks about weight loss, weight "
                "gain, or weigh-in trends."
            ),
            parameters_json_schema=GetWeightTrendArgs.model_json_schema(),
        ),
        types.FunctionDeclaration(
            name=TOOL_SEARCH_EXERCISES,
            description=(
                "Search the verified exercise catalog by name, muscle group, or equipment. "
                "Use when recommending alternative movements, explaining technique, or answering "
                "exercise-specific questions."
            ),
            parameters_json_schema=SearchExercisesArgs.model_json_schema(),
        ),
    ]


def get_coach_tools() -> list[types.Tool]:
    """Return the Gemini Tool instance containing all coach function declarations."""
    return [types.Tool(function_declarations=get_coach_tool_declarations())]


def create_gemini_tools_from_schemas(tool_schemas: list[dict[str, Any]]) -> list[types.Tool]:
    """Helper converting tool definitions into Gemini Tool format."""
    decls: list[types.FunctionDeclaration] = []
    for s in tool_schemas:
        schema_dict = s.get("input_schema", {})
        cleaned = {
            k: v
            for k, v in schema_dict.items()
            if k not in ("$schema", "title", "additionalProperties")
        }
        parsed = types.Schema.model_validate(cleaned)
        decls.append(
            types.FunctionDeclaration(
                name=s["name"],
                description=s.get("description", ""),
                parameters=parsed,
            )
        )
    return [types.Tool(function_declarations=decls)]
