/**
 * Goals & Habits Analytics Domain Models & Calculation Engine
 *
 * Implements pure deterministic algorithms for goal completion rates,
 * habit completion percentages, streak longevity, and consistency heatmaps.
 */

export interface RawGoalRecord {
  id: string;
  type: string;
  title: string;
  startValue: number;
  currentValue: number;
  targetValue: number;
  status: string; // 'active' | 'completed' | 'abandoned' | 'paused'
  targetDate: string | null;
  completedAt: Date | null;
}

export interface RawHabitRecord {
  id: string;
  title: string;
  category: string;
  frequency: string; // 'daily' | 'weekly'
  targetDaysPerWeek: number;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  completionDates: string[]; // YYYY-MM-DD
}

export interface HabitSummaryMetric {
  habitId: string;
  title: string;
  category: string;
  currentStreak: number;
  longestStreak: number;
  completionRatePct: number;
  completionsInWindow: number;
}

export interface GoalsHabitsAnalyticsSummary {
  goalStats: {
    totalGoals: number;
    active: number;
    completed: number;
    completionRatePct: number;
  };
  habitsSummary: HabitSummaryMetric[];
  overallHabitAdherencePct: number;
  consistencyHeatmap: Array<{ date: string; count: number }>;
}

/**
 * Calculates the total expected/scheduled days for a habit over a given time window.
 */
export function calculateScheduledDays(
  frequency: string,
  targetDaysPerWeek: number,
  windowDays: number,
): number {
  if (windowDays <= 0) return 0;
  if (frequency === 'daily') {
    return windowDays;
  }
  // Weekly habit: scheduled days based on weekly target
  const targetPerWeek = Math.min(7, Math.max(1, targetDaysPerWeek || 7));
  const weeks = windowDays / 7;
  return Math.max(1, Math.round(weeks * targetPerWeek));
}

/**
 * Calculates habit completion rate (% of scheduled opportunities fulfilled).
 */
export function calculateHabitCompletionRate(
  completionsCount: number,
  scheduledDays: number,
): number {
  if (scheduledDays <= 0 || completionsCount <= 0) return 0;
  const rate = (completionsCount / scheduledDays) * 100;
  return Math.min(100, Math.round(rate * 10) / 10);
}

/**
 * Calculates aggregate goal completion statistics.
 */
export function calculateGoalStats(
  goals: readonly RawGoalRecord[],
): {
  totalGoals: number;
  active: number;
  completed: number;
  completionRatePct: number;
} {
  const totalGoals = goals.length;
  if (totalGoals === 0) {
    return { totalGoals: 0, active: 0, completed: 0, completionRatePct: 0 };
  }

  const active = goals.filter((g) => g.status === 'active').length;
  const completed = goals.filter((g) => g.status === 'completed').length;
  const completionRatePct = Math.round((completed / totalGoals) * 100);

  return {
    totalGoals,
    active,
    completed,
    completionRatePct,
  };
}

/**
 * Builds consistency heatmap across dateSeries counting completions per day.
 */
export function buildConsistencyHeatmap(
  habits: readonly RawHabitRecord[],
  dateSeries: readonly string[],
): Array<{ date: string; count: number }> {
  const countMap = new Map<string, number>();

  for (const h of habits) {
    for (const d of h.completionDates) {
      countMap.set(d, (countMap.get(d) ?? 0) + 1);
    }
  }

  return dateSeries.map((date) => ({
    date,
    count: countMap.get(date) ?? 0,
  }));
}

/**
 * Assembles full goals and habits analytics summary.
 */
export function summarizeGoalsHabitsAnalytics(
  goals: readonly RawGoalRecord[],
  habits: readonly RawHabitRecord[],
  dateSeries: readonly string[],
): GoalsHabitsAnalyticsSummary {
  const goalStats = calculateGoalStats(goals);
  const windowDays = Math.max(1, dateSeries.length);
  const dateSet = new Set(dateSeries);

  let totalActualCompletions = 0;
  let totalScheduledOpportunities = 0;

  const habitsSummary: HabitSummaryMetric[] = habits.map((h) => {
    const completionsInWindow = h.completionDates.filter((d) => dateSet.has(d)).length;
    const scheduled = calculateScheduledDays(h.frequency, h.targetDaysPerWeek, windowDays);
    const completionRatePct = calculateHabitCompletionRate(completionsInWindow, scheduled);

    totalActualCompletions += completionsInWindow;
    totalScheduledOpportunities += scheduled;

    return {
      habitId: h.id,
      title: h.title,
      category: h.category,
      currentStreak: h.currentStreak,
      longestStreak: h.longestStreak,
      completionRatePct,
      completionsInWindow,
    };
  });

  const overallHabitAdherencePct =
    totalScheduledOpportunities > 0
      ? Math.min(100, Math.round((totalActualCompletions / totalScheduledOpportunities) * 1000) / 10)
      : 0;

  const consistencyHeatmap = buildConsistencyHeatmap(habits, dateSeries);

  return {
    goalStats,
    habitsSummary,
    overallHabitAdherencePct,
    consistencyHeatmap,
  };
}

