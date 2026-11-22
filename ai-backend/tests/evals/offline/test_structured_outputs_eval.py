"""Offline evaluation tests for Gemini Native Structured Outputs."""

import pytest
from pydantic import ValidationError

from onusfit_ai.features.coach.application.schemas import (
    GeminiCoachInsightsOutput,
    GeminiCoachReplyOutput,
)
from onusfit_ai.features.meals.application.schemas import (
    GeminiDetectedFoodItemOutput,
    GeminiPhotoMealOutput,
    GeminiVoiceMealOutput,
)
from onusfit_ai.features.speech.application.schemas import GeminiTranscribeOutput
from onusfit_ai.shared.utils.js_compat import strict_json_loads, strip_code_fences


def test_coach_reply_schema_valid_conformance() -> None:
    raw = {
        "text": "Great job hitting your workout goal today!",
        "followUps": ["Rest 8 hours", "Drink 500ml water"],
        "sources": ["user_workout_history"],
        "medicalNote": False,
    }
    obj = GeminiCoachReplyOutput.model_validate(raw)
    assert obj.text == "Great job hitting your workout goal today!"
    assert len(obj.follow_ups) == 2
    assert obj.medical_note is False


def test_coach_reply_schema_requires_reply_field() -> None:
    raw = {"followUps": ["Do cardio"], "medicalNote": False}
    with pytest.raises(ValidationError) as exc:
        GeminiCoachReplyOutput.model_validate(raw)
    assert "text" in str(exc.value)


def test_coach_insights_schema_conformance() -> None:
    raw = {
        "greeting": "Hello Athlete!",
        "recommendation": "Focus on recovery today.",
        "insights": [
            {
                "title": "Consistent Squat Overload",
                "description": "Evidence shows 5% volume increase over 2 weeks.",
                "category": "workout",
                "priority": "high",
                "severity": "positive",
                "action": "View Workout",
                "question": "Want to review your leg day volume?",
                "evidence": ["Session 1: 100kg", "Session 2: 105kg"],
                "confidence": "high",
                "requiresDevice": False,
            }
        ],
    }
    obj = GeminiCoachInsightsOutput.model_validate(raw)
    assert obj.greeting == "Hello Athlete!"
    assert len(obj.insights) == 1
    assert obj.insights[0].title == "Consistent Squat Overload"


def test_photo_meal_schema_bounds_and_structure() -> None:
    raw = {
        "isFood": True,
        "summary": "Chicken rice meal",
        "confidence": "high",
        "items": [
            {
                "name": "Chicken Breast",
                "portionDescription": "150g",
                "servingWeightG": 150.0,
                "servingUnit": "piece",
                "servingSize": 1.0,
                "calories": 248.0,
                "proteinG": 46.5,
                "carbsG": 0.0,
                "fatG": 5.4,
                "fiberG": 0.0,
                "confidence": "high",
            }
        ],
    }
    obj = GeminiPhotoMealOutput.model_validate(raw)
    assert obj.is_food is True
    assert len(obj.items) == 1
    item = obj.items[0]
    assert item.name == "Chicken Breast"
    assert item.calories == 248.0
    assert item.protein_g == 46.5


def test_photo_meal_schema_rejects_negative_nutrients() -> None:
    raw = {
        "name": "Invalid Item",
        "calories": -10.0,
        "proteinG": 10.0,
        "carbsG": 20.0,
        "fatG": 5.0,
    }
    with pytest.raises(ValidationError) as exc:
        GeminiDetectedFoodItemOutput.model_validate(raw)
    assert "greater_than_equal" in str(exc.value) or "calories" in str(exc.value)


def test_voice_meal_schema_language_and_items() -> None:
    raw = {
        "transcript": "rendu dosai sambar",
        "detectedLanguage": "tanglish",
        "confidence": "high",
        "items": [
            {
                "name": "Dosa",
                "portionDescription": "2 pieces",
                "servingWeightG": 160.0,
                "servingUnit": "piece",
                "servingSize": 2.0,
                "calories": 260.0,
                "proteinG": 6.0,
                "carbsG": 44.0,
                "fatG": 7.0,
                "fiberG": 2.0,
                "confidence": "high",
            }
        ],
    }
    obj = GeminiVoiceMealOutput.model_validate(raw)
    assert obj.detected_language == "tanglish"
    assert len(obj.items) == 1
    assert obj.items[0].name == "Dosa"


def test_speech_transcribe_schema_conformance() -> None:
    raw = {
        "transcript": "இன்றைய உடற்பயிற்சி முடிந்தது",
        "detectedLanguage": "ta",
        "confidence": "high",
    }
    obj = GeminiTranscribeOutput.model_validate(raw)
    assert obj.transcript == "இன்றைய உடற்பயிற்சி முடிந்தது"
    assert obj.detected_language == "ta"


def test_code_fence_stripping_and_strict_json_loads() -> None:
    markdown_wrapped = '```json\n{"text": "Hello coach!", "medicalNote": false}\n```'
    stripped = strip_code_fences(markdown_wrapped)
    parsed = strict_json_loads(stripped)
    assert isinstance(parsed, dict)
    assert parsed["text"] == "Hello coach!"
    model = GeminiCoachReplyOutput.model_validate(parsed)
    assert model.text == "Hello coach!"
