import { z } from 'zod';
import { idempotencyHeadersSchema } from '../../../shared/http/schemas.js';

// --- View / Output Schemas ---

export const goalTypeEnum = z.enum([
  'weightLoss',
  'muscleGain',
  'maintain',
  'run5k',
  'run10k',
  'marathon',
  'steps',
  'water',
  'protein',
  'streak',
  'workoutFrequency',
  'custom',
]);

export const goalCadenceEnum = z.enum(['daily', 'weekly', 'once', 'streak']);
export const goalDirectionEnum = z.enum(['increase', 'decrease', 'maintain']);
export const goalStatusEnum = z.enum(['active', 'completed', 'abandoned', 'paused']);

export const habitCategoryEnum = z.enum([
  'nutrition',
  'fitness',
  'wellness',
  'mindset',
  'recovery',
  'general',
]);
export const habitFrequencyEnum = z.enum(['daily', 'weekly']);

export const goalViewSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: goalTypeEnum,
  title: z.string(),
  description: z.string().nullable(),
  unit: z.string(),
  start: z.number(),
  current: z.number(),
  target: z.number(),
  progress: z.number(),
  cadence: goalCadenceEnum,
  direction: goalDirectionEnum,
  status: goalStatusEnum,
  isPrimary: z.boolean(),
  deadline: z.string(),
  targetDate: z.string().nullable(),
  completedOn: z.string().nullable(),
  hitDays: z.number().int().nonnegative().optional(),
  history: z.array(z.number()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const goalCheckpointViewSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  value: z.number(),
  date: z.string(),
  recordedAt: z.string().datetime(),
  source: z.string(),
  notes: z.string().nullable(),
});

export const goalDetailsViewSchema = z.object({
  goal: goalViewSchema,
  checkpoints: z.array(goalCheckpointViewSchema),
  recentHistory: z.array(z.number()),
});

export const goalProgressResponseSchema = z.object({
  goalId: z.string().uuid(),
  startValue: z.number(),
  currentValue: z.number(),
  targetValue: z.number(),
  progress: z.number(),
  percentage: z.number(),
  isCompleted: z.boolean(),
});

