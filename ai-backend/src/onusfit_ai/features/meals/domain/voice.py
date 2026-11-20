"""Contract for POST /internal/v1/ai/meals/parse-voice.

Mirrors the existing Node types (backend/src/modules/nutrition/domain/voice-meal.types.ts and
meal-photo.types.ts `DetectedFoodItem`). Node has already validated the user's request, checked
quota and picked the models; this service only turns a transcript and/or audio clip into food items.
"""

from typing import Literal

from pydantic import Field, field_validator, model_validator

from onusfit_ai.features.meals.domain.detected_food import Confidence, DetectedFoodItem
from onusfit_ai.features.meals.domain.limits import MAX_HINT_LENGTH, MAX_TRANSCRIPT_LENGTH
from onusfit_ai.shared.contracts._base import ContractModel
from onusfit_ai.shared.contracts.common import (
    AudioInput,
    ModelSelection,
    Usage,
)
from onusfit_ai.shared.utils.text import clean_prompt_text


class ParseVoiceMealRequest(ContractModel):
    transcript: str | None = Field(default=None, max_length=MAX_TRANSCRIPT_LENGTH)
    audio: AudioInput | None = None
    lang: str | None = Field(default=None, max_length=MAX_HINT_LENGTH)
    meal_type: str | None = Field(default=None, max_length=MAX_HINT_LENGTH)
    model: ModelSelection
    deadline_ms: int = Field(ge=1000, le=30000)

    # Member-written text goes between double quotes in the prompt: one line, no stray quotes.
    @field_validator("transcript", "lang", "meal_type")
    @classmethod
    def _prompt_safe(cls, value: str | None) -> str | None:
        return clean_prompt_text(value)

    @model_validator(mode="after")
    def _needs_transcript_or_audio(self) -> "ParseVoiceMealRequest":
        if not (self.transcript and self.transcript.strip()) and self.audio is None:
            raise ValueError("either transcript or audio is required")
        return self


class VoiceMealResult(ContractModel):
    transcript: str
    detected_language: str
    items: list[DetectedFoodItem]
    confidence: Confidence
    total_kcal: float
    total_protein_grams: float
    total_carbs_grams: float
    total_fat_grams: float
    total_fiber_grams: float | None = None
    unclear_reason: str | None = None
    parsed_at: str


class ParseVoiceMealResponse(ContractModel):
    # "ok": food items found. "no_food": the model returned valid JSON with no items.
    # "parse_failed": the model's reply was not usable JSON (Node already answered with a polite
    # "not formatted correctly" result; the flag makes that failure countable).
    outcome: Literal["ok", "no_food", "parse_failed"]
    result: VoiceMealResult
    usage: Usage
    trace_id: str
