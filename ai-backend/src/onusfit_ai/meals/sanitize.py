"""Safety net over what the model said, applied after parsing and before anything is returned.

The parsers (parsing.py, photo_parsing.py) reproduce the former Node behavior exactly, and that
behavior trusts every number the model returns: a hallucinated "1,000,000,000,000 kcal", a
negative serving weight or a 500 item meal would go straight to the member's diary. This step
bounds all of it (see limits.py) and recomputes the totals from the bounded items. When it had to
change a value it says so: the item's confidence drops to "low" and the reply carries a notice,
so the app asks the member to review instead of presenting the number as sound.
"""

import math

from onusfit_ai.contracts.common import DetectedFoodItem
from onusfit_ai.contracts.meal_photo import MealPhotoResult
from onusfit_ai.contracts.voice_meal import VoiceMealResult
from onusfit_ai.core.text import clean_text
from onusfit_ai.meals import limits
from onusfit_ai.meals.parsing import one_decimal


def _capped(value: float, maximum: float) -> tuple[float, bool]:
    """(value limited to [0, maximum], whether it was changed). Non-finite counts as changed."""
    if not math.isfinite(value) or value < 0:
        return 0, True
    if value > maximum:
        return maximum, True
    return value, False


def _positive(value: float | None, maximum: float, default: float) -> tuple[float, bool]:
    """A weight or size must be > 0: a missing value is no adjustment, a non-positive one is."""
    if value is None:
        return default, False
    if not math.isfinite(value) or value <= 0:
        return default, True
    if value > maximum:
        return maximum, True
    return value, False


def sanitize_item(item: DetectedFoodItem, index: int) -> tuple[DetectedFoodItem, bool]:
    """The item with every field inside its bounds, and whether any value was changed."""
    kcal, kcal_changed = _capped(item.kcal, limits.MAX_ITEM_KCAL)
    protein, protein_changed = _capped(item.protein, limits.MAX_ITEM_MACRO_G)
    carbs, carbs_changed = _capped(item.carbs, limits.MAX_ITEM_MACRO_G)
    fat, fat_changed = _capped(item.fat, limits.MAX_ITEM_MACRO_G)
    fiber, fiber_changed = _capped(item.fiber or 0, limits.MAX_ITEM_FIBER_G)
    weight, weight_changed = _positive(
        item.serving_weight_g, limits.MAX_SERVING_WEIGHT_G, limits.DEFAULT_SERVING_WEIGHT_G
    )
    size, size_changed = _positive(
        item.serving_size, limits.MAX_SERVING_SIZE, limits.DEFAULT_SERVING_SIZE
    )
    adjusted = any(
        (
            kcal_changed,
            protein_changed,
            carbs_changed,
            fat_changed,
            fiber_changed,
            weight_changed,
            size_changed,
        )
    )

    name = clean_text(item.name, limits.MAX_NAME_LENGTH) or f"Food Item {index + 1}"
    serving = clean_text(item.serving, limits.MAX_SERVING_TEXT_LENGTH) or f"{weight:g}g"
    unit = clean_text(item.serving_unit or "", limits.MAX_UNIT_LENGTH) or "serving"
    # Text that was shortened or rewritten is not a wrong number: it does not lower confidence.

    return (
        item.model_copy(
            update={
                "name": name,
                "serving": serving,
                "serving_unit": unit,
                "serving_weight_g": weight,
                "serving_size": size,
                "kcal": round(kcal),
                "protein": one_decimal(protein),
                "carbs": one_decimal(carbs),
                "fat": one_decimal(fat),
                "fiber": one_decimal(fiber),
                "confidence": "low" if adjusted else item.confidence,
            }
        ),
        adjusted,
    )


def _sanitize_items(items: list[DetectedFoodItem]) -> tuple[list[DetectedFoodItem], bool]:
    kept = items[: limits.MAX_ITEMS]
    adjusted = len(kept) < len(items)
    out: list[DetectedFoodItem] = []
    for index, item in enumerate(kept):
        clean, changed = sanitize_item(item, index)
        adjusted = adjusted or changed
        out.append(clean)
    return out, adjusted


def _totals(items: list[DetectedFoodItem]) -> dict[str, float]:
    # Plain left-to-right addition, like the parsers.
    kcal = 0
    protein = carbs = fat = fiber = 0.0
    for item in items:
        kcal += int(item.kcal)
        protein += item.protein
        carbs += item.carbs
        fat += item.fat
        fiber += item.fiber or 0
    return {
        "total_kcal": kcal,
        "total_protein_grams": one_decimal(protein),
        "total_carbs_grams": one_decimal(carbs),
        "total_fat_grams": one_decimal(fat),
        "total_fiber_grams": one_decimal(fiber),
    }


def _reason(existing: str | None, adjusted: bool) -> str | None:
    text = clean_text(existing, limits.MAX_REASON_LENGTH) if existing else None
    if adjusted and not text:
        return limits.ADJUSTED_NOTICE
    return text or None


def sanitize_photo_result(result: MealPhotoResult) -> MealPhotoResult:
    items, adjusted = _sanitize_items(result.items)
    update: dict[str, object] = {
        "summary": clean_text(result.summary, limits.MAX_SUMMARY_LENGTH),
        "unclear_reason": _reason(result.unclear_reason, adjusted),
    }
    if items or result.items:
        update.update(items=items, **_totals(items))
        if adjusted:
            update["overall_confidence"] = min(result.overall_confidence, 0.5)
    return result.model_copy(update=update)


def sanitize_voice_result(result: VoiceMealResult) -> VoiceMealResult:
    items, adjusted = _sanitize_items(result.items)
    update: dict[str, object] = {
        "transcript": clean_text(result.transcript, limits.MAX_TRANSCRIPT_LENGTH),
        "detected_language": clean_text(result.detected_language, limits.MAX_LANGUAGE_LENGTH)
        or "en",
        "unclear_reason": _reason(result.unclear_reason, adjusted),
    }
    if items or result.items:
        update.update(items=items, **_totals(items))
        if adjusted:
            update["confidence"] = "low"
    return result.model_copy(update=update)
