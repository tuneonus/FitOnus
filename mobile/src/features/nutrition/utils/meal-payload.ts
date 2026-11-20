import type { FoodItem, LogMealItemInput } from '../types/nutrition';

/**
 * The one place a `FoodItem` becomes a meal line for the backend, for logging a new meal and for editing a saved
 * one.
 *
 * - `foodId` is the catalog food or null. The item's `id` is never used for it: on an item read back from a saved
 *   meal `id` is the stored item's id, and sending that as a food id is a "Food not found" error.
 * - For an edit, `mealItemId` tells the backend which stored item the line refers to, so it keeps that item's
 *   snapshot and only applies the portion (`servingMultiplier`, plus the exact `loggedWeightG` when known).
 *   The nutrition numbers are still sent: they are what a brand-new item is made of, and ignored for a stored one.
 */
export function toMealItemPayload(
  item: FoodItem,
  options: { forUpdate?: boolean } = {},
): LogMealItemInput {
  return {
    ...(options.forUpdate && item.mealItemId ? { mealItemId: item.mealItemId } : {}),
    foodId: item.foodId ?? null,
    foodName: item.name,
    foodBrand: item.brand ?? null,
    servingSize: item.servingSize ?? 1,
    servingUnit: item.servingUnit ?? 'serving',
    servingWeightG: item.servingWeightG ?? 100,
    servingMultiplier: item.servingMultiplier ?? 1.0,
    ...(item.loggedWeightG !== undefined ? { loggedWeightG: item.loggedWeightG } : {}),
    calories: item.kcal,
    proteinG: item.protein,
    carbsG: item.carbs,
    fatG: item.fat,
    fiberG: item.fiber,
  };
}
