/**
 * Analytics HTTP Request & Response Zod Schemas
 *
 * Defines strict input validation and response contracts for the
 * FitOnus Analytics REST API.
 */

import { z } from 'zod';

// --- Shared Query Schemas ---

export const periodQuerySchema = z.enum([
  'W', 'w', '7d', '7D', 'week', 'WEEK',
  'M', 'm', '30d', '30D', 'month', 'MONTH',
  '3M', '3m', '90d', '90D',
  '6M', '6m', '180d', '180D',
  'Y', 'y', '1y', '1Y', 'year', 'YEAR',
  'all', 'ALL',
]);

export const refDateQuerySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Reference date must be in YYYY-MM-DD format')
  .refine(
    (d) => {
      const [year, month, day] = d.split('-').map(Number);
      if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
        return false;
      }
      return true;
    },
    { message: 'Invalid calendar date' },
  )
  .optional();

export const timezoneQuerySchema = z
  .string()
  .trim()
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid IANA timezone identifier' },
  )
  .optional()
  .default('UTC');

// --- Request Schemas ---

export const getAnalyticsOverviewRequest = {
  query: z.object({
    timezone: timezoneQuerySchema,
    refDate: refDateQuerySchema,
  }),
};

export const getWorkoutAnalyticsRequest = {
  query: z.object({
    range: periodQuerySchema.optional().default('M'),
    timezone: timezoneQuerySchema,
    refDate: refDateQuerySchema,
  }),
};

export const getExerciseProgressionRequest = {
  params: z.object({
    exerciseId: z.string().trim().min(1, 'Exercise ID is required'),
  }),
  query: z.object({
    range: periodQuerySchema.optional().default('all'),
    timezone: timezoneQuerySchema,
    refDate: refDateQuerySchema,
  }),
};

export const getNutritionAnalyticsRequest = {
  query: z.object({
    range: periodQuerySchema.optional().default('W'),
    timezone: timezoneQuerySchema,
    refDate: refDateQuerySchema,
  }),
};

export const getHydrationAnalyticsRequest = {
  query: z.object({
    range: periodQuerySchema.optional().default('W'),
    timezone: timezoneQuerySchema,
    refDate: refDateQuerySchema,
    targetMl: z.coerce.number().int().positive().max(10000).optional(),
  }),
};

export const getBodyAnalyticsRequest = {
  query: z.object({
    range: periodQuerySchema.optional().default('M'),
    timezone: timezoneQuerySchema,
    refDate: refDateQuerySchema,
  }),
};

export const getGoalsHabitsAnalyticsRequest = {
  query: z.object({
    windowDays: z.coerce.number().int().min(7).max(365).optional().default(30),
    timezone: timezoneQuerySchema,
    refDate: refDateQuerySchema,
  }),
};

// --- Response View Schemas ---

export const activityOverviewViewSchema = z.object({
  period: z.string(),
  workoutSummary: z.object({
    completedSessions: z.number().int().nonnegative(),
    targetSessions: z.number().int().nonnegative(),
    totalVolumeKg: z.number().nonnegative(),
    totalDurationMinutes: z.number().int().nonnegative(),
    consistencyPct: z.number().min(0).max(100),
  }),
  nutritionSummary: z.object({
    avgCalories: z.number().nonnegative(),
    targetCalories: z.number().nullable(),
    avgProteinGrams: z.number().nonnegative(),
    targetProteinGrams: z.number().nullable(),
    calorieAdherencePct: z.number().min(0).max(100),
    proteinAdherencePct: z.number().min(0).max(100),
    loggedDays: z.number().int().nonnegative(),
  }),
  hydrationSummary: z.object({
    avgWaterMl: z.number().nonnegative(),
    targetWaterMl: z.number().nonnegative(),
    adherencePct: z.number().min(0).max(100),
  }),
  bodySummary: z.object({
    currentWeightKg: z.number().nullable(),
    startWeightKg: z.number().nullable(),
    targetWeightKg: z.number().nullable(),
    weeklyVelocityKg: z.number(),
    progressPct: z.number().min(0).max(100),
  }),
  comparisonVsPriorPeriod: z.array(
    z.object({
      label: z.string(),
      current: z.string(),
      previous: z.string(),
      delta: z.number(),
      pctChange: z.number(),
      better: z.boolean(),
    }),
  ),
});

