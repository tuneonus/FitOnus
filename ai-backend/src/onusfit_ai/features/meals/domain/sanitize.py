"""Safety net over what the model said, applied after parsing and before anything is returned.

The parsers (parsing.py, photo_parsing.py) reproduce the former Node behavior exactly, and that
behavior trusts every number the model returns: a hallucinated "1,000,000,000,000 kcal", a
negative serving weight or a 500 item meal would go straight to the member's diary. This step
bounds all of it (see limits.py) and recomputes the totals from the bounded items. When it had to
change a value it says so: the item's confidence drops to "low" and the reply carries a notice,
so the app asks the member to review instead of presenting the number as sound.
"""

import math
import re

# `import ... as limits` (not `from ...domain import limits`): this package's __init__ imports this
# module, so reading a name from the package here made a cycle that only worked by import order.
import onusfit_ai.features.meals.domain.limits as limits
from onusfit_ai.features.meals.domain.detected_food import DetectedFoodItem
from onusfit_ai.features.meals.domain.photo import MealPhotoResult
from onusfit_ai.features.meals.domain.voice import VoiceMealResult
from onusfit_ai.shared.utils.js_compat import js_round
from onusfit_ai.shared.utils.text import clean_text, redact_sensitive_text

_MEDICAL_CLAIM_PATTERN = re.compile(
    r"\b(?:"
    r"diagnos(?:e|ed|es|ing|is)"
    r"|prescrib(?:e|ed|es|ing)"
    r"|clinical\s+treatment"
    r"|insulin\s+dos(?:age|e)"
    r"|stop\s+taking\s+(?:your\s+)?medication"
    r"|cure(?:s|d)?\s+(?:diabetes|cancer|hypertension|disease)"
    r"|treat(?:s|ed|ing)?\s+(?:diabetes|hypertension|disease)"
    r")\b",
    re.IGNORECASE,
)
_MEDICAL_SAFETY_NOTICE = (
    "Nutrition figures are non-medical estimates; consult a clinician for medical guidance."
)
_PORTION_UNCERTAINTY_NOTICE = (
    "Estimated nutrition values are uncertain; verify portion sizes before saving."
)


def one_decimal(value: float) -> float:
    return js_round(value * 10) / 10


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
    """The item with every field inside its bounds, and whether any value was changed.

    If any nutritional value is adjusted (e.g. hallucinated 100,000 kcal), the confidence is
    lowered to 'low' and the client is notified to review amounts.
    """
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

    # Flag gross energy/macro hallucinations (e.g. 50g protein + 30g fat claiming 15 kcal)
    # or macronutrient mass exceeding serving weight without triggering on normal Atwater variance.
    macro_kcal = protein * 4.0 + carbs * 4.0 + fat * 9.0
    if macro_kcal >= 60.0 and abs(kcal - macro_kcal) > max(150.0, 0.55 * macro_kcal):
        adjusted = True
    elif kcal == 0 and macro_kcal >= 80.0:
        adjusted = True
    elif weight > 0 and (protein + carbs + fat) > (weight * 1.25):
        adjusted = True

    raw_name = redact_sensitive_text(item.name)
    raw_serving = redact_sensitive_text(item.serving)
    name = clean_text(raw_name, limits.MAX_NAME_LENGTH) or f"Food Item {index + 1}"
    serving = clean_text(raw_serving, limits.MAX_SERVING_TEXT_LENGTH) or f"{weight:g}g"
    unit = clean_text(item.serving_unit or "", limits.MAX_UNIT_LENGTH) or "serving"
    if _MEDICAL_CLAIM_PATTERN.search(name):
        name = _MEDICAL_CLAIM_PATTERN.sub("[non-medical estimate]", name)
        adjusted = True
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


def compute_meal_totals(items: list[DetectedFoodItem]) -> dict[str, float]:
    """Compute rounded meal totals across a bounded list of detected food items."""
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


