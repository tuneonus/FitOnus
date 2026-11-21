"""Meals application use cases and parsers."""

from onusfit_ai.features.meals.application.parsing import parse_voice_meal_output
from onusfit_ai.features.meals.application.photo import analyze_meal_photo
from onusfit_ai.features.meals.application.photo_parsing import parse_meal_photo_output
from onusfit_ai.features.meals.application.schemas import (
    GeminiDetectedFoodItemOutput,
    GeminiPhotoMealOutput,
    GeminiVoiceMealOutput,
    is_meal_photo_structured_output_enabled,
    is_voice_meal_structured_output_enabled,
)
from onusfit_ai.features.meals.application.voice import parse_voice_meal

__all__ = [
    "GeminiDetectedFoodItemOutput",
    "GeminiPhotoMealOutput",
    "GeminiVoiceMealOutput",
    "analyze_meal_photo",
    "is_meal_photo_structured_output_enabled",
    "is_voice_meal_structured_output_enabled",
    "parse_meal_photo_output",
    "parse_voice_meal",
    "parse_voice_meal_output",
]
