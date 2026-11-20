"""Meal photo use case: photo -> Gemini (vision) -> structured food items and totals.

Pure orchestration (no HTTP, no database), so it is testable with a fake LLM. Quota, authentication
and the decision "may this user do this now" stay in Node.
"""

import logging

from onusfit_ai.features.meals.application.photo_parsing import parse_meal_photo_output
from onusfit_ai.features.meals.application.prompts.meal_photo import PROMPT_VERSION, build_prompt
from onusfit_ai.features.meals.domain.photo import AnalyzeMealPhotoRequest, AnalyzeMealPhotoResponse
from onusfit_ai.features.meals.domain.sanitize import sanitize_photo_result
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.llm.ports import MediaInput, TextGenerator
from onusfit_ai.shared.llm.telemetry import log_ai_call
from onusfit_ai.shared.utils.image import decode_image_base64

logger = logging.getLogger("onusfit_ai.meal_photo")


async def analyze_meal_photo(
    request: AnalyzeMealPhotoRequest, llm: TextGenerator, *, trace_id: str
) -> AnalyzeMealPhotoResponse:
    """Orchestrate meal photo analysis using Gemini vision models.

    Validates base64 image bytes up front (fails 422 before calling Gemini), calls multimodal LLM,
    parses items, and bounds all macros and calories to realistic human nutritional limits.
    """
    # Refuses corrupt images (422, dispatched=False) before any Gemini call.
    media = MediaInput(
        mime_type=request.image.mime_type, data=decode_image_base64(request.image.base64)
    )
    llm_result = await llm.generate_text(
        build_prompt(request.meal_type, request.notes),
        primary_model=request.model.primary,
        fallback_model=request.model.fallback,
        deadline_s=request.deadline_ms / 1000,
        media=media,
    )
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
    return AnalyzeMealPhotoResponse(
        outcome=outcome,
        result=result,
        usage=Usage(**{k: getattr(usage, k) for k in Usage.model_fields}),
        trace_id=trace_id,
    )
