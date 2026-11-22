"""Application service for extracting memory candidates from dialogue turns."""

import json
import logging

from onusfit_ai.features.coach.application.prompts.memory_extraction import (
    build_memory_extraction_prompt,
)
from onusfit_ai.features.coach.domain.memory import (
    ExtractedMemoryCandidate,
    GeminiMemoryExtractionOutput,
    MemoryExtractionRequest,
    MemoryExtractionResponse,
)
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.llm.ports import LlmServiceError, TextGenerator
from onusfit_ai.shared.llm.telemetry import log_ai_call

logger = logging.getLogger("onusfit_ai.coach.memory")
PROMPT_VERSION = "v1"


async def extract_coach_memories(
    request: MemoryExtractionRequest,
    llm: TextGenerator,
    *,
    trace_id: str,
) -> MemoryExtractionResponse:
    """Extract atomic personal fitness memories from user conversation turns.

    Uses Gemini Native Structured Outputs (GeminiMemoryExtractionOutput)
    to guarantee validated JSON matching the target schema.
    """
    prompt = build_memory_extraction_prompt(
        turns=request.turns,
        existing_memories=request.existing_memories,
    )

    llm_result = await llm.generate_text(
        prompt,
        primary_model=request.model.primary,
        fallback_model=request.model.fallback,
        deadline_s=request.deadline_ms / 1000,
        schema=GeminiMemoryExtractionOutput,
    )

    if llm_result.finish_reason == "SAFETY":
        raise LlmServiceError(
            code="PROVIDER_UNAVAILABLE",
            message="Memory extraction was blocked by safety policies.",
            dispatched=True,
            usage=llm_result.usage,
        )

    candidates: list[ExtractedMemoryCandidate] = []

    # 1. Resolve structured output
    if isinstance(llm_result.parsed, GeminiMemoryExtractionOutput):
        candidates = llm_result.parsed.candidates
    elif isinstance(llm_result.parsed, dict):
        try:
            parsed_obj = GeminiMemoryExtractionOutput.model_validate(llm_result.parsed)
            candidates = parsed_obj.candidates
        except Exception as e:
            logger.warning(
                "Failed to validate parsed dict into GeminiMemoryExtractionOutput: %s", e
            )
    elif llm_result.text and llm_result.text.strip():
        try:
            raw_data = json.loads(llm_result.text)
            parsed_obj = GeminiMemoryExtractionOutput.model_validate(raw_data)
            candidates = parsed_obj.candidates
        except Exception as e:
            logger.warning("Failed to parse raw text into GeminiMemoryExtractionOutput: %s", e)

    # 2. Safety and quality hardening
    sanitized_candidates: list[ExtractedMemoryCandidate] = []
    clinical_keywords = ("pain", "injury", "injured", "surgery", "allergic", "allergy", "asthma")
    for cand in candidates:
        text = cand.text.strip()
        if not text or len(text) < 3:
            continue

        # Force sensitive=True for health/injuries/medical
        is_sensitive = bool(
            cand.sensitive
            or cand.category in ("injuries", "medical")
            or any(w in text.lower() for w in clinical_keywords)
        )

        sanitized_candidates.append(
            ExtractedMemoryCandidate(
                category=cand.category,
                text=text,
                confidence=round(max(0.0, min(1.0, cand.confidence)), 2),
                sensitive=is_sensitive,
                source_quote=cand.source_quote.strip(),
                supersedes_quote=cand.supersedes_quote.strip() if cand.supersedes_quote else None,
            )
        )

    u = llm_result.usage
    usage = Usage(
        model=u.model,
        is_fallback=u.is_fallback,
        input_tokens=u.input_tokens,
        output_tokens=u.output_tokens,
        cached_tokens=u.cached_tokens,
        thinking_tokens=u.thinking_tokens,
        total_tokens=u.total_tokens,
        duration_ms=u.duration_ms,
    )

    log_ai_call(
        logger,
        feature="coach_memory_extract",
        trace_id=trace_id,
        prompt_version=PROMPT_VERSION,
        outcome="ok",
        usage=llm_result.usage,
    )

    return MemoryExtractionResponse(
        outcome="ok",
        candidates=sanitized_candidates,
        usage=usage,
        trace_id=trace_id,
    )
