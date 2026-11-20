"""Detected food items and confidence types for meal analysis."""

from typing import Literal

from onusfit_ai.shared.contracts._base import ContractModel

Confidence = Literal["high", "medium", "low"]


class DetectedFoodItem(ContractModel):
    """One detected food, as the mobile app receives it (shared by photo and voice meal)."""

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

