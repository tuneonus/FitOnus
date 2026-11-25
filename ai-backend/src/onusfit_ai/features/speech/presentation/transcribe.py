"""POST /internal/v1/ai/speech/transcribe: a thin HTTP wrapper around `transcribe_audio`."""

import uuid

from fastapi import APIRouter, Depends, Header

from onusfit_ai.features.speech.application.contracts import TranscribeRequest, TranscribeResponse
from onusfit_ai.features.speech.application.transcribe import transcribe_audio
from onusfit_ai.shared.auth import ServiceClaims, require_scope
from onusfit_ai.shared.llm.dependencies import get_llm
from onusfit_ai.shared.llm.ports import TextGenerator

SCOPE = "ai:speech:transcribe"
require_transcribe_scope = require_scope(SCOPE)

router = APIRouter(prefix="/internal/v1/ai/speech", tags=["speech"])


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    body: TranscribeRequest,
    claims: ServiceClaims = Depends(require_transcribe_scope),
    llm: TextGenerator = Depends(get_llm),
    x_request_id: str | None = Header(default=None),
) -> TranscribeResponse:
    """Transcribe an audio clip using Gemini and return transcript and detected language.

    Enforces JWT scope 'ai:speech:transcribe', injects the LLM client, and propagates trace ID.
    """
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())
    return await transcribe_audio(body, llm, trace_id=trace_id, user_id=claims.user_id)
