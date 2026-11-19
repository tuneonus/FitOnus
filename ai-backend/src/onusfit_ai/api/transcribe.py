"""POST /internal/v1/ai/speech/transcribe: a thin HTTP wrapper around `transcribe_audio`."""

import uuid

from fastapi import APIRouter, Depends, Header

from onusfit_ai.contracts.transcribe import TranscribeRequest, TranscribeResponse
from onusfit_ai.core.auth import ServiceClaims, require_scope
from onusfit_ai.llm.gemini import TextGenerator, get_llm
from onusfit_ai.speech.transcribe import transcribe_audio

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
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())
    return await transcribe_audio(body, llm, trace_id=trace_id)
