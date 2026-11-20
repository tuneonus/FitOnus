"""What a believable AI estimate looks like, so a hostile or invented reply cannot reach a member.

The numbers sit inside what the meal-logging API accepts when the member saves the items
(backend/src/modules/nutrition/domain/nutrition-limits.ts), so anything this service returns can
be saved. The Node side checks the same numbers again on the way in;
backend/tests/unit/nutrition/ai-estimate-limits.test.ts pins that the two files agree, so change
them together.
"""

# Detected items per meal. The logging API accepts 50, but a meal of maximum items must still fit
# its meal totals (50,000 kcal, 5,000 g of macros): 20 x 2,500 kcal, 20 x 250 g.
MAX_ITEMS = 20

# Per item.
MAX_ITEM_KCAL = 2500
MAX_ITEM_MACRO_G = 250
MAX_ITEM_FIBER_G = 100
MAX_SERVING_WEIGHT_G = 5000
MAX_SERVING_SIZE = 1000

# What a missing or non-positive weight or size falls back to.
DEFAULT_SERVING_WEIGHT_G = 100
DEFAULT_SERVING_SIZE = 1

# Text lengths (the logging API accepts a 150 character name and a 30 character serving unit).
MAX_NAME_LENGTH = 150
MAX_SERVING_TEXT_LENGTH = 100
MAX_UNIT_LENGTH = 30
MAX_SUMMARY_LENGTH = 300
MAX_REASON_LENGTH = 300
MAX_TRANSCRIPT_LENGTH = 2000
MAX_LANGUAGE_LENGTH = 50

# Length of the optional hints a member can send (meal type, language, notes); Node enforces it too.
MAX_HINT_LENGTH = 50
MAX_NOTES_LENGTH = 250

ADJUSTED_NOTICE = "Some values looked unrealistic and were adjusted. Please review the amounts."
