"""Voice meal use case: transcript and/or audio -> Gemini -> structured food items.

Pure orchestration (no HTTP, no database), so it is testable with a fake LLM. Quota, authentication
and the decision "may this user do this now" stay in Node.
"""

import base64
import binascii
import logging

from onusfit_ai.contracts.common import Usage
from onusfit_ai.contracts.voice_meal import ParseVoiceMealRequest, ParseVoiceMealResponse
from onusfit_ai.core.errors import AiError
from onusfit_ai.llm.gemini import MediaInput, TextGenerator
from onusfit_ai.meals.parsing import parse_voice_meal_output
from onusfit_ai.prompts.voice_meal import PROMPT_VERSION, build_prompt

logger = logging.getLogger("onusfit_ai.voice_meal")


def _decode_audio(base64_text: str) -> bytes:
    """Accepts raw base64 or a `data:<mime>;base64,<payload>` URL, like the former Node client."""
    payload = base64_text.split(",", 1)[1] if "," in base64_text else base64_text
    try:
        return base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError):
        raise AiError(
            status_code=422,
            code="INVALID_REQUEST",
            message="Audio data is not valid base64.",
            dispatched=False,
        ) from None


async def parse_voice_meal(
    request: ParseVoiceMealRequest, llm: TextGenerator, *, trace_id: str
) -> ParseVoiceMealResponse:
    prompt = build_prompt(request.transcript, request.lang, request.meal_type)
    media = (
        MediaInput(mime_type=request.audio.mime_type, data=_decode_audio(request.audio.base64))
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
    logger.info(
        "voice_meal trace=%s prompt=%s audio=%s model=%s fallback=%s outcome=%s items=%s "
        "tokens=%s duration_ms=%s",
        trace_id,
        PROMPT_VERSION,
        media is not None,
        usage.model,
        usage.is_fallback,
        outcome,
        len(result.items),
        usage.total_tokens,
        usage.duration_ms,
    )
    return ParseVoiceMealResponse(
        outcome=outcome,
        result=result,
        usage=Usage(**{k: getattr(usage, k) for k in Usage.model_fields}),
        trace_id=trace_id,
    )
