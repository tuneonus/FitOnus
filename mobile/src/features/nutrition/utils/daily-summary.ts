import type { BackendMealView, DailyNutritionView, WaterTargetView } from '../types/nutrition';

/**
 * Pure updates of the cached daily summary, so a delete or an undo is visible at once and still agrees with what
 * the backend will return on the next refresh (`consumed` is the sum of the day's meal totals, one decimal).
 */

const round1 = (value: number) => Math.round(value * 10) / 10;

function withMeals(summary: DailyNutritionView, meals: BackendMealView[]): DailyNutritionView {
  const sum = (pick: (meal: BackendMealView) => number) =>
    round1(meals.reduce((total, m) => total + pick(m), 0));
  return {
    ...summary,
    meals,
    consumed: {
      ...summary.consumed,
      calories: sum((m) => m.totalCalories),
      proteinG: sum((m) => m.totalProteinG),
      carbsG: sum((m) => m.totalCarbsG),
      fatG: sum((m) => m.totalFatG),
      fiberG: sum((m) => m.totalFiberG),
    },
  };
}

export function removeMealFromSummary(
  summary: DailyNutritionView,
  mealId: string,
): DailyNutritionView {
  return withMeals(
    summary,
    summary.meals.filter((meal) => meal.id !== mealId),
  );
}

/** Adds a meal (or replaces the one with the same id) when it belongs to the summary's day. */
export function addMealToSummary(
  summary: DailyNutritionView,
  meal: BackendMealView,
): DailyNutritionView {
  if (meal.date !== summary.date) return summary;
  const others = summary.meals.filter((existing) => existing.id !== meal.id);
  return withMeals(summary, [...others, meal]);
}

export function removeWaterFromSummary(
  summary: DailyNutritionView,
  entryId: string,
): DailyNutritionView {
  const entries = summary.waterEntries ?? [];
  const entry = entries.find((candidate) => candidate.id === entryId);
  if (!entry) return summary;
  return {
    ...summary,
    waterEntries: entries.filter((candidate) => candidate.id !== entryId),
    consumed: {
      ...summary.consumed,
      waterMl: Math.max(0, summary.consumed.waterMl - entry.amountMl),
    },
  };
}

/**
 * The summary with a new water goal applied, so the goal shows at once and still agrees with what the backend returns
 * on the next refresh (`remaining.waterMl` is what is left of the goal, never negative).
 */
export function withWaterTarget(summary: DailyNutritionView, target: WaterTargetView): DailyNutritionView {
  const base = summary.targets ?? {
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    waterMl: null,
  };
  const targets = { ...base, waterMl: target.targetMl, waterSource: target.source };
  const left = target.targetMl === null ? 0 : Math.max(0, target.targetMl - summary.consumed.waterMl);
  return {
    ...summary,
    targets,
    remaining: summary.remaining
      ? { ...summary.remaining, waterMl: left }
      : target.targetMl === null
        ? null
        : { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, waterMl: left },
  };
}