export const habitViewSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  category: habitCategoryEnum,
  frequency: habitFrequencyEnum,
  targetDaysPerWeek: z.number().int().min(1).max(7),
  icon: z.string(),
  color: z.string(),
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  totalCompletions: z.number().int().nonnegative(),
  isCompletedToday: z.boolean(),
  isArchived: z.boolean(),
  weeklyProgress: z
    .object({
      completedDays: z.number().int().nonnegative(),
      targetDays: z.number().int().positive(),
      percentage: z.number().nonnegative(),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const habitStreakSchema = z.object({
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  totalCompletions: z.number().int().nonnegative(),
});

export const habitHistoryResponseSchema = z.object({
  habit: habitViewSchema,
  completionDates: z.array(z.string()),
  streaks: habitStreakSchema,
});

export const habitCompletionResponseSchema = z.object({
  habit: habitViewSchema,
  date: z.string(),
  completed: z.boolean(),
  streaks: habitStreakSchema,
});

export const deleteResultSchema = z.object({
  id: z.string().uuid(),
  success: z.boolean(),
});

// --- Request Schemas ---

export const createGoalRequest = {
  headers: idempotencyHeadersSchema,
  body: z.object({
    type: goalTypeEnum,
    title: z.string().trim().min(1, 'Title is required').max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    targetValue: z.number().nonnegative('Target value must be non-negative'),
    startValue: z.number().nonnegative().optional(),
    metricUnit: z.string().trim().max(30).optional(),
    cadence: goalCadenceEnum.optional(),
    direction: goalDirectionEnum.optional(),
    isPrimary: z.boolean().optional(),
    deadlineLabel: z.string().trim().max(50).optional(),
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
      .nullable()
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
};

export const listGoalsRequest = {
  query: z.object({
    status: goalStatusEnum.optional(),
    isPrimary: z.preprocess(
      (val) => (val === 'true' || val === true ? true : val === 'false' || val === false ? false : undefined),
      z.boolean().optional(),
    ),
    syncTelemetry: z.preprocess(
      (val) => (val === 'false' ? false : true),
      z.boolean().optional().default(true),
    ),
  }),
};

export const getGoalDetailsRequest = {
  params: z.object({
    id: z.string().uuid('Invalid goal ID format'),
  }),
};

export const updateGoalRequest = {
  params: z.object({
    id: z.string().uuid('Invalid goal ID format'),
  }),
  body: z.object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    targetValue: z.number().nonnegative('Target value cannot be negative').optional(),
    currentValue: z.number().nonnegative('Current value cannot be negative').optional(),
    deadlineLabel: z.string().trim().max(50).optional(),
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
      .nullable()
      .optional(),
    status: goalStatusEnum.optional(),
    isPrimary: z.boolean().optional(),
  }),
};

export const deleteGoalRequest = {
  params: z.object({
    id: z.string().uuid('Invalid goal ID format'),
  }),
};

export const calculateGoalProgressRequest = {
  params: z.object({
    id: z.string().uuid('Invalid goal ID format'),
  }),
  body: z
    .object({
      candidateValue: z.number().nonnegative('Candidate value cannot be negative').optional(),
    })
    .optional(),
};

export const getGoalCheckpointsRequest = {
  params: z.object({
    id: z.string().uuid('Invalid goal ID format'),
  }),
  query: z.object({
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
};

export const logGoalCheckpointRequest = {
  params: z.object({
    id: z.string().uuid('Invalid goal ID format'),
  }),
  body: z.object({
    value: z.number().nonnegative('Checkpoint value cannot be negative'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
      .optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    source: z.string().trim().max(50).optional(),
  }),
};

export const createHabitRequest = {
  headers: idempotencyHeadersSchema,
  body: z.object({
    title: z.string().trim().min(1, 'Title is required').max(100),
    description: z.string().trim().max(500).nullable().optional(),
    category: habitCategoryEnum.optional().default('general'),
    frequency: habitFrequencyEnum.optional().default('daily'),
    targetDaysPerWeek: z
      .number()
      .int()
      .min(1, 'targetDaysPerWeek must be at least 1')
      .max(7, 'targetDaysPerWeek cannot exceed 7')
      .optional(),
    icon: z.string().trim().max(50).optional().default('check'),
    color: z.string().trim().max(50).optional().default('teal'),
  }),
};

export const listHabitsRequest = {
  query: z.object({
    category: habitCategoryEnum.optional(),
    isArchived: z.preprocess(
      (val) => (val === 'true' || val === true ? true : val === 'false' || val === false ? false : undefined),
      z.boolean().optional(),
    ),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
      .optional(),
  }),
};

export const getHabitHistoryRequest = {
  params: z.object({
    id: z.string().uuid('Invalid habit ID format'),
  }),
  query: z.object({
    limitDays: z.coerce.number().int().positive().max(365).optional().default(90),
  }),
};

export const updateHabitRequest = {
  params: z.object({
    id: z.string().uuid('Invalid habit ID format'),
  }),
  body: z.object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    category: habitCategoryEnum.optional(),
    frequency: habitFrequencyEnum.optional(),
    targetDaysPerWeek: z.number().int().min(1).max(7).optional(),
    icon: z.string().trim().max(50).optional(),
    color: z.string().trim().max(50).optional(),
    isArchived: z.boolean().optional(),
  }),
};

export const deleteHabitRequest = {
  params: z.object({
    id: z.string().uuid('Invalid habit ID format'),
  }),
};

export const setHabitCompletionRequest = {
  headers: idempotencyHeadersSchema,
  params: z.object({
    id: z.string().uuid('Invalid habit ID format'),
  }),
  body: z.object({
    id: z.string().uuid().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
    completed: z.boolean({ message: 'completed is required and must be a boolean' }),
    notes: z.string().trim().max(500).nullable().optional(),
  }),
};

export const getHabitStreaksRequest = {
  params: z.object({
    id: z.string().uuid('Invalid habit ID format'),
  }),
  query: z.object({
    referenceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Reference date must be formatted as YYYY-MM-DD')
      .optional(),
  }),
};
