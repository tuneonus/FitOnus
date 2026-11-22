"""Contracts for POST /internal/v1/ai/coach/memories/extract.

Defines Pydantic models for structured memory extraction using Gemini Native Structured Outputs.
All domain contracts inherit from ContractModel (extra='forbid') to prevent silent contract drift.
"""

from typing import Literal

from pydantic import Field

from onusfit_ai.features.coach.domain.chat import ChatTurn
from onusfit_ai.shared.contracts._base import ContractModel
from onusfit_ai.shared.contracts.common import ModelSelection, Usage

MemoryCategory = Literal[
    "goals",
    "injuries",
    "food",
    "workout",
    "medical",
    "supplements",
    "progress",
    "conversations",
]


class ExtractedMemoryCandidate(ContractModel):
    """An individual atomic memory candidate extracted from conversation dialogue."""

    category: MemoryCategory = Field(
        description="The domain category of the extracted personal fitness fact."
    )
    text: str = Field(
        min_length=3,
        max_length=500,
        description="Concise, factual statement of the user preference or constraint.",
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Model confidence score between 0.0 and 1.0 reflecting certainty.",
    )
    sensitive: bool = Field(
        default=False,
        description="True if fact describes symptoms, injuries, pain, or clinical conditions.",
    )
    source_quote: str = Field(
        min_length=1,
        max_length=500,
        description="The exact user utterance from the conversation supporting this fact.",
    )
    supersedes_quote: str | None = Field(
        default=None,
        max_length=500,
        description="Prior memory quote/fact if this fact updates or contradicts it.",
    )


class GeminiMemoryExtractionOutput(ContractModel):
    """Native Gemini Structured Output schema for the memory extraction task."""

    candidates: list[ExtractedMemoryCandidate] = Field(
        default_factory=list,
        max_length=10,
        description="List of extracted candidate personal memories from the user's statements.",
    )


class MemoryExtractionRequest(ContractModel):
    """Request payload sent from Node.js backend to extract memories."""

    turns: list[ChatTurn] = Field(
        min_length=1,
        max_length=20,
        description="Recent conversation turns to analyze for extractable user facts.",
    )
    existing_memories: list[str] = Field(
        default_factory=list,
        max_length=50,
        description="Currently active or dismissed memories for reference and duplicate avoidance.",
    )
    model: ModelSelection
    deadline_ms: int = Field(default=15000, ge=1000, le=30000)


class MemoryExtractionResponse(ContractModel):
    """Response returned to Node.js backend with candidate suggestions."""

    outcome: Literal["ok", "unstructured"] = "ok"
    candidates: list[ExtractedMemoryCandidate]
    usage: Usage
    trace_id: str
