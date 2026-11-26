"""Wire contracts for the internal embedding generation endpoint."""

from typing import Literal

from pydantic import Field

from onusfit_ai.shared.contracts._base import ContractModel
from onusfit_ai.shared.contracts.common import Usage

EmbedTaskType = Literal[
    "RETRIEVAL_DOCUMENT",
    "RETRIEVAL_QUERY",
    "SEMANTIC_SIMILARITY",
    "CLASSIFICATION",
    "CLUSTERING",
]


class EmbedRequest(ContractModel):
    """Payload for POST /internal/v1/ai/embed."""

    texts: list[str] = Field(min_length=1, max_length=100)
    model: str = Field(default="gemini-embedding-001", max_length=100)
    dimensions: int = Field(default=768, ge=128, le=3072)
    task_type: EmbedTaskType = Field(default="RETRIEVAL_DOCUMENT")
    title: str | None = Field(default=None, max_length=200)


class EmbedResponse(ContractModel):
    """Response returned by POST /internal/v1/ai/embed."""

    outcome: Literal["ok"] = "ok"
    embeddings: list[list[float]]
    model: str
    dimensions: int
    count: int
    usage: Usage
    trace_id: str
