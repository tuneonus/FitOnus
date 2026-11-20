import type { DailyNutritionTargets } from '../types/nutrition';

/** The goal a member may set. The backend enforces the same range (500-8000 ml). */
export const WATER_GOAL_MIN_ML = 500;
export const WATER_GOAL_MAX_ML = 8000;
export const WATER_GOAL_STEP_ML = 250;

/** The nearest allowed goal: a whole number of steps inside the range. */
export function clampWaterGoal(ml: number): number {
  if (!Number.isFinite(ml)) return WATER_GOAL_MIN_ML;
  const stepped = Math.round(ml / WATER_GOAL_STEP_ML) * WATER_GOAL_STEP_ML;
  return Math.min(WATER_GOAL_MAX_ML, Math.max(WATER_GOAL_MIN_ML, stepped));
}

export function stepWaterGoal(current: number, direction: 1 | -1): number {
  return clampWaterGoal(current + direction * WATER_GOAL_STEP_ML);
}

/** One honest line about where the goal came from, so an estimate is never presented as the member's own choice. */
export function describeWaterGoal(targets: DailyNutritionTargets | null | undefined): string {
  if (!targets || targets.waterMl === null) return 'No daily goal yet. Set one to track your progress.';
  return targets.waterSource === 'estimated'
    ? 'Estimated from your weight (35 ml per kg). Set your own goal if you prefer.'
    : 'Your own daily goal.';
}

export function formatLitres(ml: number): string {
  return `${(ml / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} L`;
}