def sanitize_food_items(items: list[DetectedFoodItem]) -> tuple[list[DetectedFoodItem], bool]:
    """Bound every item to safety caps and flag adjustments."""
    kept = items[: limits.MAX_ITEMS]
    adjusted = len(kept) < len(items)
    out: list[DetectedFoodItem] = []
    for index, item in enumerate(kept):
        clean, changed = sanitize_item(item, index)
        adjusted = adjusted or changed
        out.append(clean)
    return out, adjusted


def sanitize_narrative_text(text: str | None, max_length: int) -> tuple[str | None, bool]:
    """Redact secrets and neutralize medical diagnosis/prescription claims in model text."""
    return _sanitize_narrative(text, max_length)


def _totals(items: list[DetectedFoodItem]) -> dict[str, float]:
    return compute_meal_totals(items)


def _sanitize_items(items: list[DetectedFoodItem]) -> tuple[list[DetectedFoodItem], bool]:
    return sanitize_food_items(items)


def _sanitize_narrative(text: str | None, max_length: int) -> tuple[str | None, bool]:
    if not text:
        return None, False
    redacted = redact_sensitive_text(text)
    medical_flagged = bool(_MEDICAL_CLAIM_PATTERN.search(redacted))
    if medical_flagged:
        redacted = _MEDICAL_CLAIM_PATTERN.sub("[non-medical estimate]", redacted)
    cleaned = clean_text(redacted, max_length)
    return (cleaned or None), medical_flagged


def _reason(
    existing: str | None,
    adjusted: bool,
    *,
    medical_flagged: bool = False,
    low_confidence: bool = False,
) -> str | None:
    text, reason_medical = _sanitize_narrative(existing, limits.MAX_REASON_LENGTH)
    if medical_flagged or reason_medical:
        if not text:
            return _MEDICAL_SAFETY_NOTICE
        return clean_text(f"{text} ({_MEDICAL_SAFETY_NOTICE})", limits.MAX_REASON_LENGTH)
    if adjusted and not text:
        return limits.ADJUSTED_NOTICE
    if low_confidence and not text:
        return _PORTION_UNCERTAINTY_NOTICE
    return text or None


def sanitize_photo_result(result: MealPhotoResult) -> MealPhotoResult:
    items, adjusted = _sanitize_items(result.items)
    summary_text, summary_medical = _sanitize_narrative(result.summary, limits.MAX_SUMMARY_LENGTH)
    all_items_low = bool(items) and all(item.confidence == "low" for item in items)
    calibrated_confidence = (
        min(result.overall_confidence, 0.5)
        if (adjusted or all_items_low)
        else result.overall_confidence
    )
    uncertain = adjusted or all_items_low or calibrated_confidence < 0.5
    update: dict[str, object] = {
        "summary": summary_text or "",
        "unclear_reason": _reason(
            result.unclear_reason,
            adjusted,
            medical_flagged=summary_medical,
            low_confidence=uncertain and bool(items or result.items),
        ),
    }
    if items or result.items:
        update.update(items=items, **_totals(items))
        if adjusted or all_items_low or summary_medical:
            update["overall_confidence"] = min(calibrated_confidence, 0.5)
    elif summary_medical:
        update["overall_confidence"] = min(result.overall_confidence, 0.5)
    return result.model_copy(update=update)


def sanitize_voice_result(result: VoiceMealResult) -> VoiceMealResult:
    items, adjusted = _sanitize_items(result.items)
    transcript_text, transcript_medical = _sanitize_narrative(
        result.transcript, limits.MAX_TRANSCRIPT_LENGTH
    )
    all_items_low = bool(items) and all(item.confidence == "low" for item in items)
    update: dict[str, object] = {
        "transcript": transcript_text or "",
        "detected_language": clean_text(result.detected_language, limits.MAX_LANGUAGE_LENGTH)
        or "en",
        "unclear_reason": _reason(
            result.unclear_reason,
            adjusted,
            medical_flagged=transcript_medical,
            low_confidence=all_items_low,
        ),
    }
    if items or result.items:
        update.update(items=items, **_totals(items))
        if adjusted or all_items_low or transcript_medical:
            update["confidence"] = "low"
    elif transcript_medical:
        update["confidence"] = "low"
    return result.model_copy(update=update)
