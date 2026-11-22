"""Unit tests for semantic knowledge chunking and ingestion."""

import pytest

from conftest import FakeLlm
from onusfit_ai.features.knowledge.application.chunking import (
    SemanticTextChunker,
    estimate_token_count,
)
from onusfit_ai.features.knowledge.application.ingestion import IngestionService
from onusfit_ai.features.knowledge.domain.document import KnowledgeDocument


def test_estimate_token_count() -> None:
    assert estimate_token_count("") == 0
    assert estimate_token_count("Hello world") == 2
    # Long text
    long_text = "This is a detailed exercise science guide on barbell squat biomechanics."
    assert estimate_token_count(long_text) >= 10


def test_chunking_short_document() -> None:
    chunker = SemanticTextChunker(target_chunk_tokens=100, chunk_overlap_tokens=20)
    doc_content = "## Squat Mechanics\nThe barbell back squat targets quadriceps, glutes, and spinal erectors."
    chunks = chunker.chunk_document(
        doc_content,
        document_slug="squat-mechanics",
        document_title="Barbell Squat Mechanics",
        category="fitness",
    )
    assert len(chunks) == 1
    assert chunks[0].id == "squat-mechanics-chunk-000"
    assert chunks[0].metadata.document_slug == "squat-mechanics"
    assert chunks[0].metadata.document_title == "Barbell Squat Mechanics"
    assert chunks[0].metadata.section_header == "Squat Mechanics"
    assert "barbell back squat" in chunks[0].content


def test_chunking_preserves_multiple_markdown_sections() -> None:
    chunker = SemanticTextChunker(target_chunk_tokens=30, chunk_overlap_tokens=5)
    content = """# Overview
Fitness fundamentals are critical for progressive overload and safety.

## Warmup
Warm up for 5 to 10 minutes using dynamic movements.

## Working Sets
Perform 3 sets of 8 to 12 repetitions with 2 minutes rest between sets.
"""
    chunks = chunker.chunk_document(
        content,
        document_slug="workout-guide",
        document_title="Workout Guide",
        category="fitness",
    )
    assert len(chunks) >= 3
    headers = [c.metadata.section_header for c in chunks]
    assert "Overview" in headers
    assert "Warmup" in headers
    assert "Working Sets" in headers


def test_chunking_subdivides_large_paragraphs() -> None:
    chunker = SemanticTextChunker(target_chunk_tokens=25, chunk_overlap_tokens=5)
    sentences = [
        f"Sentence {i} explains step {i} of the resistance training technique thoroughly."
        for i in range(10)
    ]
    large_paragraph = " ".join(sentences)
    chunks = chunker.chunk_document(
        large_paragraph,
        document_slug="large-guide",
        document_title="Large Guide",
        category="fitness",
    )
    assert len(chunks) > 1
    for chunk in chunks:
        assert chunk.token_count <= 40


@pytest.mark.asyncio
async def test_ingestion_service_process_document() -> None:
    fake_llm = FakeLlm()
    ingestion = IngestionService(
        embedder=fake_llm,
        chunker=SemanticTextChunker(target_chunk_tokens=50, chunk_overlap_tokens=10),
        embedding_model="gemini-embedding-001",
        output_dimensionality=768,
    )
    doc = KnowledgeDocument(
        slug="protein-hypertrophy",
        title="Optimal Protein Intake for Hypertrophy",
        category="nutrition",
        content="Consume 1.6 to 2.2 grams of protein per kilogram of body weight daily for maximum hypertrophy.",
        author="ISSN Position Stand",
    )
    embedded_chunks = await ingestion.process_document(doc)
    assert len(embedded_chunks) >= 1
    assert len(embedded_chunks[0].embedding) == 768
    assert (
        embedded_chunks[0].chunk.metadata.document_title == "Optimal Protein Intake for Hypertrophy"
    )
    assert len(fake_llm.calls) == 1
    call = fake_llm.calls[0]
    assert call["model"] == "gemini-embedding-001"
    assert call["output_dimensionality"] == 768
    assert call["task_type"] == "RETRIEVAL_DOCUMENT"
