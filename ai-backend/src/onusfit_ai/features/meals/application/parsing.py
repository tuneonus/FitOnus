"""Turns Gemini's raw text into a voice-meal result.

Ported 1:1 from `parseGeminiOutput` in the former Node GeminiVoiceMealService, including its quirks
(`Number(x) || 0`, `Math.round`, `String(x)`), because the mobile app relied on that behavior. The
helpers in shared/utils/js_compat.py reproduce the JavaScript semantics; tests/fixtures/voice_meal/
parse_cases.json holds 22 cases rendered by the Node code.
"""

from datetime import UTC, datetime
from typing import Any, Literal

from onusfit_ai.features.meals.domain.detected_food import DetectedFoodItem
from onusfit_ai.features.meals.domain.voice import VoiceMealResult
from onusfit_ai.shared.utils.js_compat import (
    js_or,
    js_prop,
    js_round,
    js_string,
    js_truthy,
    number_or,
    strict_json_loads,
    strip_code_fences,
)

VoiceMealOutcome = Literal["ok", "no_food", "parse_failed"]

_CONFIDENCES = ("high", "medium", "low")
NO_FOOD_REASON = "No food recognized from voice entry."
NOT_FORMATTED_REASON = "AI response was not formatted correctly. Please try again."


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def one_decimal(value: float) -> float:
    return js_round(value * 10) / 10


def _empty_result(
    transcript: str, language: str, reason: str, *, total_fiber: float | None = 0
) -> VoiceMealResult:
    return VoiceMealResult(
        transcript=transcript,
        detected_language=language,
        items=[],
        confidence="low",
        total_kcal=0,
        total_protein_grams=0,
        total_carbs_grams=0,
        total_fat_grams=0,
        total_fiber_grams=total_fiber,
        unclear_reason=reason,
        parsed_at=now_iso(),
    )


def _parse_item(item: Any, index: int, now_ms: int) -> DetectedFoodItem:
    calories = number_or(js_prop(item, "calories"), 0)
    kcal = max(0, js_round(calories))
    protein = max(0.0, one_decimal(number_or(js_prop(item, "proteinG"), 0)))
    carbs = max(0.0, one_decimal(number_or(js_prop(item, "carbsG"), 0)))
    fat = max(0.0, one_decimal(number_or(js_prop(item, "fatG"), 0)))
    fiber = max(0.0, one_decimal(number_or(js_prop(item, "fiberG"), 0)))
    confidence = js_prop(item, "confidence")
    weight_raw = js_prop(item, "servingWeightG")
    return DetectedFoodItem(
        id=f"voice-food-{now_ms}-{index}",
        name=js_string(js_or(js_prop(item, "name"), f"Food Item {index + 1}")),
        brand="AI Voice Estimate",
        serving=js_string(
            js_or(js_prop(item, "portionDescription"), f"{js_string(js_or(weight_raw, 100))}g")
        ),
        serving_weight_g=number_or(weight_raw, 100),
        serving_unit=js_string(js_or(js_prop(item, "servingUnit"), "serving")),
        serving_size=number_or(js_prop(item, "servingSize"), 1),
        kcal=kcal,
        protein=protein,
        carbs=carbs,
        fat=fat,
        fiber=fiber,
        confidence=confidence if confidence in _CONFIDENCES else "medium",
        is_ai_estimated=True,
    )


def parse_voice_meal_output(
    raw_text: str, fallback_transcript: str | None
) -> tuple[VoiceMealResult, VoiceMealOutcome]:
    try:
        parsed = strict_json_loads(strip_code_fences(raw_text))

        transcript = js_string(
            js_or(js_prop(parsed, "transcript"), fallback_transcript, "")
        ).strip()
        language = js_string(js_or(js_prop(parsed, "detectedLanguage"), "en"))
        raw_items = js_prop(parsed, "items")

        if not (isinstance(raw_items, list) and len(raw_items) > 0):
            reason = js_prop(parsed, "unclearReason")
            return (
                _empty_result(
                    transcript, language, reason if isinstance(reason, str) else NO_FOOD_REASON
                ),
                "no_food",
            )

        now_ms = int(datetime.now(UTC).timestamp() * 1000)
        items = [_parse_item(item, index, now_ms) for index, item in enumerate(raw_items)]

        # Plain left-to-right addition like JS reduce (Python's sum() compensates and can differ).
        total_kcal = 0
        protein = carbs = fat = fiber = 0.0
        for item in items:
            total_kcal += int(item.kcal)
            protein += item.protein
            carbs += item.carbs
            fat += item.fat
            fiber += item.fiber or 0

        top_confidence = js_prop(parsed, "confidence")
        reason = js_prop(parsed, "unclearReason")
        result = VoiceMealResult(
            transcript=transcript,
            detected_language=language,
            items=items,
            confidence=top_confidence if top_confidence in _CONFIDENCES else "medium",
            total_kcal=total_kcal,
            total_protein_grams=one_decimal(protein),
            total_carbs_grams=one_decimal(carbs),
            total_fat_grams=one_decimal(fat),
            total_fiber_grams=one_decimal(fiber),
            unclear_reason=js_string(reason) if js_truthy(reason) else None,
            parsed_at=now_iso(),
        )
        return result, "ok"
    except (ValueError, TypeError, OverflowError):
        return (
            _empty_result(fallback_transcript or "", "en", NOT_FORMATTED_REASON),
            "parse_failed",
        )
