import type { NutritionSummary } from '@/features/dashboard/api/dashboard-repository';
import type { MetabolicMetrics } from '../types/profile';

/**
 * Where the numbers on the "Daily targets" card came from:
 *  - `calculated`: the profile's own targets, worked out from the user's goal, weight, height and activity.
 *  - `saved`:      calorie/protein targets saved on the profile (carbs and fat are never saved).
 *  - `missing`:    nothing real to show. The card renders "—" instead of an invented number.
 */
export type DailyTargetsSource = 'calculated' | 'saved' | 'missing';

export interface ResolvedDailyTargets {
  source: DailyTargetsSource;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

const positive = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/**
 * Picks the targets to show without ever presenting a stand-in as the user's own.
 *
 * The dashboard's goals are always numbers, even for a user it knows nothing about (the backend then fills in
 * generic placeholders), so they only count when the backend says they are the user's saved targets
 * (`targetsSource === 'saved'`). `'estimated'`, `'default'` and a missing flag (an older backend) are ignored:
 * the profile's `calculatedTargets` already covers every user who has the inputs for an estimate.
 */
export function resolveDailyTargets(
  calculated: MetabolicMetrics | null | undefined,
  dashboard: Pick<
    NutritionSummary,
    'caloriesGoal' | 'proteinGoal' | 'targetsSource'
  > | null | undefined,
): ResolvedDailyTargets {
  const calories = positive(calculated?.dailyCalorieTarget);
  if (calories !== null) {
    return {
      source: 'calculated',
      calories,
      protein: positive(calculated?.dailyProteinGrams),
      carbs: positive(calculated?.dailyCarbGrams),
      fat: positive(calculated?.dailyFatGrams),
    };
  }

  if (dashboard?.targetsSource === 'saved') {
    return {
      source: 'saved',
      calories: positive(dashboard.caloriesGoal),
      protein: positive(dashboard.proteinGoal),
      carbs: null,
      fat: null,
    };
  }

  return { source: 'missing', calories: null, protein: null, carbs: null, fat: null };
}
