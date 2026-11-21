"""Pydantic schemas for Gemini Native Structured Outputs in Coach Chat and Insights."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class GeminiCoachReplyOutput(BaseModel):
    """Generation schema for Gemini Native Structured Outputs in Coach Chat."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    text: str
    follow_ups: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    medical_note: bool = False


class GeminiInsightItemOutput(BaseModel):
    """Single insight item in Gemini generation schema."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    id: str | None = None
    title: str = Field(description="Short punchy headline")
    description: str = Field(description="Evidence-based guidance")
    category: Literal["workout", "nutrition", "hydration", "goal", "recovery"] = "workout"
    priority: Literal["high", "medium", "low"] = "medium"
    severity: Literal["positive", "watch", "info"] = "info"
    action: str = "Ask Coach"
    question: str = "How can I improve my progress?"
    evidence: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "high"
    requires_device: bool = False


class GeminiCoachInsightsOutput(BaseModel):
    """Root generation schema for Gemini Native Structured Outputs in Coach Insights."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    greeting: str
    recommendation: str | None = None
    insights: list[GeminiInsightItemOutput] = Field(min_length=1)
