import { z } from 'zod';

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

export const dashboardQuerySchema = z.object({
  timezone: timezoneQuerySchema,
});

export const getDashboardSummaryRequest = {
  query: dashboardQuerySchema,
};

export const dailySummarySchema = z.object({
  recoveryScore: z.number().nullable(),
  sleepScore: z.number().nullable(),
  sleepDuration: z.string().nullable(),
  steps: z.number().nullable(),
  caloriesBurned: z.number().int().nonnegative(),
  caloriesConsumed: z.number().int().nonnegative(),
  activeMinutes: z.number().int().nonnegative(),
  waterIntake: z.number().nonnegative(),
  waterIntakeMl: z.number().int().nonnegative(),
  heartRate: z.number().nullable(),
  weight: z.number().nullable(),
});

export const aiSummarySchema = z.object({
  greeting: z.string(),
  sleepInsights: z.string().nullable(),
  recoveryInsights: z.string().nullable(),
  recommendation: z.string().nullable(),
});

export const todayWorkoutSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    duration: z.number().int().positive(),
    exercises: z.number().int().nonnegative(),
    estimatedCalories: z.number().int().nonnegative(),
  })
  .nullable();

export const nutritionSummarySchema = z.object({
  calories: z.number().int().nonnegative(),
  caloriesGoal: z.number().int().positive(),
  protein: z.number().int().nonnegative(),
  proteinGoal: z.number().int().positive(),
  carbs: z.number().int().nonnegative(),
  carbsGoal: z.number().int().positive(),
  fat: z.number().int().nonnegative(),
  fatGoal: z.number().int().positive(),
});

export const activityProgressSchema = z.object({
  dailyGoalProgress: z.number().min(0).max(1),
  weeklyGoalProgress: z.number().min(0).max(1),
});

export const recentActivitySchema = z.object({
  id: z.string().min(1),
  type: z.enum(['workout', 'meal', 'weight']),
  title: z.string(),
  subtitle: z.string(),
  timestamp: z.string(),
});

export const dashboardSummaryResponseSchema = z.object({
  userDisplayName: z.string(),
  summary: dailySummarySchema,
  aiSummary: aiSummarySchema,
  todayWorkout: todayWorkoutSchema,
  nutrition: nutritionSummarySchema,
  progress: activityProgressSchema,
  recentActivity: z.array(recentActivitySchema),
});

export type DashboardSummaryResponse = z.infer<typeof dashboardSummaryResponseSchema>;