export const workoutAnalyticsViewSchema = z.object({
  range: z.enum(['W', 'M', '3M', '6M', 'Y', 'all']),
  totalSessions: z.number().int().nonnegative(),
  totalVolumeKg: z.number().nonnegative(),
  avgDurationMin: z.number().int().nonnegative(),
  consistencyPct: z.number().min(0).max(100),
  frequencySeries: z.array(z.object({ label: z.string(), value: z.number() })),
  volumeSeries: z.array(z.object({ label: z.string(), value: z.number() })),
  durationSeries: z.array(z.object({ label: z.string(), value: z.number() })),
});

export const exerciseProgressionViewSchema = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  currentPr: z
    .object({
      weightKg: z.number(),
      reps: z.number().int(),
      volumeKg: z.number(),
      estimated1rmKg: z.number(),
      achievedAt: z.string(),
    })
    .nullable(),
  progression: z.array(
    z.object({
      date: z.string(),
      topWeightKg: z.number(),
      reps: z.number().int(),
      estimated1rmKg: z.number(),
      volumeKg: z.number(),
    }),
  ),
});

export const nutritionAnalyticsViewSchema = z.object({
  range: z.enum(['W', 'M', '3M', '6M', 'Y', 'all']),
  avgCalories: z.number().nonnegative(),
  targetCalories: z.number().nullable(),
  calorieAdherencePct: z.number().min(0).max(100),
  proteinAdherencePct: z.number().min(0).max(100),
  macroSplit: z.array(
    z.object({
      label: z.enum(['Protein', 'Carbs', 'Fat']),
      pct: z.number().min(0).max(100),
      grams: z.number().nonnegative(),
    }),
  ),
  dailyTrends: z.array(
    z.object({
      date: z.string(),
      label: z.string(),
      calories: z.number().nonnegative(),
      protein: z.number().nonnegative(),
      carbs: z.number().nonnegative(),
      fat: z.number().nonnegative(),
      logged: z.boolean(),
    }),
  ),
});

export const hydrationAnalyticsViewSchema = z.object({
  range: z.enum(['W', 'M', '3M', '6M', 'Y', 'all']),
  avgWaterMl: z.number().nonnegative(),
  targetWaterMl: z.number().nonnegative(),
  adherencePct: z.number().min(0).max(100),
  points: z.array(
    z.object({
      date: z.string(),
      label: z.string(),
      amountMl: z.number().nonnegative(),
      goalMet: z.boolean(),
    }),
  ),
});

const measurementPointSchema = z.object({
  date: z.string(),
  value: z.number(),
});

export const bodyAnalyticsViewSchema = z.object({
  startingWeightKg: z.number().nullable(),
  currentWeightKg: z.number().nullable(),
  targetWeightKg: z.number().nullable(),
  weeklyVelocityKg: z.number(),
  goalProgressPct: z.number().min(0).max(100),
  weightTrend: z.array(
    z.object({
      date: z.string(),
      raw: z.number(),
      ema: z.number(),
    }),
  ),
  measurementTrends: z.object({
    waistCm: z.array(measurementPointSchema).optional(),
    chestCm: z.array(measurementPointSchema).optional(),
    hipCm: z.array(measurementPointSchema).optional(),
    armCm: z.array(measurementPointSchema).optional(),
    neckCm: z.array(measurementPointSchema).optional(),
    bodyFatPct: z.array(measurementPointSchema).optional(),
    muscleMassKg: z.array(measurementPointSchema).optional(),
  }),
});

export const goalsHabitsAnalyticsViewSchema = z.object({
  goalStats: z.object({
    totalGoals: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    completionRatePct: z.number().min(0).max(100),
  }),
  habitsSummary: z.array(
    z.object({
      habitId: z.string(),
      title: z.string(),
      category: z.string(),
      currentStreak: z.number().int().nonnegative(),
      longestStreak: z.number().int().nonnegative(),
      completionRatePct: z.number().min(0).max(100),
      completionsInWindow: z.number().int().nonnegative(),
    }),
  ),
  overallHabitAdherencePct: z.number().min(0).max(100),
  consistencyHeatmap: z.array(
    z.object({
      date: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
});

