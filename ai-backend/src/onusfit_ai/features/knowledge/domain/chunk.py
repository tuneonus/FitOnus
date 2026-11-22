"""Domain models for knowledge chunks."""

from pydantic import Field

from onusfit_ai.shared.contracts._base import ContractModel


class ChunkMetadata(ContractModel):
    document_slug: str | None = None
    document_title: str | None = None
    category: str | None = None
    section_header: str | None = None
    tags: list[str] = Field(default_factory=list)


class TextChunk(ContractModel):
    id: str
    content: str
    token_count: int
    chunk_index: int
    metadata: ChunkMetadata = Field(default_factory=ChunkMetadata)
