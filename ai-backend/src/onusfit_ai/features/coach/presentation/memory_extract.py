"""POST /internal/v1/ai/coach/memories/extract: thin HTTP wrapper around extract_coach_memories."""

import uuid

from fastapi import APIRouter, Depends, Header

from onusfit_ai.features.coach.application.extraction import extract_coach_memories
from onusfit_ai.features.coach.domain.memory import (
    MemoryExtractionRequest,
    MemoryExtractionResponse,
)
from onusfit_ai.shared.auth import ServiceClaims, require_scope
from onusfit_ai.shared.llm.dependencies import get_llm
from onusfit_ai.shared.llm.ports import TextGenerator

SCOPE = "ai:coach:chat"
require_chat_scope = require_scope(SCOPE)

router = APIRouter(prefix="/internal/v1/ai/coach", tags=["coach"])


@router.post("/memories/extract", response_model=MemoryExtractionResponse)
async def extract_memories(
    body: MemoryExtractionRequest,
    claims: ServiceClaims = Depends(require_chat_scope),
    llm: TextGenerator = Depends(get_llm),
    x_request_id: str | None = Header(default=None),
) -> MemoryExtractionResponse:
    """Extract candidate user memories from recent conversation dialogue turns.

    Execution order:
    1. Service JWT authentication & scope verification via require_chat_scope.
    2. Request body validation against MemoryExtractionRequest schema.
    3. LLM dependency injection.
    4. Trace ID resolution.
    5. Execute memory extraction service.
    """
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())
    return await extract_coach_memories(body, llm, trace_id=trace_id)
