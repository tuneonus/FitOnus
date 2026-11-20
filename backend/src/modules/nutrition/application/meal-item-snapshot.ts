import { MealItem } from '../domain/meal.js';
import { MEAL_ITEM_LIMITS, assertMealItemPortionWithinLimits } from '../domain/nutrition-limits.js';
import { assertPortionInput, type LogMealItemInput } from './meal-item-builder.js';

/**
 * One line of a meal edit. `mealItemId` names an item that is already stored in the meal being edited; without
 * it the line is a new item and is priced like any logged item (`buildMealItem`).
 */
export interface UpdateMealItemInput extends LogMealItemInput {
  mealItemId?: string | undefined;
}

/** Two stored weights (2 decimals) or multipliers (2 decimals) closer than this are the same portion. */
const WEIGHT_TOLERANCE_G = 0.01;
const MULTIPLIER_TOLERANCE = 0.005;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Keeps an item that is already stored in a meal as it was logged.
 *
 * A meal item is a frozen snapshot: the numbers were true when the user logged it, and editing the meal (removing
 * a sibling, changing another item's portion) must not re-price it from today's catalog row or from numbers a
 * client rounded for display. So an edit line that names a stored item is resolved from the stored item:
 *  - same portion  -> the stored item itself, untouched (same id, same numbers, same created_at);
 *  - other portion -> the stored snapshot scaled by `newWeight / storedWeight`, so the item stays consistent with
 *                     what was logged. Client-sent nutrition numbers are ignored in both cases.
 * The new weight is `loggedWeightG` when sent, otherwise `servingMultiplier x servingWeightG`.
 *
 * Returns null when the line points at a different food than the stored item (it is a replacement, not an
 * edit); the caller prices it as a new item.
 */
export function reuseStoredItem(stored: MealItem, input: LogMealItemInput): MealItem | null {
  if ((input.foodId ?? null) !== stored.foodId) return null;
  assertPortionInput(input);

  const samePortion =
    input.loggedWeightG !== undefined
      ? Math.abs(input.loggedWeightG - stored.loggedWeightG) < WEIGHT_TOLERANCE_G
      : Math.abs(input.servingMultiplier - stored.servingMultiplier) < MULTIPLIER_TOLERANCE;
  if (samePortion) return stored;

  const newWeightG = round(input.loggedWeightG ?? input.servingMultiplier * stored.servingWeightG, 2);
  const ratio = newWeightG / stored.loggedWeightG;
  // The stored multiplier has two decimals; a tiny portion of a huge serving would round to 0.00 and violate
  // the `> 0` constraint, so it is floored. The exact portion lives in logged_weight_g.
  const servingMultiplier = Math.max(
    round(newWeightG / stored.servingWeightG, 2),
    MEAL_ITEM_LIMITS.servingMultiplier.min,
  );
  const scaled = {
    servingMultiplier,
    loggedWeightG: newWeightG,
    calories: round(stored.calories * ratio, 1),
    proteinG: round(stored.proteinG * ratio, 2),
    carbsG: round(stored.carbsG * ratio, 2),
    fatG: round(stored.fatG * ratio, 2),
    fiberG: round(stored.fiberG * ratio, 2),
  };
  assertMealItemPortionWithinLimits(scaled);

  return new MealItem({
    id: stored.id,
    mealId: stored.mealId,
    foodId: stored.foodId,
    foodName: stored.foodName,
    foodBrand: stored.foodBrand,
    servingSize: stored.servingSize,
    servingUnit: stored.servingUnit,
    servingWeightG: stored.servingWeightG,
    createdAt: stored.createdAt,
    ...scaled,
  });
}
