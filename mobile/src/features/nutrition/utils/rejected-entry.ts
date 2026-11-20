import type { RejectedNutritionLog } from '../services/nutrition-offline-sync';
import type { LogMealInput, LogWaterInput } from '../types/nutrition';

/** A one-line description of what the member logged, from the payload kept with the refused entry. */
export function describeRejectedEntry(entry: RejectedNutritionLog): string {
  if (entry.kind === 'water') {
    const water = entry.payload as LogWaterInput;
    return `Water · ${water.amountMl} ml`;
  }
  const meal = entry.payload as LogMealInput;
  const items = meal.items ?? [];
  const names = items
    .slice(0, 2)
    .map((item) => item.foodName)
    .filter(Boolean)
    .join(', ');
  const more = items.length > 2 ? ` +${items.length - 2} more` : '';
  const mealType = meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1);
  return names ? `${mealType} · ${names}${more}` : mealType;
}
