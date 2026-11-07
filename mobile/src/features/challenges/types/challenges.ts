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

export type OccurrenceStatus = 'upcoming' | 'active' | 'evaluating' | 'closed' | 'archived';

export type EnrollmentStatus = 'joined' | 'in_progress' | 'completed' | 'claimed' | 'expired';

export type BadgeCategory = 'workout' | 'streak' | 'nutrition' | 'strength' | 'milestone' | 'challenge';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'special';

export type PointSourceType =
  | 'challenge'
  | 'badge'
  | 'habit_streak'
  | 'workout_milestone'
  | 'admin_adjustment';

export interface ChallengeView {
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

export interface ChallengeOccurrenceView {
  id: string;
  challengeId: string;
  occurrenceKey: string;
  periodStart: string;
  periodEnd: string;
  status: OccurrenceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ChallengeEnrollmentView {
  id: string;
  userId: string;
  occurrenceId: string;
  challengeId: string;
  status: EnrollmentStatus;
  currentProgress: number;
  targetValue: number;
  progressRatio: number; // 0.0 to 1.0
  completedAt: string | null;
  claimedAt: string | null;
  lastEvaluatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveChallengeItemView {
  challenge: ChallengeView;
  occurrence: ChallengeOccurrenceView;
  enrollment: ChallengeEnrollmentView | null;
  enrolled: boolean;
  canClaim: boolean;
}

export interface BadgeView {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  tier: BadgeTier;
  iconName: string;
  pointsValue: number;
  isActive: boolean;
  earned?: boolean;
  earnedAt?: string | null;
}

export interface GamificationProfileView {
  userId: string;
  totalPoints: number;
  currentLevel: number;
  levelTitle: string;
  currentLevelMinPoints: number;
  nextLevelMinPoints: number;
  pointsToNextLevel: number;
  levelProgressRatio: number; // 0.0 to 1.0
  badgesCount: number;
  challengesWon: number;
  updatedAt: string;
}

export interface PointsLedgerView {
  id: string;
  userId: string;
  points: number;
  sourceType: PointSourceType;
  sourceId: string;
  description: string;
  createdAt: string;
}

export interface ClaimRewardResult {
  claimed: boolean;
  pointsAwarded: number;
  badgeAwarded: boolean;
  newTotalPoints: number;
  newLevel: number;
}

export interface GetChallengesParams {
  timezone?: string;
}

export interface GetChallengeHistoryParams {
  status?: 'active' | 'completed' | 'failed';
}

export interface GetPointsHistoryParams {
  limit?: number;
}

/**
 * Format metric value with appropriate unit for display
 */
export function formatMetricProgress(
  metricType: ChallengeMetricType,
  current: number,
  target: number,
): { currentStr: string; targetStr: string; unit: string } {
  switch (metricType) {
    case 'workout_count':
      return {
        currentStr: `${current}`,
        targetStr: `${target}`,
        unit: target === 1 ? 'workout' : 'workouts',
      };
    case 'workout_duration_min':
      return {
        currentStr: `${Math.round(current)}`,
        targetStr: `${Math.round(target)}`,
        unit: 'min',
      };
    case 'workout_volume_kg':
      return {
        currentStr: `${Math.round(current).toLocaleString()}`,
        targetStr: `${Math.round(target).toLocaleString()}`,
        unit: 'kg',
      };
    case 'habit_completion_count':
      return {
        currentStr: `${current}`,
        targetStr: `${target}`,
        unit: target === 1 ? 'time' : 'times',
      };
    case 'habit_streak_days':
      return {
        currentStr: `${current}`,
        targetStr: `${target}`,
        unit: target === 1 ? 'day streak' : 'days streak',
      };
    case 'water_liters':
      return {
        currentStr: `${Number(current.toFixed(1))}`,
        targetStr: `${Number(target.toFixed(1))}`,
        unit: 'L',
      };
    case 'calorie_compliance_days':
    case 'protein_target_days':
      return {
        currentStr: `${current}`,
        targetStr: `${target}`,
        unit: target === 1 ? 'day' : 'days',
      };
    case 'personal_record_count':
      return {
        currentStr: `${current}`,
        targetStr: `${target}`,
        unit: target === 1 ? 'PR' : 'PRs',
      };
    default:
      return {
        currentStr: `${current}`,
        targetStr: `${target}`,
        unit: '',
      };
  }
}
