// ─────────────────────────────────────────────
// Phase 7 — Challenges & Gamification
// Admin types aligned with backend Zod schema
// ─────────────────────────────────────────────

export type ChallengeCadence = 'daily' | 'weekly' | 'monthly' | 'special' | 'custom';

export type ChallengeCategory = 'workout' | 'habit' | 'nutrition' | 'hydration' | 'mixed';

export type ChallengeMetricType =
  | 'workout_count'
  | 'workout_duration_min'
  | 'workout_volume_kg'
  | 'habit_completion_count'
  | 'habit_streak_days'
  | 'water_liters'
  | 'calorie_compliance_days'
  | 'protein_target_days'
  | 'personal_record_count';

export type ChallengeStatus = 'draft' | 'published' | 'archived';

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  description: string;
  cadence: ChallengeCadence;
  category: ChallengeCategory;
  metricType: ChallengeMetricType;
  targetValue: number;
  rewardPoints: number;
  rewardBadgeId: string | null;
  status: ChallengeStatus;
  autoEnroll: boolean;
  iconName: string;
  bannerColor: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ListChallengesQuery {
  cadence?: ChallengeCadence | '';
  status?: ChallengeStatus | '';
}

export interface CreateChallengeInput {
  slug: string;
  title: string;
  description: string;
  cadence: ChallengeCadence;
  category: ChallengeCategory;
  metricType: ChallengeMetricType;
  targetValue: number;
  rewardPoints: number;
  rewardBadgeId?: string | null;
  autoEnroll?: boolean;
  iconName?: string;
  bannerColor?: string;
}

export interface UpdateChallengeInput {
  title?: string;
  description?: string;
  targetValue?: number;
  rewardPoints?: number;
  rewardBadgeId?: string | null;
  status?: ChallengeStatus;
  autoEnroll?: boolean;
  iconName?: string;
  bannerColor?: string;
}

// ─── UI helpers ───────────────────────────────

export const CADENCE_LABELS: Record<ChallengeCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  special: 'Special',
  custom: 'Custom',
};

export const CATEGORY_LABELS: Record<ChallengeCategory, string> = {
  workout: 'Workout',
  habit: 'Habit',
  nutrition: 'Nutrition',
  hydration: 'Hydration',
  mixed: 'Mixed',
};

export const METRIC_TYPE_LABELS: Record<ChallengeMetricType, string> = {
  workout_count: 'Workout Count',
  workout_duration_min: 'Workout Duration (min)',
  workout_volume_kg: 'Workout Volume (kg)',
  habit_completion_count: 'Habit Completions',
  habit_streak_days: 'Habit Streak Days',
  water_liters: 'Water (liters)',
  calorie_compliance_days: 'Calorie Compliance Days',
  protein_target_days: 'Protein Target Days',
  personal_record_count: 'Personal Records',
};

export const STATUS_LABELS: Record<ChallengeStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

// ─── Phase 11 Admin Stats & Dynamic Badges ───

export interface AdminChallengeStats {
  totalChallenges: number;
  publishedChallenges: number;
  draftChallenges: number;
  archivedChallenges: number;
  totalEnrollments: number;
  activeParticipants: number;
  completedEnrollments: number;
  completionRatePct: number;
  totalBadgesAwarded: number;
  totalPointsAwarded: number;
}

export type BadgeCategory = 'workout' | 'streak' | 'nutrition' | 'strength' | 'milestone' | 'challenge';
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'special';

export interface AdminBadge {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  tier: BadgeTier;
  iconName: string;
  pointsValue: number;
  unlockCondition: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBadgeInput {
  slug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  tier?: BadgeTier;
  iconName?: string;
  pointsValue?: number;
  unlockCondition?: Record<string, unknown>;
}

