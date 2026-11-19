"""Turns Gemini's raw text into a meal photo result.

Ported 1:1 from `parseGeminiOutput` in the former Node GeminiMealPhotoService, including its
quirks (`Number(x) || 0`, `Math.round`, `String(x)`, `isFood: "false"` counting as food), because
the mobile app relied on that behavior. The helpers in core/js_compat.py reproduce the JavaScript
semantics; tests/fixtures/meal_photo/parse_cases.json holds 48 cases rendered by the Node code.
"""

from datetime import UTC, datetime
from typing import Any, Literal

from onusfit_ai.contracts.common import DetectedFoodItem
from onusfit_ai.contracts.meal_photo import MealPhotoResult
from onusfit_ai.core.js_compat import (
    js_or,
    js_prop,
    js_round,
    js_string,
    number_or,
    strict_json_loads,
    strip_code_fences,
)
from onusfit_ai.meals.parsing import now_iso, one_decimal

MealPhotoOutcome = Literal["ok", "no_food", "parse_failed"]

_CONFIDENCES = ("high", "medium", "low")
NOT_FORMATTED_SUMMARY = "Unable to parse food analysis"
NOT_FORMATTED_REASON = "AI response was not formatted correctly. Please try again."
NO_FOOD_SUMMARY = "No food recognized"
NO_FOOD_REASON = "No clear food detected in image."
FOOD_SUMMARY = "Analyzed meal photo"


def _empty_result(summary: str, reason: str) -> MealPhotoResult:
    return MealPhotoResult(
        is_food=False,
        summary=summary,
        items=[],
        overall_confidence=0,
        total_kcal=0,
        total_protein_grams=0,
        total_carbs_grams=0,
        total_fat_grams=0,
        total_fiber_grams=0,
        unclear_reason=reason,
        analyzed_at=now_iso(),
    )


def _parse_item(item: Any, index: int, now_ms: int) -> DetectedFoodItem:
    confidence = js_prop(item, "confidence")
    weight_raw = js_prop(item, "servingWeightG")
    return DetectedFoodItem(
        id=f"ai-food-{now_ms}-{index}",
        name=js_string(js_or(js_prop(item, "name"), f"Food Item {index + 1}")),
        brand="AI Estimate",
        serving=js_string(
            js_or(js_prop(item, "portionDescription"), f"{js_string(js_or(weight_raw, 100))}g")
        ),
        serving_weight_g=number_or(weight_raw, 100),
        serving_unit=js_string(js_or(js_prop(item, "servingUnit"), "serving")),
        serving_size=number_or(js_prop(item, "servingSize"), 1),
        kcal=max(0, js_round(number_or(js_prop(item, "calories"), 0))),
        protein=max(0.0, one_decimal(number_or(js_prop(item, "proteinG"), 0))),
        carbs=max(0.0, one_decimal(number_or(js_prop(item, "carbsG"), 0))),
        fat=max(0.0, one_decimal(number_or(js_prop(item, "fatG"), 0))),
        fiber=max(0.0, one_decimal(number_or(js_prop(item, "fiberG"), 0))),
        confidence=confidence if confidence in _CONFIDENCES else "medium",
        is_ai_estimated=True,
    )


def parse_meal_photo_output(raw_text: str) -> tuple[MealPhotoResult, MealPhotoOutcome]:
    try:
        parsed = strict_json_loads(strip_code_fences(raw_text))

        raw_items = js_prop(parsed, "items")
        # `parsed.isFood !== false`: only the JSON value `false` means "not food"
        # (the string "false" is still food).
        is_food = (
            js_prop(parsed, "isFood") is not False
            and isinstance(raw_items, list)
            and len(raw_items) > 0
        )
        summary = js_prop(parsed, "summary")

        if not is_food:
            reason = js_prop(parsed, "unclearReason")
            return (
                _empty_result(
                    summary if isinstance(summary, str) else NO_FOOD_SUMMARY,
                    reason if isinstance(reason, str) else NO_FOOD_REASON,
                ),
                "no_food",
            )

        assert isinstance(raw_items, list)  # narrowed by is_food above
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
        result = MealPhotoResult(
            is_food=True,
            summary=summary if isinstance(summary, str) else FOOD_SUMMARY,
            items=items,
            overall_confidence=(
                0.9 if top_confidence == "high" else 0.5 if top_confidence == "low" else 0.75
            ),
            total_kcal=total_kcal,
            total_protein_grams=one_decimal(protein),
            total_carbs_grams=one_decimal(carbs),
            total_fat_grams=one_decimal(fat),
            total_fiber_grams=one_decimal(fiber),
            analyzed_at=now_iso(),
        )
        return result, "ok"
    except (ValueError, TypeError, OverflowError):
        return _empty_result(NOT_FORMATTED_SUMMARY, NOT_FORMATTED_REASON), "parse_failed"
