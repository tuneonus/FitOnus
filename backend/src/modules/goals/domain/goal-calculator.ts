/**
 * Pure deterministic calculation engine for goal progress and directional metrics.
 * Zero external dependencies, zero floating-point edge-case leaks, fully clamped [0.0, 1.0].
 */

export type GoalCadence = 'once' | 'daily' | 'weekly' | 'streak';
export type GoalDirection = 'decrease' | 'increase' | 'maintain';

export interface ProgressCalculationParams {
  start: number;
  current: number;
  target: number;
  cadence: GoalCadence;
  direction?: GoalDirection;
  tolerance?: number;
}

export function calculateGoalProgress(params: ProgressCalculationParams): number {
  const { start, current, target, cadence, direction = 'decrease', tolerance = 1.5 } = params;

  // 1. Daily, Weekly, or Streak Cadences (Target resets or accumulates per period)
  if (cadence === 'daily' || cadence === 'streak' || cadence === 'weekly') {
    if (target <= 0) return 1.0;
    return Math.max(0, Math.min(1.0, Number((current / target).toFixed(4))));
  }

  // 2. Maintain Goal Cadence (Progress is 100% within tolerance band, then drops linearly)
  if (direction === 'maintain') {
    const diff = Math.abs(current - target);
    if (diff <= tolerance) {
      return 1.0;
    }
    // Beyond tolerance, linear decay over 5.0 units
    const decay = (diff - tolerance) / 5.0;
    return Math.max(0, Math.min(1.0, Number((1.0 - decay).toFixed(4))));
  }

  // 3. Directional Once-off Goals (Weight, Times, Milestones)
  if (direction === 'increase') {
    const totalRequired = target - start;
    if (totalRequired <= 0) return current >= target ? 1.0 : 0.0;
    const gained = current - start;
    const progress = gained / totalRequired;
    return Math.max(0, Math.min(1.0, Number(progress.toFixed(4))));
  }

  // Decrease Goals (e.g. weightLoss, run time where lower is better)
  const totalRequired = start - target;
  if (totalRequired <= 0) return current <= target ? 1.0 : 0.0;
  const lost = start - current;
  const progress = lost / totalRequired;
  return Math.max(0, Math.min(1.0, Number(progress.toFixed(4))));
}
