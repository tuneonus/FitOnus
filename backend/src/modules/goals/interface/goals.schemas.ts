import { z } from 'zod';
import { idempotencyHeadersSchema } from '../../../shared/http/schemas.js';
import {
  CHECKPOINT_SOURCE_MAX_LENGTH,
  GOAL_DEADLINE_LABEL_MAX_LENGTH,
  GOAL_METRIC_UNIT_MAX_LENGTH,
  GOAL_VALUE_MAX,
  HABIT_COLOR_MAX_LENGTH,
  HABIT_ICON_MAX_LENGTH,
} from '../domain/goal-limits.js';
import { isValidCalendarDate } from '../domain/local-date.js';

// --- Shared request building blocks ---

/** A goal or checkpoint value: a finite number between 0 and GOAL_VALUE_MAX (column numeric(10,2)). */
const goalValue = (label: string) =>
  z
    .number()
    .min(0, `${label} cannot be negative`)
    .max(GOAL_VALUE_MAX, `${label} cannot exceed ${GOAL_VALUE_MAX}`);

/** A real calendar day, `YYYY-MM-DD` (rejects 2026-02-30 and years PostgreSQL would not store sensibly). */
const calendarDate = (message = 'Date must be formatted as YYYY-MM-DD') =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine(isValidCalendarDate, { message: 'Date must be a valid calendar date' });

/**
 * IANA timezone of the caller (e.g. `Asia/Kolkata`). It decides what "today" and "this week" mean when the
 * client does not send an explicit date. Deliberately lenient: an unknown value falls back to UTC instead of
 * failing a request the user cannot fix.
 */
export const timezoneQuery = z.string().trim().max(64).optional();
const timezoneOnlyQuery = z.object({ timezone: timezoneQuery });

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
  isOverdue: z.boolean().optional(),
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
  query: timezoneOnlyQuery,
  body: z.object({
    type: goalTypeEnum,
    title: z.string().trim().min(1, 'Title is required').max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    targetValue: goalValue('Target value'),
    startValue: goalValue('Start value').optional(),
    metricUnit: z.string().trim().max(GOAL_METRIC_UNIT_MAX_LENGTH).optional(),
    cadence: goalCadenceEnum.optional(),
    direction: goalDirectionEnum.optional(),
    isPrimary: z.boolean().optional(),
    deadlineLabel: z.string().trim().max(GOAL_DEADLINE_LABEL_MAX_LENGTH).optional(),
    targetDate: calendarDate().nullable().optional(),
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
    timezone: timezoneQuery,
  }),
};

export const getGoalDetailsRequest = {
  params: z.object({
    id: z.string().uuid('Invalid goal ID format'),
  }),
  query: timezoneOnlyQuery,
};

export const updateGoalRequest = {
  params: z.object({
    id: z.string().uuid('Invalid goal ID format'),
  }),
  query: timezoneOnlyQuery,
  body: z.object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    targetValue: goalValue('Target value').optional(),
    currentValue: goalValue('Current value').optional(),
    deadlineLabel: z.string().trim().max(GOAL_DEADLINE_LABEL_MAX_LENGTH).optional(),
    targetDate: calendarDate().nullable().optional(),
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
      candidateValue: goalValue('Candidate value').optional(),
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
  query: timezoneOnlyQuery,
  body: z.object({
    value: goalValue('Checkpoint value'),
    date: calendarDate().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    source: z.string().trim().max(CHECKPOINT_SOURCE_MAX_LENGTH).optional(),
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
    icon: z.string().trim().max(HABIT_ICON_MAX_LENGTH).optional().default('check'),
    color: z.string().trim().max(HABIT_COLOR_MAX_LENGTH).optional().default('teal'),
  }),
};

export const listHabitsRequest = {
  query: z.object({
    category: habitCategoryEnum.optional(),
    isArchived: z.preprocess(
      (val) => (val === 'true' || val === true ? true : val === 'false' || val === false ? false : undefined),
      z.boolean().optional(),
    ),
    date: calendarDate().optional(),
    timezone: timezoneQuery,
  }),
};

export const getHabitHistoryRequest = {
  params: z.object({
    id: z.string().uuid('Invalid habit ID format'),
  }),
  query: z.object({
    limitDays: z.coerce.number().int().positive().max(365).optional().default(90),
    timezone: timezoneQuery,
  }),
};

export const updateHabitRequest = {
  params: z.object({
    id: z.string().uuid('Invalid habit ID format'),
  }),
  query: timezoneOnlyQuery,
  body: z.object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    category: habitCategoryEnum.optional(),
    frequency: habitFrequencyEnum.optional(),
    targetDaysPerWeek: z.number().int().min(1).max(7).optional(),
    icon: z.string().trim().max(HABIT_ICON_MAX_LENGTH).optional(),
    color: z.string().trim().max(HABIT_COLOR_MAX_LENGTH).optional(),
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
  query: timezoneOnlyQuery,
  body: z.object({
    id: z.string().uuid().optional(),
    date: calendarDate(),
    completed: z.boolean({ message: 'completed is required and must be a boolean' }),
    notes: z.string().trim().max(500).nullable().optional(),
  }),
};

export const getHabitStreaksRequest = {
  params: z.object({
    id: z.string().uuid('Invalid habit ID format'),
  }),
  query: z.object({
    referenceDate: calendarDate('Reference date must be formatted as YYYY-MM-DD').optional(),
    timezone: timezoneQuery,
  }),
};
