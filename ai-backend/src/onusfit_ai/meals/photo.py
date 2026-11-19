"""Meal photo use case: photo -> Gemini (vision) -> structured food items and totals.

Pure orchestration (no HTTP, no database), so it is testable with a fake LLM. Quota, authentication
and the decision "may this user do this now" stay in Node.
"""

import logging

from onusfit_ai.contracts.common import Usage
from onusfit_ai.contracts.meal_photo import AnalyzeMealPhotoRequest, AnalyzeMealPhotoResponse
from onusfit_ai.core.image import decode_image_base64
from onusfit_ai.llm.gemini import MediaInput, TextGenerator
from onusfit_ai.llm.telemetry import log_ai_call
from onusfit_ai.meals.photo_parsing import parse_meal_photo_output
from onusfit_ai.prompts.meal_photo import PROMPT_VERSION, build_prompt

logger = logging.getLogger("onusfit_ai.meal_photo")


async def analyze_meal_photo(
    request: AnalyzeMealPhotoRequest, llm: TextGenerator, *, trace_id: str
) -> AnalyzeMealPhotoResponse:
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
