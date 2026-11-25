"""Unified multimodal meal analysis orchestrator (text + audio + image)."""

import logging
import time
from datetime import UTC, datetime

import onusfit_ai.features.meals.domain.limits as limits
from onusfit_ai.features.meals.application.parsing import now_iso, one_decimal
from onusfit_ai.features.meals.application.photo_parsing import (
    NO_FOOD_REASON,
    NO_FOOD_SUMMARY,
)
from onusfit_ai.features.meals.application.prompts.multimodal_meal import (
    MULTIMODAL_SYSTEM_INSTRUCTION,
    PROMPT_VERSION,
    build_multimodal_prompt,
)
from onusfit_ai.features.meals.application.schemas import GeminiMultimodalMealOutput
from onusfit_ai.features.meals.domain.detected_food import Confidence, DetectedFoodItem
from onusfit_ai.features.meals.domain.multimodal import (
    AnalyzeMultimodalMealRequest,
    AnalyzeMultimodalMealResponse,
    Modality,
    MultimodalMealResult,
)
from onusfit_ai.features.meals.domain.sanitize import (
    compute_meal_totals,
    sanitize_food_items,
    sanitize_narrative_text,
)
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.llm.ports import LlmServiceError, MediaInput, TextGenerator
from onusfit_ai.shared.llm.telemetry import log_ai_call
from onusfit_ai.shared.logging import (
    MultimodalObservabilityTracker,
    classify_media_validation_error,
)
from onusfit_ai.shared.utils.audio import decode_audio_base64
from onusfit_ai.shared.utils.image import decode_image_base64, strip_jpeg_exif_metadata
from onusfit_ai.shared.utils.js_compat import js_round, strict_json_loads, strip_code_fences
from onusfit_ai.shared.utils.media import InvalidMediaError

logger = logging.getLogger("onusfit_ai.multimodal_meal")

MEDICAL_DISCLAIMER = (
    "Nutritional values are AI estimates for fitness tracking only, not medical or clinical advice."
)
UNCERTAINTY_HIGH_GUIDANCE = (
    "Portion sizes and hidden fats/oils are estimated from inputs; please review before saving."
)
_CONFIDENCE_SCORES: dict[Confidence, float] = {
    "high": 0.9,
    "medium": 0.7,
    "low": 0.4,
}


def _resolve_modalities(request: AnalyzeMultimodalMealRequest) -> list[Modality]:
    modalities: list[Modality] = []
    if request.transcript and request.transcript.strip():
        modalities.append("text")
    elif request.context and request.context.notes:
        modalities.append("text")
    if request.audio is not None:
        modalities.append("audio")
    if request.image is not None:
        modalities.append("image")
    return modalities


