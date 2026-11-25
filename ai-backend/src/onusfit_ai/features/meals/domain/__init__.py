"""Meals domain models, limits, and sanitizers."""

from onusfit_ai.features.meals.domain import limits
from onusfit_ai.features.meals.domain.detected_food import Confidence, DetectedFoodItem
from onusfit_ai.features.meals.domain.multimodal import (
    AnalyzeMultimodalMealRequest,
    AnalyzeMultimodalMealResponse,
    Modality,
    MultimodalContextHint,
    MultimodalMealResult,
)
from onusfit_ai.features.meals.domain.photo import (
    AnalyzeMealPhotoRequest,
    AnalyzeMealPhotoResponse,
    MealPhotoResult,
)
from onusfit_ai.features.meals.domain.sanitize import (
    one_decimal,
    sanitize_item,
    sanitize_photo_result,
    sanitize_voice_result,
)
from onusfit_ai.features.meals.domain.voice import (
    ParseVoiceMealRequest,
    ParseVoiceMealResponse,
    VoiceMealResult,
)

__all__ = [
    "AnalyzeMealPhotoRequest",
    "AnalyzeMealPhotoResponse",
    "AnalyzeMultimodalMealRequest",
    "AnalyzeMultimodalMealResponse",
    "Confidence",
    "DetectedFoodItem",
    "MealPhotoResult",
    "Modality",
    "MultimodalContextHint",
    "MultimodalMealResult",
    "ParseVoiceMealRequest",
    "ParseVoiceMealResponse",
    "VoiceMealResult",
    "limits",
    "one_decimal",
    "sanitize_item",
    "sanitize_photo_result",
    "sanitize_voice_result",
]
