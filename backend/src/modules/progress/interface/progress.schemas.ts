import { z } from 'zod';
import { idempotencyHeadersSchema } from '../../../shared/http/schemas.js';

// --- View / Output Schemas ---

export const weightLogViewSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  weightKg: z.number(),
  loggedAt: z.string().datetime(),
  source: z.enum(['manual', 'synced']),
  notes: z.string().nullable(),
  clientId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const logWeightResponseSchema = z.object({
  log: weightLogViewSchema,
  isNew: z.boolean(),
  currentWeight: z.number(),
  startingWeight: z.number().nullable(),
  changeFromStart: z.number(),
  changeFromPrevious: z.number(),
});

export const weightHistoryResponseSchema = z.object({
  summary: z.object({
    currentWeightKg: z.number().nullable(),
    startingWeightKg: z.number().nullable(),
    targetWeightKg: z.number().nullable(),
    latestLoggedAt: z.string().datetime().nullable(),
    totalLogsCount: z.number().int().nonnegative(),
  }),
  points: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
    }),
  ),
  entries: z.array(
    z.object({
      id: z.string().uuid(),
      date: z.string(),
      time: z.string().optional(),
      value: z.number(),
      source: z.enum(['manual', 'synced']),
      note: z.string().optional(),
    }),
  ),
  total: z.number().int().nonnegative(),
});

export const bodyMeasurementViewSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  loggedAt: z.string().datetime(),
  waistCm: z.number().nullable(),
  chestCm: z.number().nullable(),
  hipCm: z.number().nullable(),
  armCm: z.number().nullable(),
  neckCm: z.number().nullable(),
  bodyFatPct: z.number().nullable(),
  muscleMassKg: z.number().nullable(),
  notes: z.string().nullable(),
  source: z.enum(['manual', 'synced']),
  clientId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const logMeasurementResponseSchema = z.object({
  measurement: bodyMeasurementViewSchema,
  isNew: z.boolean(),
  diffs: z.object({
    waist: z.number().optional(),
    chest: z.number().optional(),
    hip: z.number().optional(),
    arm: z.number().optional(),
    neck: z.number().optional(),
    bodyFat: z.number().optional(),
    muscleMass: z.number().optional(),
  }),
});

export const measurementHistoryResponseSchema = z.object({
  latest: z
    .object({
      id: z.string().uuid(),
      date: z.string(),
      waist: z.number().optional(),
      chest: z.number().optional(),
      hip: z.number().optional(),
      arm: z.number().optional(),
      neck: z.number().optional(),
      bodyFat: z.number().optional(),
      muscleMass: z.number().optional(),
    })
    .nullable(),
  diffs: z.object({
    waist: z.number().optional(),
    chest: z.number().optional(),
    hip: z.number().optional(),
    arm: z.number().optional(),
    neck: z.number().optional(),
    bodyFat: z.number().optional(),
    muscleMass: z.number().optional(),
  }),
  history: z.array(
    z.object({
      id: z.string().uuid(),
      date: z.string(),
      values: z.object({
        waist: z.number().optional(),
        chest: z.number().optional(),
        hip: z.number().optional(),
        arm: z.number().optional(),
        neck: z.number().optional(),
        bodyFat: z.number().optional(),
        muscleMass: z.number().optional(),
      }),
    }),
  ),
  total: z.number().int().nonnegative(),
});

export const deleteResultSchema = z.object({
  id: z.string().uuid(),
  deleted: z.boolean(),
});

export const progressAnalyticsResponseSchema = z.object({
  metric: z.enum(['weight', 'calories', 'sleep', 'protein', 'workouts', 'recovery', 'steps', 'water']),
  label: z.string(),
  unit: z.string(),
  chart: z.enum(['line', 'bar']),
  lowerIsBetter: z.boolean().optional(),
  hasDeviceData: z.boolean(),
  goal: z.number().optional(),
  firstValue: z.number(),
  latestValue: z.number(),
  delta: z.number(),
  points: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
    }),
  ),
});

export const periodComparisonResponseSchema = z.object({
  title: z.string(),
  comparisons: z.array(
    z.object({
      label: z.string(),
      current: z.string(),
      previous: z.string(),
      better: z.boolean(),
    }),
  ),
});

export const achievementsResponseSchema = z.object({
  achievements: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      earned: z.boolean(),
    }),
  ),
});

