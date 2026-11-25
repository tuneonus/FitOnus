"""Speech transcription use case: audio clip -> Gemini -> {transcript, detectedLanguage}.

No HTTP and no database. Authentication and rate limiting stay in Node.
"""

import logging
import os
import time

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
from onusfit_ai.shared.logging import (
    MultimodalObservabilityTracker,
    classify_media_validation_error,
)
from onusfit_ai.shared.utils.audio import decode_audio_base64
from onusfit_ai.shared.utils.media import InvalidMediaError
from onusfit_ai.shared.utils.text import clean_text, redact_sensitive_text

logger = logging.getLogger("onusfit_ai.transcribe")


def is_speech_structured_output_enabled() -> bool:
    """Feature-specific rollback toggle for speech structured outputs.

    When AI_SPEECH_STRUCTURED_OUTPUTS is set to '0', 'false', 'no', or 'off',
    the speech feature reverts to unconstrained generation and legacy parsing.
    """
    raw = os.environ.get("AI_SPEECH_STRUCTURED_OUTPUTS", "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


async def transcribe_audio(
    request: TranscribeRequest,
    llm: TextGenerator,
    *,
    trace_id: str,
    user_id: str | None = None,
) -> TranscribeResponse:
    """Orchestrate audio transcription: decode audio bytes, invoke Gemini, and parse result.

    Uses native Gemini Structured Outputs (GeminiTranscribeOutput) when enabled,
    with defensive safety-check, truncation-check, and legacy fallback handling.
    """
    tracker = MultimodalObservabilityTracker(
        modality="audio",
        feature="transcribe",
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

    use_structured = is_speech_structured_output_enabled()
    schema = GeminiTranscribeOutput if use_structured else None

    try:
        llm_result = await llm.generate_text(
            build_prompt(),
            primary_model=request.model.primary,
            fallback_model=request.model.fallback,
            deadline_s=request.deadline_ms / 1000,
            media=media,
            schema=schema,
            max_total_tokens=12_288,
            max_output_tokens=1024,
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

    # 1. Defensively handle safety-blocked content (do NOT pass to legacy parser)
    if llm_result.finish_reason == "SAFETY":
        tracker.record_processing_completed(
            model=llm_result.usage.model,
            outcome="safety_blocked",
            processing_error=True,
            error_category="gemini_unavailable",
        )
        raise LlmServiceError(
            code="PROVIDER_UNAVAILABLE",
            message="Audio transcription was blocked by safety policies.",
            dispatched=True,
            usage=llm_result.usage,
        )

    # 2. Defensively handle token truncation (do NOT pass truncated JSON to legacy parser)
    if llm_result.finish_reason == "MAX_TOKENS":
        tracker.record_processing_completed(
            model=llm_result.usage.model,
            outcome="max_tokens",
            processing_error=True,
            error_category="gemini_error",
        )
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
            transcript=clean_text(redact_sensitive_text(llm_result.parsed.transcript)),
            detected_language=llm_result.parsed.detected_language,
        )
        outcome = "ok"
    elif isinstance(llm_result.parsed, dict):
        try:
            validated = GeminiTranscribeOutput.model_validate(llm_result.parsed)
            result = TranscribeResult(
                transcript=clean_text(redact_sensitive_text(validated.transcript)),
                detected_language=validated.detected_language,
            )
            outcome = "ok"
        except Exception:
            # Fallback to safe string parsing
            result, outcome = parse_transcription(llm_result.text)
    else:
        # parsed is None: fallback to safe string parsing
        result, outcome = parse_transcription(llm_result.text)
        result = TranscribeResult(
            transcript=redact_sensitive_text(result.transcript),
            detected_language=result.detected_language,
        )

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
    tracker.record_processing_completed(
        model=usage.model,
        outcome=outcome,
        processing_error=(outcome == "unstructured"),
        error_category=("invalid_ai_response" if outcome == "unstructured" else None),
    )
    return TranscribeResponse(
        outcome=outcome,  # type: ignore[arg-type]
        result=result,
        usage=Usage(**{k: getattr(usage, k) for k in Usage.model_fields}),
        trace_id=trace_id,
    )
