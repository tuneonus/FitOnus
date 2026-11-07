import { z } from 'zod';

// ============================================================================
// Common & Identifier Schemas
// ============================================================================

export const occurrenceIdParam = z.object({
  occurrenceId: z.string().uuid('Invalid occurrence ID. Must be a valid UUID.'),
});

export const challengeIdParam = z.object({
  challengeId: z.string().uuid('Invalid challenge ID. Must be a valid UUID.'),
});

export const timezoneQuery = z.object({
  timezone: z.string().max(60).optional(),
});

export const historyQuery = z.object({
  status: z.enum(['joined', 'in_progress', 'completed', 'claimed', 'expired']).optional(),
});

export const pointsHistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
});

// ============================================================================
// Response Views Schemas
// ============================================================================

export const challengeViewSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  cadence: z.enum(['daily', 'weekly', 'monthly', 'special', 'custom']),
  category: z.enum(['workout', 'habit', 'nutrition', 'hydration', 'mixed']),
  metricType: z.enum([
    'workout_count',
    'workout_duration_min',
    'workout_volume_kg',
    'habit_completion_count',
    'habit_streak_days',
    'water_liters',
    'calorie_compliance_days',
    'protein_target_days',
    'personal_record_count',
  ]),
  targetValue: z.number(),
  rewardPoints: z.number(),
  rewardBadgeId: z.string().uuid().nullable(),
  status: z.enum(['draft', 'published', 'archived']),
  autoEnroll: z.boolean(),
  iconName: z.string(),
  bannerColor: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const challengeOccurrenceViewSchema = z.object({
  id: z.string().uuid(),
  challengeId: z.string().uuid(),
  occurrenceKey: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  status: z.enum(['upcoming', 'active', 'evaluating', 'closed', 'archived']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const challengeEnrollmentViewSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  occurrenceId: z.string().uuid(),
  challengeId: z.string().uuid(),
  status: z.enum(['joined', 'in_progress', 'completed', 'claimed', 'expired']),
  currentProgress: z.number(),
  targetValue: z.number(),
  progressRatio: z.number(),
  completedAt: z.string().nullable(),
  claimedAt: z.string().nullable(),
  lastEvaluatedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const activeChallengeItemViewSchema = z.object({
  challenge: challengeViewSchema,
  occurrence: challengeOccurrenceViewSchema,
  enrollment: challengeEnrollmentViewSchema.nullable(),
  enrolled: z.boolean(),
  canClaim: z.boolean(),
});

export const badgeViewSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['workout', 'streak', 'nutrition', 'strength', 'milestone', 'challenge']),
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum', 'special']),
  iconName: z.string(),
  pointsValue: z.number(),
  isActive: z.boolean(),
  earned: z.boolean().optional(),
  earnedAt: z.string().nullable().optional(),
});

export const gamificationProfileViewSchema = z.object({
  userId: z.string().uuid(),
  totalPoints: z.number(),
  currentLevel: z.number(),
  levelTitle: z.string(),
  currentLevelMinPoints: z.number(),
  nextLevelMinPoints: z.number(),
  pointsToNextLevel: z.number(),
  levelProgressRatio: z.number(),
  badgesCount: z.number(),
  challengesWon: z.number(),
  updatedAt: z.string(),
});

export const pointsLedgerViewSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  points: z.number(),
  sourceType: z.enum(['challenge', 'badge', 'habit_streak', 'workout_milestone', 'admin_adjustment']),
  sourceId: z.string(),
  description: z.string(),
  createdAt: z.string(),
});

export const claimRewardResponseSchema = z.object({
  claimed: z.boolean(),
  pointsAwarded: z.number(),
  badgeAwarded: z.boolean(),
  newTotalPoints: z.number(),
  newLevel: z.number(),
});

// ============================================================================
// Member Endpoint Request Schemas
// ============================================================================

export const listActiveChallengesRequest = {
  query: timezoneQuery,
};

export const getChallengeHistoryRequest = {
  query: historyQuery,
};

export const enrollChallengeRequest = {
  params: occurrenceIdParam,
};

export const getChallengeProgressRequest = {
  params: occurrenceIdParam,
};

export const claimChallengeRewardRequest = {
  params: occurrenceIdParam,
};

export const getPointsHistoryRequest = {
  query: pointsHistoryQuery,
};

// ============================================================================
// Admin Endpoint Request Schemas
// ============================================================================

export const adminListChallengesRequest = {
  query: z.object({
    cadence: z.enum(['daily', 'weekly', 'monthly', 'special', 'custom']).optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
  }),
};

export const adminGetChallengeRequest = {
  params: challengeIdParam,
};

export const adminCreateChallengeRequest = {
  body: z
    .object({
      slug: z
        .string()
        .min(2)
        .max(100)
        .regex(/^[a-z0-9_-]+$/, 'Slug must be lowercase alphanumeric with hyphens or underscores'),
      title: z.string().min(2).max(150),
      description: z.string().min(5),
      cadence: z.enum(['daily', 'weekly', 'monthly', 'special', 'custom']),
      category: z.enum(['workout', 'habit', 'nutrition', 'hydration', 'mixed']),
      metricType: z.enum([
        'workout_count',
        'workout_duration_min',
        'workout_volume_kg',
        'habit_completion_count',
        'habit_streak_days',
        'water_liters',
        'calorie_compliance_days',
        'protein_target_days',
        'personal_record_count',
      ]),
      targetValue: z.number().positive('targetValue must be greater than 0'),
      rewardPoints: z.number().int().min(0, 'rewardPoints cannot be negative'),
      rewardBadgeId: z.string().uuid().nullable().optional(),
      status: z.enum(['draft', 'published', 'archived']).default('published').optional(),
      autoEnroll: z.boolean().default(true).optional(),
      iconName: z.string().max(50).default('trophy').optional(),
      bannerColor: z.string().max(30).default('teal').optional(),
      metadata: z.record(z.string(), z.unknown()).default({}).optional(),
    })
    .strict(),
};

export const adminUpdateChallengeRequest = {
  params: challengeIdParam,
  body: z
    .object({
      title: z.string().min(2).max(150).optional(),
      description: z.string().min(5).optional(),
      targetValue: z.number().positive('targetValue must be greater than 0').optional(),
      rewardPoints: z.number().int().min(0, 'rewardPoints cannot be negative').optional(),
      rewardBadgeId: z.string().uuid().nullable().optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      autoEnroll: z.boolean().optional(),
      iconName: z.string().max(50).optional(),
      bannerColor: z.string().max(30).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
};

export const adminPublishChallengeRequest = {
  params: challengeIdParam,
};

export const adminArchiveChallengeRequest = {
  params: challengeIdParam,
};
