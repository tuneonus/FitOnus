/**
 * Overview & Comparative Analytics Domain Models & Calculation Engine
 *
 * Implements pure deterministic comparison logic for period-over-period tracking
 * and composite activity overview summaries.
 */

export interface PeriodComparisonItem {
  label: string;
  current: string;
  previous: string;
  delta: number;
  pctChange: number;
  better: boolean;
}

export interface ActivityOverviewSummary {
  period: string; // e.g. "Oct 3 – Oct 9, 2026"
  workoutSummary: {
    completedSessions: number;
    targetSessions: number;
    totalVolumeKg: number;
    totalDurationMinutes: number;
    consistencyPct: number;
  };
  nutritionSummary: {
    avgCalories: number;
    targetCalories: number | null;
    avgProteinGrams: number;
    targetProteinGrams: number | null;
    calorieAdherencePct: number;
    proteinAdherencePct: number;
    loggedDays: number;
  };
  hydrationSummary: {
    avgWaterMl: number;
    targetWaterMl: number;
    adherencePct: number;
  };
  bodySummary: {
    currentWeightKg: number | null;
    startWeightKg: number | null;
    targetWeightKg: number | null;
    weeklyVelocityKg: number;
    progressPct: number;
  };
  comparisonVsPriorPeriod: PeriodComparisonItem[];
}

/**
 * Calculates comparative delta, percentage change, and directional favorability.
 */
export function calculateMetricComparison(
  current: number,
  previous: number,
  metricType: 'workouts' | 'volume' | 'calories' | 'weight' | 'water' | 'protein' | 'habits',
  options?: {
    primaryGoal?: string | null;
    unit?: string;
  },
): PeriodComparisonItem {
  const delta = Math.round((current - previous) * 10) / 10;
  const pctChange = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;

  let better = true;

  if (metricType === 'weight') {
    if (options?.primaryGoal === 'gain') {
      better = delta >= 0;
    } else {
      better = delta <= 0;
    }
  } else if (metricType === 'calories') {
    if (options?.primaryGoal === 'gain') {
      better = delta >= 0;
    } else if (options?.primaryGoal === 'lose') {
      better = delta <= 0;
    } else {
      better = Math.abs(delta) <= 150; // maintain within 150 kcal
    }
  } else {
    // workouts, volume, water, protein, habits: more is generally better
    better = delta >= 0;
  }

  const formatValue = (val: number): string => {
    if (metricType === 'volume') {
      return `${(val / 1000).toFixed(1)} t`;
    }
    if (metricType === 'calories') {
      return `${Math.round(val).toLocaleString()} kcal`;
    }
    if (metricType === 'water') {
      return `${Math.round(val).toLocaleString()} ml`;
    }
    if (metricType === 'weight') {
      return `${val.toFixed(1)} kg`;
    }
    if (metricType === 'protein') {
      return `${Math.round(val)} g`;
    }
    return String(Math.round(val));
  };

  const labelMap: Record<string, string> = {
    workouts: 'Workouts',
    volume: 'Volume',
    calories: 'Calories',
    weight: 'Weight',
    water: 'Hydration',
    protein: 'Protein',
    habits: 'Habits',
  };

  return {
    label: labelMap[metricType] ?? metricType,
    current: formatValue(current),
    previous: formatValue(previous),
    delta,
    pctChange,
    better,
  };
}

