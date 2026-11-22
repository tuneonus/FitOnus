"""Domain layer for knowledge feature."""

from onusfit_ai.features.knowledge.domain.chunk import ChunkMetadata, TextChunk
from onusfit_ai.features.knowledge.domain.document import KnowledgeCategory, KnowledgeDocument

__all__ = [
    "ChunkMetadata",
    "KnowledgeCategory",
    "KnowledgeDocument",
    "TextChunk",
]
