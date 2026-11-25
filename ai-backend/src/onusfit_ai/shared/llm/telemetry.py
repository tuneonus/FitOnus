"""The one log event every AI use case writes when Gemini has answered.

Replaces five hand-written `logger.info("... trace=%s ...")` lines, so the fields are identical for
every feature and match what the Node API logs for the same call (`ai.call.completed`).

Metadata only: the use cases pass the model's usage numbers, the outcome and a few counts. They
never pass the prompt, the user's message, the context, a transcript, an image or the reply.
"""

import logging
from typing import Final

from onusfit_ai.shared.llm.ports import LlmUsage
from onusfit_ai.shared.logging.logging import llm_metrics_recorded_var, log_event
from onusfit_ai.shared.logging.metrics import metrics_registry

# Outcomes meaning "the model answered but its output was not usable". `no_food` is NOT one of them:
# "this photo has no food" is a valid answer. Must match INVALID_OUTPUT_OUTCOMES in the Node API.
INVALID_OUTPUT_OUTCOMES: Final = frozenset({"unusable", "parse_failed", "unstructured"})


def log_ai_call(
    logger: logging.Logger,
    *,
    feature: str,
    trace_id: str,
    prompt_version: str,
    outcome: str,
    usage: LlmUsage,
    record_metrics: bool = True,
    **counts: int | bool,
) -> None:
    """`counts` are small per-feature numbers such as `items=3` or `audio_bytes=48211`."""
    unusable = outcome in INVALID_OUTPUT_OUTCOMES
    error_category = "invalid_ai_response" if unusable else None
    if record_metrics:
        try:
            metrics_registry.record_llm_call(
                feature=feature,
                model=usage.model,
                duration_ms=float(usage.duration_ms),
                success=not unusable,
                input_tokens=usage.input_tokens,
                output_tokens=usage.output_tokens,
                cached_tokens=usage.cached_tokens,
                thinking_tokens=usage.thinking_tokens,
                total_tokens=usage.total_tokens,
                is_fallback=usage.is_fallback,
                error_category=error_category,
            )
            llm_metrics_recorded_var.set(True)
        except Exception:  # noqa: BLE001 - observability must never break AI calls
            pass

    log_event(
        logger,
        "ai.call.completed",
        message=f"{feature} answered",
        feature=feature,
        aiRequestId=trace_id,
        promptVersion=prompt_version,
        success=not unusable,
        outcome=outcome,
        errorCategory=error_category,
        model=usage.model,
        modelFallbackUsed=usage.is_fallback,
        geminiDurationMs=usage.duration_ms,
        inputTokens=usage.input_tokens,
        outputTokens=usage.output_tokens,
        cachedTokens=usage.cached_tokens,
        thinkingTokens=usage.thinking_tokens,
        totalTokens=usage.total_tokens,
        **{_camel(name): value for name, value in counts.items()},
    )


def _camel(snake: str) -> str:
    head, *rest = snake.split("_")
    return head + "".join(part.capitalize() for part in rest)
