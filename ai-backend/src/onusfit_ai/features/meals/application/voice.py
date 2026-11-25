"""Voice meal use case: transcript and/or audio -> Gemini -> structured food items.

Pure orchestration (no HTTP, no database), so it is testable with a fake LLM. Quota, authentication
and the decision "may this user do this now" stay in Node.
"""

import logging
import time
from datetime import UTC, datetime

from onusfit_ai.features.meals.application.parsing import (
    NO_FOOD_REASON,
    VoiceMealOutcome,
    _empty_result,
    now_iso,
    one_decimal,
    parse_voice_meal_output,
)
from onusfit_ai.features.meals.application.prompts.voice_meal import PROMPT_VERSION, build_prompt
from onusfit_ai.features.meals.application.schemas import (
    GeminiVoiceMealOutput,
    is_voice_meal_structured_output_enabled,
)
from onusfit_ai.features.meals.domain.detected_food import DetectedFoodItem
from onusfit_ai.features.meals.domain.sanitize import sanitize_voice_result
from onusfit_ai.features.meals.domain.voice import (
    ParseVoiceMealRequest,
    ParseVoiceMealResponse,
    VoiceMealResult,
)
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.llm.ports import LlmServiceError, MediaInput, TextGenerator
from onusfit_ai.shared.llm.telemetry import log_ai_call
from onusfit_ai.shared.logging import (
    MultimodalObservabilityTracker,
    classify_media_validation_error,
)
from onusfit_ai.shared.utils.audio import decode_audio_base64
from onusfit_ai.shared.utils.js_compat import js_round, strict_json_loads, strip_code_fences
from onusfit_ai.shared.utils.media import InvalidMediaError

logger = logging.getLogger("onusfit_ai.voice_meal")