export const progressReportResponseSchema = z.object({
  period: z.string(),
  generated: z.string(),
  headline: z.string(),
  stats: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      unit: z.string(),
      note: z.string().optional(),
      good: z.boolean().optional(),
    }),
  ),
  calories: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
    }),
  ),
  workouts: z.array(
    z.object({
      day: z.string(),
      title: z.string(),
    }),
  ),
  achievements: z.array(z.string()),
  improvements: z.array(z.string()),
  nextGoals: z.array(z.string()),
});

// --- Request Schemas ---

export const logWeightRequest = {
  headers: idempotencyHeadersSchema,
  body: z.object({
    weightKg: z.number().min(25, 'Weight must be at least 25 kg').max(450, 'Weight cannot exceed 450 kg'),
    loggedAt: z.string().datetime({ offset: true }).optional(),
    source: z.enum(['manual', 'synced']).optional().default('manual'),
    notes: z.string().trim().max(500).nullable().optional(),
    clientId: z.string().uuid().optional(),
  }),
};

export const getWeightHistoryRequest = {
  query: z.object({
    range: z.enum(['D', 'W', 'M', 'Y']).optional().default('W'),
    timezone: z.string().optional().default('UTC'),
    limit: z.coerce.number().int().min(1).max(500).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
  }),
};

export const updateWeightLogRequest = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    weightKg: z
      .number()
      .min(25, 'Weight must be at least 25 kg')
      .max(450, 'Weight cannot exceed 450 kg')
      .optional(),
    loggedAt: z.string().datetime({ offset: true }).optional(),
    source: z.enum(['manual', 'synced']).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  }),
};

export const deleteWeightLogRequest = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

const measurementBodySchema = z
  .object({
    loggedAt: z.string().datetime({ offset: true }).optional(),
    waistCm: z.number().min(30.1).max(249.9).nullable().optional(),
    chestCm: z.number().min(30.1).max(249.9).nullable().optional(),
    hipCm: z.number().min(30.1).max(249.9).nullable().optional(),
    armCm: z.number().min(10.1).max(99.9).nullable().optional(),
    neckCm: z.number().min(15.1).max(79.9).nullable().optional(),
    bodyFatPct: z.number().min(3.0).max(60.0).nullable().optional(),
    muscleMassKg: z.number().min(10.0).max(200.0).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    source: z.enum(['manual', 'synced']).optional().default('manual'),
    clientId: z.string().uuid().optional(),
  })
  .refine(
    (data) =>
      (data.waistCm !== undefined && data.waistCm !== null) ||
      (data.chestCm !== undefined && data.chestCm !== null) ||
      (data.hipCm !== undefined && data.hipCm !== null) ||
      (data.armCm !== undefined && data.armCm !== null) ||
      (data.neckCm !== undefined && data.neckCm !== null) ||
      (data.bodyFatPct !== undefined && data.bodyFatPct !== null) ||
      (data.muscleMassKg !== undefined && data.muscleMassKg !== null),
    {
      message: 'At least one body measurement metric must be provided',
    },
  );

export const logMeasurementRequest = {
  headers: idempotencyHeadersSchema,
  body: measurementBodySchema,
};

export const getMeasurementsRequest = {
  query: z.object({
    limit: z.coerce.number().int().min(1).max(500).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
  }),
};

export const updateMeasurementRequest = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    loggedAt: z.string().datetime({ offset: true }).optional(),
    waistCm: z.number().min(30.1).max(249.9).nullable().optional(),
    chestCm: z.number().min(30.1).max(249.9).nullable().optional(),
    hipCm: z.number().min(30.1).max(249.9).nullable().optional(),
    armCm: z.number().min(10.1).max(99.9).nullable().optional(),
    neckCm: z.number().min(15.1).max(79.9).nullable().optional(),
    bodyFatPct: z.number().min(3.0).max(60.0).nullable().optional(),
    muscleMassKg: z.number().min(10.0).max(200.0).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    source: z.enum(['manual', 'synced']).optional(),
  }),
};

export const deleteMeasurementRequest = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const getProgressAnalyticsRequest = {
  query: z.object({
    metric: z.enum(['weight', 'calories', 'sleep', 'protein', 'workouts', 'recovery', 'steps', 'water']),
    range: z.enum(['D', 'W', 'M', 'Y']).optional().default('M'),
    timezone: z.string().optional().default('UTC'),
  }),
};

export const getPeriodComparisonRequest = {
  query: z.object({
    period: z.enum(['month', 'week']).optional().default('month'),
    timezone: z.string().optional().default('UTC'),
  }),
};

export const getProgressReportRequest = {
  query: z.object({
    type: z.enum(['weekly', 'monthly']).optional().default('weekly'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
      .optional(),
    timezone: z.string().optional().default('UTC'),
  }),
};
