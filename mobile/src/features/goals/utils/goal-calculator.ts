import type { Goal } from '../types/goal';

/**
 * Calculates clamped normalized progress [0.0, 1.0] for a goal.
 */
export function goalProgress(goal: Goal): number {
  if (goal.progress !== undefined && goal.progress !== null) {
    return Math.max(0, Math.min(1, goal.progress));
  }
  if (goal.cadence === 'daily' || goal.cadence === 'streak') {
    return goal.target > 0 ? Math.min(1, Math.max(0, goal.current / goal.target)) : 0;
  }
  const total = goal.start - goal.target;
  if (total === 0) return 1;
  return Math.max(0, Math.min(1, (goal.start - goal.current) / total));
}
