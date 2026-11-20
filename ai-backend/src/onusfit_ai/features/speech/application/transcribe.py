"""Speech transcription use case: audio clip -> Gemini -> {transcript, detectedLanguage}.

No HTTP and no database. Authentication and rate limiting stay in Node.
"""

import logging

from onusfit_ai.features.speech.application.contracts import TranscribeRequest, TranscribeResponse
from onusfit_ai.features.speech.application.parsing import parse_transcription
from onusfit_ai.features.speech.application.prompts.transcribe import (
    PROMPT_VERSION,
    build_prompt,
)
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.llm.ports import MediaInput, TextGenerator
from onusfit_ai.shared.llm.telemetry import log_ai_call
from onusfit_ai.shared.utils.audio import decode_audio_base64

logger = logging.getLogger("onusfit_ai.transcribe")


async def transcribe_audio(
    request: TranscribeRequest, llm: TextGenerator, *, trace_id: str
) -> TranscribeResponse:
    """Orchestrate audio transcription: decode audio bytes, invoke Gemini, and parse result.

    Supports fallback to raw text if the model does not produce valid JSON schema output.
    """
    media = MediaInput(
        mime_type=request.audio.mime_type, data=decode_audio_base64(request.audio.base64)
    )
    llm_result = await llm.generate_text(
        build_prompt(),
        primary_model=request.model.primary,
        fallback_model=request.model.fallback,
        deadline_s=request.deadline_ms / 1000,
        media=media,
    )
    result, outcome = parse_transcription(llm_result.text)

    usage = llm_result.usage
    # Metadata only: the audio and the transcript are never logged.
    log_ai_call(
        logger,
        feature="transcribe",
        trace_id=trace_id,
        prompt_version=PROMPT_VERSION,
        outcome=outcome,
        usage=usage,
        audio_bytes=len(media.data),
    )
    return TranscribeResponse(
        outcome=outcome,
        result=result,
        usage=Usage(**{k: getattr(usage, k) for k in Usage.model_fields}),
        trace_id=trace_id,
    )
