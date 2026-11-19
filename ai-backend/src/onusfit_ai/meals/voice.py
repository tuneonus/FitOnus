"""Voice meal use case: transcript and/or audio -> Gemini -> structured food items.

Pure orchestration (no HTTP, no database), so it is testable with a fake LLM. Quota, authentication
and the decision "may this user do this now" stay in Node.
"""

import logging

from onusfit_ai.contracts.common import Usage
from onusfit_ai.contracts.voice_meal import ParseVoiceMealRequest, ParseVoiceMealResponse
from onusfit_ai.core.audio import decode_audio_base64
from onusfit_ai.llm.gemini import MediaInput, TextGenerator
from onusfit_ai.llm.telemetry import log_ai_call
from onusfit_ai.meals.parsing import parse_voice_meal_output
from onusfit_ai.prompts.voice_meal import PROMPT_VERSION, build_prompt

logger = logging.getLogger("onusfit_ai.voice_meal")


async def parse_voice_meal(
    request: ParseVoiceMealRequest, llm: TextGenerator, *, trace_id: str
) -> ParseVoiceMealResponse:
    prompt = build_prompt(request.transcript, request.lang, request.meal_type)
    media = (
        MediaInput(
            mime_type=request.audio.mime_type, data=decode_audio_base64(request.audio.base64)
        )
        if request.audio
        else None
    )

    llm_result = await llm.generate_text(
        prompt,
        primary_model=request.model.primary,
        fallback_model=request.model.fallback,
        deadline_s=request.deadline_ms / 1000,
        media=media,
    )
    result, outcome = parse_voice_meal_output(llm_result.text, request.transcript)

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
    return ParseVoiceMealResponse(
        outcome=outcome,
        result=result,
        usage=Usage(**{k: getattr(usage, k) for k in Usage.model_fields}),
        trace_id=trace_id,
    )
