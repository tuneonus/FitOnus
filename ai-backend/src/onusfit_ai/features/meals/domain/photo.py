"""Contract for POST /internal/v1/ai/meals/analyze-photo.

Mirrors the existing Node types (`MealPhotoAnalysisResult` in
backend/src/modules/nutrition/domain/meal-photo.types.ts). Node has already validated the user's
request, checked quota and picked the models; this service only turns a photo into food items.
"""

from typing import Literal

from pydantic import Field, field_validator

from onusfit_ai.features.meals.domain.detected_food import DetectedFoodItem
from onusfit_ai.features.meals.domain.limits import MAX_HINT_LENGTH, MAX_NOTES_LENGTH
from onusfit_ai.shared.contracts._base import ContractModel
from onusfit_ai.shared.contracts.common import ImageInput, ModelSelection, Usage
from onusfit_ai.shared.utils.text import clean_prompt_text


class AnalyzeMealPhotoRequest(ContractModel):
    image: ImageInput
    meal_type: str | None = Field(default=None, max_length=MAX_HINT_LENGTH)
    notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)
    model: ModelSelection
    deadline_ms: int = Field(ge=1000, le=30000)

    # Member-written text goes between double quotes in the prompt: one line, no stray quotes.
    @field_validator("meal_type", "notes")
    @classmethod
    def _prompt_safe(cls, value: str | None) -> str | None:
        return clean_prompt_text(value)


class MealPhotoResult(ContractModel):
    is_food: bool
    summary: str
    items: list[DetectedFoodItem]
    overall_confidence: float
    total_kcal: float
    total_protein_grams: float
    total_carbs_grams: float
    total_fat_grams: float
    total_fiber_grams: float
    unclear_reason: str | None = None
    analyzed_at: str


class AnalyzeMealPhotoResponse(ContractModel):
    # "ok": food items found. "no_food": valid JSON that says no food / has no items (a normal
    # answer for a photo of a desk). "parse_failed": the reply was not usable JSON; Node used to
    # answer this with an `isFood: false` "Unable to parse food analysis" result that looked exactly
    # like "no food", so the flag makes that failure countable.
    outcome: Literal["ok", "no_food", "parse_failed"]
    result: MealPhotoResult
    usage: Usage
    trace_id: str
