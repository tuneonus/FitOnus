import type { Goal } from '../types/goal';

/**
 * Calculates clamped normalized progress [0.0, 1.0] for a goal.
 */
export function goalProgress(goal: Goal): number {
  if (goal.progress !== undefined && goal.progress !== null && !Number.isNaN(goal.progress)) {
    return Math.max(0, Math.min(1, goal.progress));
  }
  if (goal.cadence === 'daily' || goal.cadence === 'streak') {
    const target = goal.target ?? 0;
    const current = goal.current ?? 0;
    return target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
  }
  const start = goal.start ?? 0;
  const current = goal.current ?? start;
  const target = goal.target ?? start;
  const total = start - target;
  if (total === 0) return 1;
  const ratio = (start - current) / total;
  if (Number.isNaN(ratio)) return 0;
  return Math.max(0, Math.min(1, ratio));
}
