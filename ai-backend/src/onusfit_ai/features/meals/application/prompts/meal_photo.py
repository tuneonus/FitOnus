"""Meal photo prompt, ported 1:1 from the former Node GeminiMealPhotoService.buildPrompt.

tests/fixtures/meal_photo/prompt_cases.json holds the exact prompts the Node code produced for seven
combinations of meal type and notes; tests/test_meal_photo_prompt.py compares against them. To change
the wording on purpose, bump PROMPT_VERSION and regenerate the fixture in the same change.
"""

PROMPT_VERSION = "meal_photo_v1_node_parity"

_HEAD = """You are OnusFit AI Meal Scanner — an expert nutritional biochemist, food recognition specialist, and dietitian.
Analyze the provided food photograph carefully.

"""

_TAIL = """
INSTRUCTIONS:
1. Determine if the photograph contains recognizable food or beverages. If not (e.g. random objects, empty plate, pets, selfie, blurry unidentifiable image), set "isFood": false.
2. If food is present, identify every distinct food item on the plate/container.
3. For each detected food item:
   - Identify the standard food name (e.g., "Grilled Salmon Fillet", "Steamed Brown Rice", "Mixed Garden Salad").
   - Estimate the realistic portion weight in grams and volume (e.g. 150g, 1 cup, 2 slices).
   - Estimate calories (kcal), protein (g), carbohydrates (g), fat (g), and dietary fiber (g) based on standard USDA nutritional reference values.
   - Assign confidence: "high", "medium", or "low".
4. Mark every single value as an estimate based on visual analysis.
5. Provide a short 1-sentence summary of the meal.
6. Output STRICTLY VALID JSON ONLY without markdown backticks matching this schema:
{
  "isFood": true,
  "summary": "Grilled chicken breast with basmati rice and steamed broccoli",
  "confidence": "high",
  "unclearReason": null,
  "items": [
    {
      "name": "Grilled Chicken Breast",
      "portionDescription": "150g fillet",
      "servingWeightG": 150,
      "servingUnit": "fillet",
      "servingSize": 1,
      "calories": 248,
      "proteinG": 46.5,
      "carbsG": 0,
      "fatG": 5.4,
      "fiberG": 0,
      "confidence": "high"
    }
  ]
}

If no food is visible, return:
{
  "isFood": false,
  "summary": "No food detected",
  "confidence": "low",
  "unclearReason": "The image does not appear to contain recognizable food or beverage items.",
  "items": []
}"""


def build_prompt(meal_type: str | None, notes: str | None) -> str:
    """Empty strings are ignored, like the JavaScript truthiness checks in the Node original."""
    context = ", ".join(
        part
        for part in (
            f"Assumed meal type: {meal_type}" if meal_type else None,
            f'User notes: "{notes}"' if notes else None,
        )
        if part
    )
    return _HEAD + (f"ADDITIONAL CONTEXT: {context}\n" if context else "") + _TAIL