async def analyze_multimodal_meal(
    request: AnalyzeMultimodalMealRequest,
    llm: TextGenerator,
    *,
    trace_id: str,
    user_id: str | None = None,
    record_llm_metrics: bool = True,
) -> AnalyzeMultimodalMealResponse:
    """Fuse text, audio, and/or photo inputs into sanitized structured nutritional estimates."""
    modality = (
        "multimodal"
        if request.audio is not None and request.image is not None
        else (
            "image"
            if request.image is not None
            else ("audio" if request.audio is not None else "multimodal")
        )
    )
    tracker = MultimodalObservabilityTracker(
        modality=modality,
        feature="multimodal_meal",
        trace_id=trace_id,
    )
    media_inputs: list[MediaInput] = []
    audio_bytes_len = 0
    image_bytes_len = 0
    exif_stripped = False

    val_started = time.monotonic()
    try:
        if request.audio is not None:
            audio_bytes = decode_audio_base64(request.audio.base64)
            audio_bytes_len = len(audio_bytes)
            media_inputs.append(MediaInput(mime_type=request.audio.mime_type, data=audio_bytes))

        if request.image is not None:
            raw_image = decode_image_base64(
                request.image.base64, claimed_mime_type=request.image.mime_type
            )
            safe_image = strip_jpeg_exif_metadata(raw_image)
            image_bytes_len = len(safe_image)
            exif_stripped = len(safe_image) != len(raw_image)
            media_inputs.append(MediaInput(mime_type=request.image.mime_type, data=safe_image))
    except InvalidMediaError as exc:
        tracker.record_validation_failure(
            duration_ms=(time.monotonic() - val_started) * 1000.0,
            reason=classify_media_validation_error(str(exc)),
            byte_size=audio_bytes_len + image_bytes_len,
        )
        raise

    val_ms = (time.monotonic() - val_started) * 1000.0
    if media_inputs:
        tracker.record_validation_success(
            duration_ms=val_ms,
            byte_size=audio_bytes_len + image_bytes_len,
            mime_type=media_inputs[-1].mime_type,
            exif_stripped=exif_stripped,
        )

    modalities_used = _resolve_modalities(request)
    prompt = build_multimodal_prompt(request, modalities_used)
    media_arg: MediaInput | list[MediaInput] | None
    if len(media_inputs) == 1:
        media_arg = media_inputs[0]
    elif media_inputs:
        media_arg = media_inputs
    else:
        media_arg = None

    try:
        llm_result = await llm.generate_text(
            prompt,
            primary_model=request.model.primary,
            fallback_model=request.model.fallback,
            deadline_s=request.deadline_ms / 1000,
            media=media_arg,
            schema=GeminiMultimodalMealOutput,
            max_total_tokens=20_480,
            max_output_tokens=2048,
            system_instruction=MULTIMODAL_SYSTEM_INSTRUCTION,
            user_id=user_id,
        )
    except LlmServiceError as exc:
        tracker.record_processing_completed(
            model=exc.usage.model if exc.usage else request.model.primary,
            outcome="error",
            processing_error=True,
            error_category=exc.code.lower(),
        )
        raise

    if llm_result.finish_reason == "SAFETY":
        tracker.record_processing_completed(
            model=llm_result.usage.model,
            outcome="safety_blocked",
            processing_error=True,
            error_category="gemini_unavailable",
        )
        raise LlmServiceError(
            code="PROVIDER_UNAVAILABLE",
            message="Multimodal meal analysis was blocked by safety policies.",
            dispatched=True,
            usage=llm_result.usage,
        )

    if llm_result.finish_reason == "MAX_TOKENS":
        tracker.record_processing_completed(
            model=llm_result.usage.model,
            outcome="max_tokens",
            processing_error=True,
            error_category="gemini_error",
        )
        raise LlmServiceError(
            code="PROVIDER_ERROR",
            message="Multimodal meal analysis exceeded maximum token limit.",
            dispatched=True,
            usage=llm_result.usage,
        )

    parsed_output: GeminiMultimodalMealOutput | None = None
    if isinstance(llm_result.parsed, GeminiMultimodalMealOutput):
        parsed_output = llm_result.parsed
    elif isinstance(llm_result.parsed, dict):
        try:
            parsed_output = GeminiMultimodalMealOutput.model_validate(llm_result.parsed)
        except Exception:
            parsed_output = None
    elif llm_result.text and llm_result.text.strip():
        try:
            data = strict_json_loads(strip_code_fences(llm_result.text))
            if isinstance(data, dict):
                parsed_output = GeminiMultimodalMealOutput.model_validate(data)
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
            feature="multimodal_meal",
            trace_id=trace_id,
            prompt_version=PROMPT_VERSION,
            outcome="parse_failed",
            usage=llm_result.usage,
            record_metrics=record_llm_metrics,
            items=0,
            audio_bytes=audio_bytes_len,
            image_bytes=image_bytes_len,
        )
        raise LlmServiceError(
            code="PROVIDER_ERROR",
            message="Invalid structured response from Multimodal Meal model.",
            dispatched=True,
            usage=llm_result.usage,
        )

    clean_summary, summary_med = sanitize_narrative_text(
        parsed_output.summary, limits.MAX_SUMMARY_LENGTH
    )
    clean_transcript, transcript_med = sanitize_narrative_text(
        parsed_output.transcript or request.transcript or "", limits.MAX_TRANSCRIPT_LENGTH
    )
    clean_reason, reason_med = sanitize_narrative_text(
        parsed_output.unclear_reason, limits.MAX_REASON_LENGTH
    )

    if not parsed_output.is_food or len(parsed_output.items) == 0:
        outcome = "no_food"
        result = MultimodalMealResult(
            modalities_used=modalities_used,
            is_food=False,
            summary=clean_summary or NO_FOOD_SUMMARY,
            transcript=clean_transcript or "",
            detected_language=parsed_output.detected_language,
            items=[],
            overall_confidence=0.0,
            confidence="low",
            total_kcal=0,
            total_protein_grams=0,
            total_carbs_grams=0,
            total_fat_grams=0,
            total_fiber_grams=0,
            unclear_reason=clean_reason or NO_FOOD_REASON,
            uncertainty_note=UNCERTAINTY_HIGH_GUIDANCE,
            medical_disclaimer=MEDICAL_DISCLAIMER,
            analyzed_at=now_iso(),
        )
    else:
        now_ms = int(datetime.now(UTC).timestamp() * 1000)
        raw_items = [
            DetectedFoodItem(
                id=f"mm-food-{now_ms}-{idx}",
                name=(
                    item.name.strip() if item.name and item.name.strip() else f"Food Item {idx + 1}"
                ),
                brand="AI Multimodal Estimate",
                serving=(
                    item.portion_description.strip()
                    if item.portion_description and item.portion_description.strip()
                    else f"{item.serving_weight_g or 100:g}g"
                ),
                serving_weight_g=item.serving_weight_g
                if item.serving_weight_g is not None
                else 100.0,
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
            for idx, item in enumerate(parsed_output.items)
        ]

        items, adjusted = sanitize_food_items(raw_items)
        totals = compute_meal_totals(items)
        score = _CONFIDENCE_SCORES[parsed_output.confidence]
        all_low = bool(items) and all(item.confidence == "low" for item in items)
        any_medical = summary_med or transcript_med or reason_med
        calibrated_confidence: Confidence = parsed_output.confidence
        if adjusted or all_low or any_medical:
            score = min(score, 0.5)
            calibrated_confidence = "low"

        uncertainty_note = clean_reason or (
            limits.ADJUSTED_NOTICE
            if adjusted
            else UNCERTAINTY_HIGH_GUIDANCE
            if calibrated_confidence != "high"
            else "Visual and/or spoken nutrition figures are estimates."
        )
        outcome = "ok"
        result = MultimodalMealResult(
            modalities_used=modalities_used,
            is_food=True,
            summary=clean_summary or f"{len(items)} food items detected",
            transcript=clean_transcript or "",
            detected_language=parsed_output.detected_language,
            items=items,
            overall_confidence=score,
            confidence=calibrated_confidence,
            total_kcal=totals["total_kcal"],
            total_protein_grams=totals["total_protein_grams"],
            total_carbs_grams=totals["total_carbs_grams"],
            total_fat_grams=totals["total_fat_grams"],
            total_fiber_grams=totals["total_fiber_grams"],
            unclear_reason=clean_reason or (limits.ADJUSTED_NOTICE if adjusted else None),
            uncertainty_note=uncertainty_note,
            medical_disclaimer=MEDICAL_DISCLAIMER,
            analyzed_at=now_iso(),
        )

    usage = llm_result.usage
    log_ai_call(
        logger,
        feature="multimodal_meal",
        trace_id=trace_id,
        prompt_version=PROMPT_VERSION,
        outcome=outcome,
        usage=usage,
        record_metrics=record_llm_metrics,
        items=len(result.items),
        audio_bytes=audio_bytes_len,
        image_bytes=image_bytes_len,
    )
    tracker.record_processing_completed(
        model=usage.model,
        outcome=outcome,
    )
    return AnalyzeMultimodalMealResponse(
        outcome="ok" if outcome == "ok" else "no_food",
        result=result,
        usage=Usage(**{k: getattr(usage, k) for k in Usage.model_fields}),
        trace_id=trace_id,
    )
