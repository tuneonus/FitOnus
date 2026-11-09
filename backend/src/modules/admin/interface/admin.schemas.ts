import { z } from 'zod';
import { idParamsSchema, paginationQuerySchema } from '../../../shared/http/schemas.js';

export const adminLoginRequest = {
  body: z.strictObject({
    email: z.string().trim().min(3).max(254).pipe(z.email('Must be a valid email address')),
    password: z.string().min(1).max(1_024),
  }),
};

export const adminLoginResponseSchema = z.object({
  tokenType: z.literal('Bearer'),
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.iso.datetime(),
  user: z.object({
    id: z.uuid(),
    email: z.string(),
    displayName: z.string(),
    role: z.literal('admin'),
  }),
});

export const adminMeResponseSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: z.literal('admin'),
  permissions: z.array(z.string()),
});

export const adminChangePasswordRequest = {
  body: z.strictObject({
    currentPassword: z.string().min(1, 'Current password is required').max(1_024),
    newPassword: z
      .string()
      .min(12, 'Password must be at least 12 characters.')
      .max(128, 'Password must be at most 128 characters.'),
  }),
};

export const adminChangePasswordResponseSchema = z.object({
  message: z.string(),
  revokedSessions: z.number().int().nonnegative(),
});

export const getDashboardStatsRequest = {
  query: z.object({
    timeframe: z.enum(['7d', '14d', '30d', '90d']).default('14d').optional(),
  }),
};

export const dashboardStatsSchema = z.object({
  totalUsers: z.number().int(),
  activeUsers: z.number().int(),
  disabledUsers: z.number().int(),
  activeUsers7d: z.number().int(),
  activeUsers30d: z.number().int(),
  completedOnboarding: z.number().int(),
  pendingOnboarding: z.number().int(),
  newRegistrations7d: z.number().int(),
  newRegistrations30d: z.number().int(),
  recentUsers: z.array(
    z.object({
      id: z.uuid(),
      email: z.string(),
      displayName: z.string(),
      role: z.string(),
      status: z.string(),
      onboardingCompleted: z.boolean(),
      createdAt: z.iso.datetime(),
    }),
  ),
  registrationTrend: z.array(
    z.object({
      date: z.string(),
      count: z.number().int(),
    }),
  ),
});

export const listAdminUsersRequest = {
  query: paginationQuerySchema.extend({
    search: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    role: z.enum(['admin', 'member']).optional(),
    onboarding: z.enum(['completed', 'pending']).optional(),
    sort: z.enum(['createdAt', 'email', 'displayName', 'status']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
};

export const getUserRequest = {
  params: idParamsSchema,
};

export const getUserActivityRequest = {
  params: idParamsSchema,
};

export const adminUserActivitySchema = z.object({
  userId: z.uuid(),
  workouts: z.object({
    totalSessions: z.number().int().nonnegative(),
    totalDurationMin: z.number().int().nonnegative(),
    totalVolumeKg: z.number().nonnegative(),
    recentSessions: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        startedAt: z.iso.datetime(),
        completedAt: z.iso.datetime().nullable(),
        durationMin: z.number().int().nonnegative(),
        volumeKg: z.number().nonnegative(),
      }),
    ),
  }),
  nutrition: z.object({
    totalMeals: z.number().int().nonnegative(),
    avgDailyCalories: z.number().int().nonnegative(),
    recentMeals: z.array(
      z.object({
        id: z.uuid(),
        mealType: z.string(),
        calories: z.number().int().nonnegative(),
        proteinG: z.number().nonnegative(),
        carbsG: z.number().nonnegative(),
        fatG: z.number().nonnegative(),
        loggedAt: z.iso.datetime(),
      }),
    ),
  }),
  weight: z.object({
    currentWeightKg: z.number().nullable(),
    startingWeightKg: z.number().nullable(),
    totalEntries: z.number().int().nonnegative(),
    recentEntries: z.array(
      z.object({
        id: z.uuid(),
        weightKg: z.number(),
        loggedAt: z.iso.datetime(),
      }),
    ),
  }),
});

export const adminUserListItemSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: z.string(),
  status: z.string(),
  version: z.number().int(),
  onboardingCompleted: z.boolean(),
  currentOnboardingStep: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  disabledAt: z.iso.datetime().nullable(),
});

export const adminUserListResponseSchema = z.array(adminUserListItemSchema);

export const adminUserDetailSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.string(),
    displayName: z.string(),
    role: z.string(),
    status: z.string(),
    version: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    disabledAt: z.iso.datetime().nullable(),
  }),
  sessionsSummary: z.object({
    activeSessionsCount: z.number().int(),
    lastActiveAt: z.iso.datetime().nullable(),
  }),
  profileMetadata: z.object({
    hasProfile: z.boolean(),
    onboardingCompleted: z.boolean(),
    currentOnboardingStep: z.string().nullable(),
    primaryGoal: z.string().nullable(),
    experienceLevel: z.string().nullable(),
    preferredWorkoutPlace: z.string().nullable(),
    workoutDaysPerWeek: z.number().nullable(),
    preferredWorkoutDurationMin: z.number().nullable(),
    dietType: z.string().nullable(),
    dailyCalorieTarget: z.number().nullable(),
    dailyProteinGrams: z.number().nullable(),
    createdAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime().nullable(),
  }),
});

export const changeUserStatusRequest = {
  params: idParamsSchema,
  body: z.strictObject({
    reason: z.string().trim().max(255).optional(),
  }),
};

export const listAuditLogsRequest = {
  query: paginationQuerySchema.extend({
    action: z.string().trim().min(1).max(100).optional(),
    adminId: z.uuid().optional(),
    targetUserId: z.uuid().optional(),
  }),
};

export const auditLogItemSchema = z.object({
  id: z.uuid(),
  adminId: z.uuid(),
  adminEmail: z.string().nullable(),
  adminName: z.string().nullable(),
  action: z.string(),
  targetUserId: z.uuid().nullable(),
  targetUserEmail: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const auditLogListResponseSchema = z.array(auditLogItemSchema);
