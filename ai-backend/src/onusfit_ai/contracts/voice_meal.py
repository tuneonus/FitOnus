"""Contract for POST /internal/v1/ai/meals/parse-voice.

Mirrors the existing Node types (backend/src/modules/nutrition/domain/voice-meal.types.ts and
meal-photo.types.ts `DetectedFoodItem`). Node has already validated the user's request, checked
quota and picked the models; this service only turns a transcript and/or audio clip into food items.
"""

from typing import Literal

from pydantic import Field, model_validator

from onusfit_ai.contracts._base import ContractModel
from onusfit_ai.contracts.common import AudioInput, ModelSelection, Usage

Confidence = Literal["high", "medium", "low"]


class ParseVoiceMealRequest(ContractModel):
    transcript: str | None = Field(default=None, max_length=2000)
    audio: AudioInput | None = None
    lang: str | None = Field(default=None, max_length=50)
    meal_type: str | None = Field(default=None, max_length=50)
    model: ModelSelection
    deadline_ms: int = Field(ge=1000, le=30000)

    @model_validator(mode="after")
    def _needs_transcript_or_audio(self) -> "ParseVoiceMealRequest":
        if not (self.transcript and self.transcript.strip()) and self.audio is None:
            raise ValueError("either transcript or audio is required")
        return self


class DetectedFoodItem(ContractModel):
    id: str
    name: str
    brand: str | None = None
    serving: str
    serving_weight_g: float | None = None
    serving_unit: str | None = None
    serving_size: float | None = None
    kcal: float
    protein: float
    carbs: float
    fat: float
    fiber: float | None = None
    confidence: Confidence
    is_ai_estimated: bool


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
