"""Meal photo use case: photo -> Gemini (vision) -> structured food items and totals.

Pure orchestration (no HTTP, no database), so it is testable with a fake LLM. Quota, authentication
and the decision "may this user do this now" stay in Node.
"""

import logging
import time
from datetime import UTC, datetime

from onusfit_ai.features.meals.application.parsing import now_iso, one_decimal
from onusfit_ai.features.meals.application.photo_parsing import (
    FOOD_SUMMARY,
    NO_FOOD_REASON,
    NO_FOOD_SUMMARY,
    MealPhotoOutcome,
    _empty_result,
    parse_meal_photo_output,
)
from onusfit_ai.features.meals.application.prompts.meal_photo import PROMPT_VERSION, build_prompt
from onusfit_ai.features.meals.application.schemas import (
    GeminiPhotoMealOutput,
    is_meal_photo_structured_output_enabled,
)
from onusfit_ai.features.meals.domain.detected_food import DetectedFoodItem
from onusfit_ai.features.meals.domain.photo import (
    AnalyzeMealPhotoRequest,
    AnalyzeMealPhotoResponse,
    MealPhotoResult,
)
from onusfit_ai.features.meals.domain.sanitize import sanitize_photo_result
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.llm.ports import LlmServiceError, MediaInput, TextGenerator
from onusfit_ai.shared.llm.telemetry import log_ai_call
from onusfit_ai.shared.logging import (
    MultimodalObservabilityTracker,
    classify_media_validation_error,
)
from onusfit_ai.shared.utils.image import decode_image_base64
from onusfit_ai.shared.utils.js_compat import js_round, strict_json_loads, strip_code_fences
from onusfit_ai.shared.utils.media import InvalidMediaError

logger = logging.getLogger("onusfit_ai.meal_photo")


def _error_category_for_llm_code(code: str) -> str:
    return {
        "PROVIDER_TIMEOUT": "gemini_timeout",
        "PROVIDER_RATE_LIMITED": "gemini_rate_limited",
        "PROVIDER_QUOTA_EXHAUSTED": "gemini_quota_exhausted",
        "PROVIDER_UNAVAILABLE": "gemini_unavailable",
        "AI_UNAVAILABLE": "gemini_unavailable",
        "PROVIDER_AUTH_ERROR": "gemini_auth",
        "PROVIDER_NOT_CONFIGURED": "gemini_auth",
    }.get(code, "gemini_error")


