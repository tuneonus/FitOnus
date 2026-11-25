"""Domain contracts for unified multimodal (text + audio + image) meal analysis."""

from typing import Literal

from pydantic import Field, field_validator, model_validator

from onusfit_ai.features.meals.domain.detected_food import Confidence, DetectedFoodItem
from onusfit_ai.features.meals.domain.limits import (
    MAX_HINT_LENGTH,
    MAX_NOTES_LENGTH,
    MAX_TRANSCRIPT_LENGTH,
)
from onusfit_ai.shared.contracts._base import ContractModel
from onusfit_ai.shared.contracts.common import AudioInput, ImageInput, ModelSelection, Usage
from onusfit_ai.shared.utils.text import sanitize_multimodal_user_text

Modality = Literal["text", "audio", "image"]


class MultimodalContextHint(ContractModel):
    """Optional fitness/dietary context safely sanitized before entering prompts."""

    meal_type: str | None = Field(default=None, max_length=MAX_HINT_LENGTH)
    lang: str | None = Field(default=None, max_length=MAX_HINT_LENGTH)
    notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)
    dietary_goal: str | None = Field(default=None, max_length=80)
    allergies: list[str] = Field(default_factory=list, max_length=10)
    daily_calorie_target: int | None = Field(default=None, ge=500, le=10_000)

    @field_validator("meal_type", "lang", "notes", "dietary_goal")
    @classmethod
    def _clean_fields(cls, value: str | None) -> str | None:
        return sanitize_multimodal_user_text(value, max_length=MAX_NOTES_LENGTH)

    @field_validator("allergies")
    @classmethod
    def _clean_allergies(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        for entry in values[:10]:
            text = sanitize_multimodal_user_text(entry, max_length=40)
            if text:
                cleaned.append(text)
        return cleaned


class AnalyzeMultimodalMealRequest(ContractModel):
    """Combined text, voice audio, and/or photo meal analysis request."""

    audio: AudioInput | None = None
    image: ImageInput | None = None
    transcript: str | None = Field(default=None, max_length=MAX_TRANSCRIPT_LENGTH)
    context: MultimodalContextHint | None = None
    model: ModelSelection
    deadline_ms: int = Field(default=20_000, ge=1000, le=30_000)

    @field_validator("transcript")
    @classmethod
    def _clean_transcript(cls, value: str | None) -> str | None:
        return sanitize_multimodal_user_text(value, max_length=MAX_TRANSCRIPT_LENGTH)

    @model_validator(mode="after")
    def _require_any_modality(self) -> "AnalyzeMultimodalMealRequest":
        has_text = bool(self.transcript and self.transcript.strip())
        if self.audio is None and self.image is None and not has_text:
            raise ValueError("At least one of audio, image, or transcript is required")
        return self


class MultimodalMealResult(ContractModel):
    """Structured multimodal meal output with calibrated uncertainty and non-medical framing."""

    modalities_used: list[Modality]
    is_food: bool
    summary: str
    transcript: str = ""
    detected_language: str = "en"
    items: list[DetectedFoodItem]
    overall_confidence: float
    confidence: Confidence
    total_kcal: float
    total_protein_grams: float
    total_carbs_grams: float
    total_fat_grams: float
    total_fiber_grams: float
    unclear_reason: str | None = None
    uncertainty_note: str | None = None
    medical_disclaimer: str
    analyzed_at: str


class AnalyzeMultimodalMealResponse(ContractModel):
    """Outcome envelope returned by the multimodal meal analysis workflow."""

    outcome: Literal["ok", "no_food", "parse_failed"]
    result: MultimodalMealResult
    usage: Usage
    trace_id: str
