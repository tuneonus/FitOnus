import type {
  DailyNutritionView,
  MealEntry,
  Nutrients,
} from '@/features/nutrition/types/nutrition';

/** Device-local calendar date: UTC slicing puts early-morning logs on the wrong day. */
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function progressRatio(value: number | null, goal: number | null): number {
  return value !== null &&
    Number.isFinite(value) &&
    goal !== null &&
    Number.isFinite(goal) &&
    goal > 0
    ? Math.min(1, Math.max(0, value / goal))
    : 0;
}

const target = (value: number | null | undefined) =>
  value != null && Number.isFinite(value) && value > 0 ? value : null;

export function buildHomeNutrition({
  date,
  summary,
  cachedSummary,
  entries,
  selectedDate,
  waterMl,
}: {
  date: string;
  summary: DailyNutritionView | null;
  cachedSummary: DailyNutritionView | null;
  entries: MealEntry[];
  selectedDate: string;
  waterMl: number;
}) {
  const source =
    summary?.date === date ? summary : cachedSummary?.date === date ? cachedSummary : null;
  const confirmedIds = new Set(source?.meals.map((meal) => meal.id));
  const pending = entries.filter(
    (entry) =>
      !entry.isSynced && (entry.date ?? selectedDate) === date && !confirmedIds.has(entry.id),
  );
  const local = pending
    .flatMap((entry) => entry.items)
    .reduce<Nutrients>(
      (sum, food) => ({
        kcal: sum.kcal + food.kcal,
        protein: sum.protein + food.protein,
        carbs: sum.carbs + food.carbs,
        fat: sum.fat + food.fat,
        fiber: sum.fiber + food.fiber,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    );
  const available = source !== null || pending.length > 0;
  const totals = {
    kcal: available ? (source?.consumed.calories ?? 0) + local.kcal : null,
    protein: available ? (source?.consumed.proteinG ?? 0) + local.protein : null,
    carbs: available ? (source?.consumed.carbsG ?? 0) + local.carbs : null,
    fat: available ? (source?.consumed.fatG ?? 0) + local.fat : null,
  };
  const goals = {
    kcal: target(source?.targets?.calories),
    protein: target(source?.targets?.proteinG),
    carbs: target(source?.targets?.carbsG),
    fat: target(source?.targets?.fatG),
    waterMl: target(source?.targets?.waterMl),
  };
  // Water entries are append-only. Keep observed optimistic additions visible during refetch.
  const localWater =
    selectedDate === date && (cachedSummary?.date === date || waterMl > 0) ? waterMl : null;
  const water = source ? Math.max(source.consumed.waterMl, localWater ?? 0) : localWater;
  return {
    available,
    totals,
    goals,
    waterMl: water,
    remaining: totals.kcal !== null && goals.kcal !== null ? goals.kcal - totals.kcal : null,
    pendingMeals: pending.length,
    sourceLabel: source
      ? 'Today’s logged nutrition'
      : pending.length > 0
        ? 'Saved on this device'
        : 'Your nutrition, at a glance',
  };
}

export type HomeNutrition = ReturnType<typeof buildHomeNutrition>;
