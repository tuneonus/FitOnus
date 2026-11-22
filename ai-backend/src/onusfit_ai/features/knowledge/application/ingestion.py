"""Ingestion service for processing documents into embedded chunks."""

from dataclasses import dataclass

from onusfit_ai.features.knowledge.application.chunking import SemanticTextChunker
from onusfit_ai.features.knowledge.domain.chunk import TextChunk
from onusfit_ai.features.knowledge.domain.document import KnowledgeDocument
from onusfit_ai.shared.llm.ports import EmbeddingsGenerator


@dataclass(frozen=True)
class EmbeddedChunk:
    chunk: TextChunk
    embedding: list[float]


class IngestionService:
    """Orchestrates document chunking and vector embedding generation."""

    def __init__(
        self,
        *,
        embedder: EmbeddingsGenerator,
        chunker: SemanticTextChunker | None = None,
        embedding_model: str = "gemini-embedding-001",
        output_dimensionality: int = 768,
    ) -> None:
        self.embedder = embedder
        self.chunker = chunker or SemanticTextChunker()
        self.model = embedding_model
        self.dimensions = output_dimensionality

    async def process_document(
        self,
        document: KnowledgeDocument,
        *,
        batch_size: int = 20,
    ) -> list[EmbeddedChunk]:
        """Chunk a knowledge document and generate 768-d vector embeddings for all chunks."""
        chunks = self.chunker.chunk_document(
            document.content,
            document_slug=document.slug,
            document_title=document.title,
            category=document.category,
        )
        if not chunks:
            return []

        embedded_chunks: list[EmbeddedChunk] = []

        # Process in batches
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            texts = [c.content for c in batch]
            results = await self.embedder.embed_content(
                texts,
                model=self.model,
                output_dimensionality=self.dimensions,
                task_type="RETRIEVAL_DOCUMENT",
                title=document.title,
            )
            for chunk, emb in zip(batch, results, strict=True):
                embedded_chunks.append(EmbeddedChunk(chunk=chunk, embedding=emb.values))

        return embedded_chunks
