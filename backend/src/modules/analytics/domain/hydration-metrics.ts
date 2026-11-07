/**
 * Hydration Analytics Domain Models & Calculation Engine
 *
 * Implements pure deterministic algorithms for hydration averages,
 * daily water tracking, and goal adherence rates.
 */

export interface RawWaterAggregateRecord {
  date: string; // YYYY-MM-DD
  totalMl: number;
}

export interface HydrationPoint {
  date: string;
  label: string;
  amountMl: number;
  goalMet: boolean;
}

export interface HydrationAnalyticsSummary {
  avgWaterMl: number;
  targetWaterMl: number;
  adherencePct: number;
  loggedDaysCount: number;
  totalDaysInRange: number;
  points: HydrationPoint[];
}

/**
 * Calculates average daily water intake across days that had water logged.
 */
export function calculateHydrationAverages(entries: readonly RawWaterAggregateRecord[]): {
  avgWaterMl: number;
  loggedDaysCount: number;
} {
  const loggedEntries = entries.filter((e) => e.totalMl > 0);
  const loggedDaysCount = loggedEntries.length;

  if (loggedDaysCount === 0) {
    return { avgWaterMl: 0, loggedDaysCount: 0 };
  }

  const totalMl = loggedEntries.reduce((sum, e) => sum + e.totalMl, 0);
  const avgWaterMl = Math.round(totalMl / loggedDaysCount);

  return { avgWaterMl, loggedDaysCount };
}

/**
 * Calculates hydration goal adherence percentage (% of logged days meeting or exceeding target).
 */
export function calculateHydrationAdherence(
  entries: readonly RawWaterAggregateRecord[],
  targetWaterMl: number = 3000,
): {
  adherencePct: number;
  metGoalDays: number;
  loggedDaysCount: number;
} {
  const target = targetWaterMl > 0 ? targetWaterMl : 3000;
  const loggedEntries = entries.filter((e) => e.totalMl > 0);
  const loggedDaysCount = loggedEntries.length;

  if (loggedDaysCount === 0) {
    return { adherencePct: 0, metGoalDays: 0, loggedDaysCount: 0 };
  }

  const metGoalDays = loggedEntries.filter((e) => e.totalMl >= target).length;
  const adherencePct = Math.round((metGoalDays / loggedDaysCount) * 100);

  return { adherencePct, metGoalDays, loggedDaysCount };
}

/**
 * Maps database water intake into continuous daily trend points across dateSeries.
 */
export function buildDailyHydrationTrends(
  entries: readonly RawWaterAggregateRecord[],
  dateSeries: readonly string[],
  targetWaterMl: number = 3000,
  weekdayLabels?: Record<string, string>,
): HydrationPoint[] {
  const target = targetWaterMl > 0 ? targetWaterMl : 3000;
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.date, e.totalMl);
  }

  return dateSeries.map((dateStr) => {
    const amountMl = map.get(dateStr) ?? 0;
    const label = weekdayLabels?.[dateStr] ?? dateStr.slice(5);
    return {
      date: dateStr,
      label,
      amountMl,
      goalMet: amountMl >= target,
    };
  });
}

/**
 * Assembles full hydration analytics summary.
 */
export function summarizeHydrationAnalytics(
  entries: readonly RawWaterAggregateRecord[],
  dateSeries: readonly string[],
  targetWaterMl: number = 3000,
  weekdayLabels?: Record<string, string>,
): HydrationAnalyticsSummary {
  const target = targetWaterMl > 0 ? targetWaterMl : 3000;
  const { avgWaterMl, loggedDaysCount } = calculateHydrationAverages(entries);
  const { adherencePct } = calculateHydrationAdherence(entries, target);
  const points = buildDailyHydrationTrends(entries, dateSeries, target, weekdayLabels);

  return {
    avgWaterMl,
    targetWaterMl: target,
    adherencePct,
    loggedDaysCount,
    totalDaysInRange: dateSeries.length,
    points,
  };
}