async def analyze_meal_photo(
    request: AnalyzeMealPhotoRequest, llm: TextGenerator, *, trace_id: str
) -> AnalyzeMealPhotoResponse:
    """Orchestrate meal photo analysis using Gemini vision models.

    Validates base64 image bytes up front (fails 422 before calling Gemini), calls multimodal LLM,
    parses items, and bounds all macros and calories to realistic human nutritional limits.
    """
    tracker = MultimodalObservabilityTracker(
        modality="image",
        feature="meal_photo",
        trace_id=trace_id,
    )
    # Refuses corrupt images (422, dispatched=False) before any Gemini call.
    val_started = time.monotonic()
    try:
        raw_bytes = decode_image_base64(request.image.base64)
    except InvalidMediaError as exc:
        tracker.record_validation_failure(
            duration_ms=(time.monotonic() - val_started) * 1000.0,
            reason=classify_media_validation_error(str(exc)),
        )
        raise
    media = MediaInput(mime_type=request.image.mime_type, data=raw_bytes)
    tracker.record_validation_success(
        duration_ms=(time.monotonic() - val_started) * 1000.0,
        byte_size=len(media.data),
        mime_type=request.image.mime_type,
        exif_stripped=False,
    )

    use_structured = is_meal_photo_structured_output_enabled()
    schema = GeminiPhotoMealOutput if use_structured else None

    try:
        llm_result = await llm.generate_text(
            build_prompt(request.meal_type, request.notes),
            primary_model=request.model.primary,
            fallback_model=request.model.fallback,
            deadline_s=request.deadline_ms / 1000,
            media=media,
            schema=schema,
        )
    except LlmServiceError as exc:
        tracker.record_processing_completed(
            model=exc.usage.model if exc.usage else request.model.primary,
            outcome="error",
            processing_error=True,
            error_category=_error_category_for_llm_code(exc.code),
        )
        raise

    # 1. Defensively handle safety-blocked content
    if llm_result.finish_reason == "SAFETY":
        tracker.record_processing_completed(
            model=llm_result.usage.model,
            outcome="safety_blocked",
            processing_error=True,
            error_category="gemini_unavailable",
        )
        raise LlmServiceError(
            code="PROVIDER_UNAVAILABLE",
            message="Meal photo analysis was blocked by safety policies.",
            dispatched=True,
            usage=llm_result.usage,
        )

    # 2. Defensively handle token truncation
    if llm_result.finish_reason == "MAX_TOKENS":
        tracker.record_processing_completed(
            model=llm_result.usage.model,
            outcome="max_tokens",
            processing_error=True,
            error_category="gemini_error",
        )
        raise LlmServiceError(
            code="PROVIDER_ERROR",
            message="Meal photo analysis exceeded maximum token limit.",
            dispatched=True,
            usage=llm_result.usage,
        )

    # 3. Resolve result and outcome
    result: MealPhotoResult
    outcome: MealPhotoOutcome

    if use_structured:
        parsed_output: GeminiPhotoMealOutput | None = None

        if isinstance(llm_result.parsed, GeminiPhotoMealOutput):
            parsed_output = llm_result.parsed
        elif isinstance(llm_result.parsed, dict):
            try:
                parsed_output = GeminiPhotoMealOutput.model_validate(llm_result.parsed)
            except Exception:
                parsed_output = None
        elif llm_result.text and llm_result.text.strip():
            try:
                data = strict_json_loads(strip_code_fences(llm_result.text))
                if isinstance(data, dict):
                    parsed_output = GeminiPhotoMealOutput.model_validate(data)
            except Exception:
                parsed_output = None

        if parsed_output is None:
            tracker.record_processing_completed(
                model=llm_result.usage.model,
                outcome="parse_failed",
                processing_error=True,
                error_category="invalid_ai_response",
            )
            log_ai_call(
                logger,
                feature="meal_photo",
                trace_id=trace_id,
                prompt_version=PROMPT_VERSION,
                outcome="parse_failed",
                usage=llm_result.usage,
                items=0,
                image_bytes=len(media.data),
            )
            msg = (
                "Empty response from Meal Photo model in structured mode."
                if not llm_result.text or not llm_result.text.strip()
                else "Invalid structured response from Meal Photo model."
            )
            raise LlmServiceError(
                code="PROVIDER_ERROR",
                message=msg,
                dispatched=True,
                usage=llm_result.usage,
            )

        if not parsed_output.is_food or len(parsed_output.items) == 0:
            outcome = "no_food"
            result = _empty_result(
                parsed_output.summary.strip()
                if parsed_output.summary and parsed_output.summary.strip()
                else NO_FOOD_SUMMARY,
                parsed_output.unclear_reason.strip()
                if parsed_output.unclear_reason and parsed_output.unclear_reason.strip()
                else NO_FOOD_REASON,
            )
        else:
            now_ms = int(datetime.now(UTC).timestamp() * 1000)
            items = [
                DetectedFoodItem(
                    id=f"ai-food-{now_ms}-{index}",
                    name=(
                        item.name.strip()
                        if item.name and item.name.strip()
                        else f"Food Item {index + 1}"
                    ),
                    brand="AI Estimate",
                    serving=(
                        item.portion_description.strip()
                        if item.portion_description and item.portion_description.strip()
                        else f"{item.serving_weight_g or 100:g}g"
                    ),
                    serving_weight_g=(
                        item.serving_weight_g if item.serving_weight_g is not None else 100.0
                    ),
                    serving_unit=(
                        item.serving_unit.strip()
                        if item.serving_unit and item.serving_unit.strip()
                        else "serving"
                    ),
                    serving_size=item.serving_size if item.serving_size is not None else 1.0,
                    kcal=max(0, js_round(item.calories)),
                    protein=max(0.0, one_decimal(item.protein_g)),
                    carbs=max(0.0, one_decimal(item.carbs_g)),
                    fat=max(0.0, one_decimal(item.fat_g)),
                    fiber=max(0.0, one_decimal(item.fiber_g or 0)),
                    confidence=item.confidence,
                    is_ai_estimated=True,
                )
                for index, item in enumerate(parsed_output.items)
            ]

            total_kcal = 0
            protein = carbs = fat = fiber = 0.0
            for item in items:
                total_kcal += int(item.kcal)
                protein += item.protein
                carbs += item.carbs
                fat += item.fat
                fiber += item.fiber or 0

            top_conf = parsed_output.confidence
            overall_conf = 0.9 if top_conf == "high" else 0.5 if top_conf == "low" else 0.75
            outcome = "ok"
            result = MealPhotoResult(
                is_food=True,
                summary=(
                    parsed_output.summary.strip()
                    if parsed_output.summary and parsed_output.summary.strip()
                    else FOOD_SUMMARY
                ),
                items=items,
                overall_confidence=overall_conf,
                total_kcal=total_kcal,
                total_protein_grams=one_decimal(protein),
                total_carbs_grams=one_decimal(carbs),
                total_fat_grams=one_decimal(fat),
                total_fiber_grams=one_decimal(fiber),
                unclear_reason=parsed_output.unclear_reason,
                analyzed_at=now_iso(),
            )
    else:
        result, outcome = parse_meal_photo_output(llm_result.text)

    # Bound whatever the model claimed before it can reach a member (see meals/domain/sanitize.py).
    result = sanitize_photo_result(result)

    usage = llm_result.usage
    # Metadata only: the image, the notes and the model's reply are never logged.
    log_ai_call(
        logger,
        feature="meal_photo",
        trace_id=trace_id,
        prompt_version=PROMPT_VERSION,
        outcome=outcome,
        usage=usage,
        items=len(result.items),
        image_bytes=len(media.data),
    )
    tracker.record_processing_completed(
        model=usage.model,
        outcome=outcome,
        processing_error=(outcome == "parse_failed"),
        error_category=("invalid_ai_response" if outcome == "parse_failed" else None),
    )
    return AnalyzeMealPhotoResponse(
        outcome=outcome,
        result=result,
        usage=Usage(**{k: getattr(usage, k) for k in Usage.model_fields}),
        trace_id=trace_id,
    )