async def parse_voice_meal(
    request: ParseVoiceMealRequest, llm: TextGenerator, *, trace_id: str
) -> ParseVoiceMealResponse:
    """Orchestrate voice meal parsing from audio clip and/or text transcript.

    Decodes multimodal audio bytes if present, calls Gemini, parses returned JSON into food items,
    and bounds every nutrient value via domain sanitization before returning.
    """
    prompt = build_prompt(request.transcript, request.lang, request.meal_type)
    tracker: MultimodalObservabilityTracker | None = None
    media: MediaInput | None = None
    if request.audio is not None:
        tracker = MultimodalObservabilityTracker(
            modality="audio",
            feature="voice_meal",
            trace_id=trace_id,
        )
        val_started = time.monotonic()
        try:
            decoded_audio = decode_audio_base64(request.audio.base64)
        except InvalidMediaError as exc:
            tracker.record_validation_failure(
                duration_ms=(time.monotonic() - val_started) * 1000.0,
                reason=classify_media_validation_error(str(exc)),
            )
            raise
        media = MediaInput(mime_type=request.audio.mime_type, data=decoded_audio)
        tracker.record_validation_success(
            duration_ms=(time.monotonic() - val_started) * 1000.0,
            byte_size=len(decoded_audio),
            mime_type=request.audio.mime_type,
        )

    use_structured = is_voice_meal_structured_output_enabled()
    schema = GeminiVoiceMealOutput if use_structured else None

    try:
        llm_result = await llm.generate_text(
            prompt,
            primary_model=request.model.primary,
            fallback_model=request.model.fallback,
            deadline_s=request.deadline_ms / 1000,
            media=media,
            schema=schema,
        )
    except LlmServiceError as exc:
        if tracker is not None:
            tracker.record_processing_completed(
                model=exc.usage.model if exc.usage else request.model.primary,
                outcome="error",
                processing_error=True,
                error_category=exc.code.lower(),
            )
        raise

    # 1. Defensively handle safety-blocked content
    if llm_result.finish_reason == "SAFETY":
        if tracker is not None:
            tracker.record_processing_completed(
                model=llm_result.usage.model,
                outcome="safety_blocked",
                processing_error=True,
                error_category="gemini_unavailable",
            )
        raise LlmServiceError(
            code="PROVIDER_UNAVAILABLE",
            message="Voice meal parsing was blocked by safety policies.",
            dispatched=True,
            usage=llm_result.usage,
        )

    # 2. Defensively handle token truncation
    if llm_result.finish_reason == "MAX_TOKENS":
        if tracker is not None:
            tracker.record_processing_completed(
                model=llm_result.usage.model,
                outcome="max_tokens",
                processing_error=True,
                error_category="gemini_error",
            )
        raise LlmServiceError(
            code="PROVIDER_ERROR",
            message="Voice meal parsing exceeded maximum token limit.",
            dispatched=True,
            usage=llm_result.usage,
        )

    # 3. Resolve result and outcome
    result: VoiceMealResult
    outcome: VoiceMealOutcome

    if use_structured:
        parsed_output: GeminiVoiceMealOutput | None = None

        if isinstance(llm_result.parsed, GeminiVoiceMealOutput):
            parsed_output = llm_result.parsed
        elif isinstance(llm_result.parsed, dict):
            try:
                parsed_output = GeminiVoiceMealOutput.model_validate(llm_result.parsed)
            except Exception:
                parsed_output = None
        elif llm_result.text and llm_result.text.strip():
            try:
                data = strict_json_loads(strip_code_fences(llm_result.text))
                if isinstance(data, dict):
                    parsed_output = GeminiVoiceMealOutput.model_validate(data)
            except Exception:
                parsed_output = None

        if parsed_output is None:
            if tracker is not None:
                tracker.record_processing_completed(
                    model=llm_result.usage.model,
                    outcome="parse_failed",
                    processing_error=True,
                    error_category="invalid_ai_response",
                )
            log_ai_call(
                logger,
                feature="voice_meal",
                trace_id=trace_id,
                prompt_version=PROMPT_VERSION,
                outcome="parse_failed",
                usage=llm_result.usage,
                has_audio=media is not None,
                items=0,
            )
            msg = (
                "Empty response from Voice Meal model in structured mode."
                if not llm_result.text or not llm_result.text.strip()
                else "Invalid structured response from Voice Meal model."
            )
            raise LlmServiceError(
                code="PROVIDER_ERROR",
                message=msg,
                dispatched=True,
                usage=llm_result.usage,
            )

        transcript = (parsed_output.transcript or request.transcript or "").strip()
        if len(parsed_output.items) == 0:
            outcome = "no_food"
            reason = parsed_output.unclear_reason or NO_FOOD_REASON
            result = _empty_result(
                transcript, parsed_output.detected_language, reason, total_fiber=0
            )
        else:
            now_ms = int(datetime.now(UTC).timestamp() * 1000)
            items = [
                DetectedFoodItem(
                    id=f"voice-food-{now_ms}-{idx}",
                    name=item.name.strip(),
                    brand="AI Voice Estimate",
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
                for idx, item in enumerate(parsed_output.items)
            ]

            total_kcal = sum(int(it.kcal) for it in items)
            protein = one_decimal(sum(it.protein for it in items))
            carbs = one_decimal(sum(it.carbs for it in items))
            fat = one_decimal(sum(it.fat for it in items))
            fiber = one_decimal(sum(it.fiber or 0 for it in items))

            outcome = "ok"
            result = VoiceMealResult(
                transcript=transcript,
                detected_language=parsed_output.detected_language,
                items=items,
                confidence=parsed_output.confidence,
                total_kcal=total_kcal,
                total_protein_grams=protein,
                total_carbs_grams=carbs,
                total_fat_grams=fat,
                total_fiber_grams=fiber,
                unclear_reason=parsed_output.unclear_reason,
                parsed_at=now_iso(),
            )
    else:
        result, outcome = parse_voice_meal_output(llm_result.text, request.transcript)

    # Bound whatever the model claimed before it can reach a member (see meals/domain/sanitize.py).
    result = sanitize_voice_result(result)

    usage = llm_result.usage
    # Metadata only: transcripts, audio and the reply are never logged.
    log_ai_call(
        logger,
        feature="voice_meal",
        trace_id=trace_id,
        prompt_version=PROMPT_VERSION,
        outcome=outcome,
        usage=usage,
        has_audio=media is not None,
        items=len(result.items),
    )
    if tracker is not None:
        tracker.record_processing_completed(
            model=usage.model,
            outcome=outcome,
            processing_error=(outcome == "parse_failed"),
            error_category=("invalid_ai_response" if outcome == "parse_failed" else None),
        )
    return ParseVoiceMealResponse(
        outcome=outcome,
        result=result,
        usage=Usage(**{k: getattr(usage, k) for k in Usage.model_fields}),
        trace_id=trace_id,
    )
