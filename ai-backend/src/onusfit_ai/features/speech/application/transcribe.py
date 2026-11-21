"""Speech transcription use case: audio clip -> Gemini -> {transcript, detectedLanguage}.

No HTTP and no database. Authentication and rate limiting stay in Node.
"""

import logging
import os

from onusfit_ai.features.speech.application.contracts import (
    TranscribeRequest,
    TranscribeResponse,
    TranscribeResult,
)
from onusfit_ai.features.speech.application.parsing import parse_transcription
from onusfit_ai.features.speech.application.prompts.transcribe import (
    PROMPT_VERSION,
    build_prompt,
)
from onusfit_ai.features.speech.application.schemas import GeminiTranscribeOutput
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.llm.ports import LlmServiceError, MediaInput, TextGenerator
from onusfit_ai.shared.llm.telemetry import log_ai_call
from onusfit_ai.shared.utils.audio import decode_audio_base64

logger = logging.getLogger("onusfit_ai.transcribe")


def is_speech_structured_output_enabled() -> bool:
    """Feature-specific rollback toggle for speech structured outputs.

    When AI_SPEECH_STRUCTURED_OUTPUTS is set to '0', 'false', 'no', or 'off',
    the speech feature reverts to unconstrained generation and legacy parsing.
    """
    raw = os.environ.get("AI_SPEECH_STRUCTURED_OUTPUTS", "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


async def transcribe_audio(
    request: TranscribeRequest, llm: TextGenerator, *, trace_id: str
) -> TranscribeResponse:
    """Orchestrate audio transcription: decode audio bytes, invoke Gemini, and parse result.

    Uses native Gemini Structured Outputs (GeminiTranscribeOutput) when enabled,
    with defensive safety-check, truncation-check, and legacy fallback handling.
    """
    media = MediaInput(
        mime_type=request.audio.mime_type, data=decode_audio_base64(request.audio.base64)
    )

    use_structured = is_speech_structured_output_enabled()
    schema = GeminiTranscribeOutput if use_structured else None

    llm_result = await llm.generate_text(
        build_prompt(),
        primary_model=request.model.primary,
        fallback_model=request.model.fallback,
        deadline_s=request.deadline_ms / 1000,
        media=media,
        schema=schema,
    )

    # 1. Defensively handle safety-blocked content (do NOT pass to legacy parser)
    if llm_result.finish_reason == "SAFETY":
        raise LlmServiceError(
            code="PROVIDER_UNAVAILABLE",
            message="Audio transcription was blocked by safety policies.",
            dispatched=True,
            usage=llm_result.usage,
        )

    # 2. Defensively handle token truncation (do NOT pass truncated JSON to legacy parser)
    if llm_result.finish_reason == "MAX_TOKENS":
        raise LlmServiceError(
            code="PROVIDER_ERROR",
            message="Transcription response exceeded maximum token limit.",
            dispatched=True,
            usage=llm_result.usage,
        )

    # 3. Resolve result and outcome
    result: TranscribeResult
    outcome: str

    if isinstance(llm_result.parsed, GeminiTranscribeOutput):
        result = TranscribeResult(
            transcript=llm_result.parsed.transcript.strip(),
            detected_language=llm_result.parsed.detected_language,
        )
        outcome = "ok"
    elif isinstance(llm_result.parsed, dict):
        try:
            validated = GeminiTranscribeOutput.model_validate(llm_result.parsed)
            result = TranscribeResult(
                transcript=validated.transcript.strip(),
                detected_language=validated.detected_language,
            )
            outcome = "ok"
        except Exception:
            # Fallback to safe string parsing
            result, outcome = parse_transcription(llm_result.text)
    else:
        # parsed is None: fallback to safe string parsing (e.g. rollback mode or unparsed model reply)
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
        outcome=outcome,  # type: ignore[arg-type]
        result=result,
        usage=Usage(**{k: getattr(usage, k) for k in Usage.model_fields}),
        trace_id=trace_id,
    )
