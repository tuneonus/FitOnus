"""POST /internal/v1/ai/embed: thin HTTP endpoint for vector embedding generation."""

import logging
import time
import uuid

from fastapi import APIRouter, Depends, Header

from onusfit_ai.shared.auth import ServiceClaims, require_scope
from onusfit_ai.shared.contracts.embed import EmbedRequest, EmbedResponse
from onusfit_ai.shared.llm.dependencies import get_embeddings_generator
from onusfit_ai.shared.llm.ports import EmbeddingsGenerator

logger = logging.getLogger("onusfit_ai.embed")

SCOPE = "ai:embed"
require_embed_scope = require_scope(SCOPE)

router = APIRouter(prefix="/internal/v1/ai", tags=["knowledge"])


@router.post("/embed", response_model=EmbedResponse)
async def generate_embeddings(
    body: EmbedRequest,
    claims: ServiceClaims = Depends(require_embed_scope),
    embedder: EmbeddingsGenerator = Depends(get_embeddings_generator),
    x_request_id: str | None = Header(default=None),
) -> EmbedResponse:
    """Generate vector embeddings for text passages using gemini-embedding-001 (768-d).

    Execution order:
    1. JWT authentication and scope verification via Depends(require_embed_scope).
    2. Request body validation against EmbedRequest schema (extra='forbid').
    3. Generate embeddings via injected EmbeddingsGenerator (MRL 768-d).
    4. Structured observability logging with latency and dimensionality.
    """
    started = time.monotonic()
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())

    results = await embedder.embed_content(
        body.texts,
        model=body.model,
        output_dimensionality=body.dimensions,
        task_type=body.task_type,
        title=body.title,
    )
    embeddings = [r.values for r in results]

    logger.info(
        "ai.embed.completed traceId=%s model=%s count=%d dimensions=%d taskType=%s durationMs=%d",
        trace_id,
        body.model,
        len(embeddings),
        body.dimensions,
        body.task_type,
        int((time.monotonic() - started) * 1000),
    )

    return EmbedResponse(
        embeddings=embeddings,
        model=body.model,
        dimensions=body.dimensions,
        count=len(embeddings),
    )
