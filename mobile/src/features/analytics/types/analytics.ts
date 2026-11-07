/**
 * FitOnus Advanced Analytics Mobile Types & View Contracts
 *
 * Aligned with Phase 8 REST API DTOs and backend Zod schemas.
 */

export type AnalyticsRange =
  | '7d'
  | '30d'
  | '90d'
  | '180d'
  | '1y'
  | 'all'
  | 'W'
  | 'M'
  | '3M'
  | '6M'
  | 'Y';

export interface WorkoutAnalyticsView {
  range: string;
  totalSessions: number;
  totalVolumeKg: number;
  avgDurationMin: number;
  consistencyPct: number;
  frequencySeries: Array<{ label: string; value: number }>;
  volumeSeries: Array<{ label: string; value: number }>;
  durationSeries: Array<{ label: string; value: number }>;
}

export interface ExerciseProgressionPrView {
  weightKg: number;
  reps: number;
  volumeKg: number;
  estimated1rmKg: number;
  achievedAt: string;
}

export interface ExerciseProgressionPointView {
  date: string;
  topWeightKg: number;
  reps: number;
  estimated1rmKg: number;
  volumeKg: number;
}

export interface ExerciseProgressionView {
  exerciseId: string;
  exerciseName: string;
  currentPr: ExerciseProgressionPrView | null;
  progression: ExerciseProgressionPointView[];
}

export interface NutritionMacroSplitView {
  label: 'Protein' | 'Carbs' | 'Fat';
  pct: number;
  grams: number;
}

export interface NutritionDailyTrendView {
  date: string;
  label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  logged: boolean;
}

export interface NutritionAnalyticsView {
  range: string;
  avgCalories: number;
  targetCalories: number | null;
  calorieAdherencePct: number;
  proteinAdherencePct: number;
  macroSplit: NutritionMacroSplitView[];
  dailyTrends: NutritionDailyTrendView[];
}

export interface HydrationPointView {
  date: string;
  label: string;
  amountMl: number;
  goalMet: boolean;
}

export interface HydrationAnalyticsView {
  range: string;
  avgWaterMl: number;
  targetWaterMl: number;
  adherencePct: number;
  points: HydrationPointView[];
}

export interface BodyMeasurementTrendPointView {
  date: string;
  value: number;
}

export interface MeasurementTrendSeriesView {
  waistCm?: BodyMeasurementTrendPointView[];
  chestCm?: BodyMeasurementTrendPointView[];
  hipCm?: BodyMeasurementTrendPointView[];
  armCm?: BodyMeasurementTrendPointView[];
  neckCm?: BodyMeasurementTrendPointView[];
  bodyFatPct?: BodyMeasurementTrendPointView[];
  muscleMassKg?: BodyMeasurementTrendPointView[];
}

export interface BodyAnalyticsView {
  startingWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  weeklyVelocityKg: number;
  goalProgressPct: number;
  weightTrend: Array<{
    date: string;
    raw: number;
    ema: number;
  }>;
  measurementTrends: MeasurementTrendSeriesView;
}

export interface HabitSummaryView {
  habitId: string;
  title: string;
  category: string;
  currentStreak: number;
  longestStreak: number;
  completionRatePct: number;
  completionsInWindow: number;
}

export interface GoalsHabitsAnalyticsView {
  goalStats: {
    totalGoals: number;
    active: number;
    completed: number;
    completionRatePct: number;
  };
  habitsSummary: HabitSummaryView[];
  overallHabitAdherencePct: number;
  consistencyHeatmap: Array<{ date: string; count: number }>;
}

export interface PeriodComparisonItem {
  key: string;
  label: string;
  currentValue: number;
  priorValue: number;
  delta: number;
  deltaPct: number | null;
  trend: 'up' | 'down' | 'neutral';
  isImprovement: boolean;
}

export interface ActivityOverviewView {
  period: string;
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

export interface AnalyticsQueryParams {
  range?: AnalyticsRange | string;
  refDate?: string;
  timezone?: string;
}

export interface HydrationQueryParams extends AnalyticsQueryParams {
  targetMl?: number;
}

export interface GoalsHabitsQueryParams {
  windowDays?: number;
  refDate?: string;
  timezone?: string;
}

