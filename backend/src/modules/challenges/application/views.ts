import type { BadgeCategory, BadgeTier } from '../domain/badge.js';
import type {
  ChallengeCadence,
  ChallengeCategory,
  ChallengeMetricType,
  ChallengeStatus,
} from '../domain/challenge.js';
import type { EnrollmentStatus } from '../domain/challenge-enrollment.js';
import type { OccurrenceStatus } from '../domain/challenge-occurrence.js';
import type { PointSourceType } from '../domain/points-ledger.js';
import type { BadgeTriggerType } from '../domain/user-badge.js';

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

export interface UserBadgeView {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: string;
  triggerType: BadgeTriggerType;
  triggerId: string | null;
  metadata: Record<string, unknown>;
  badge?: BadgeView;
}

export interface GamificationProfileView {
  userId: string;
  totalPoints: number;
  currentLevel: number;
  levelTitle: string;
  currentLevelMinPoints: number;
  nextLevelMinPoints: number;
  pointsToNextLevel: number;
  levelProgressRatio: number;
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

export interface ActiveChallengeItemView {
  challenge: ChallengeView;
  occurrence: ChallengeOccurrenceView;
  enrollment: ChallengeEnrollmentView | null;
  enrolled: boolean;
  canClaim: boolean;
}

export function toChallengeView(challenge: {
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
  createdAt: Date;
  updatedAt: Date;
}): ChallengeView {
  return {
    id: challenge.id,
    slug: challenge.slug,
    title: challenge.title,
    description: challenge.description,
    cadence: challenge.cadence,
    category: challenge.category,
    metricType: challenge.metricType,
    targetValue: challenge.targetValue,
    rewardPoints: challenge.rewardPoints,
    rewardBadgeId: challenge.rewardBadgeId,
    status: challenge.status,
    autoEnroll: challenge.autoEnroll,
    iconName: challenge.iconName,
    bannerColor: challenge.bannerColor,
    metadata: challenge.metadata,
    createdAt: challenge.createdAt.toISOString(),
    updatedAt: challenge.updatedAt.toISOString(),
  };
}

export function toOccurrenceView(occurrence: {
  id: string;
  challengeId: string;
  occurrenceKey: string;
  periodStart: Date;
  periodEnd: Date;
  status: OccurrenceStatus;
  createdAt: Date;
  updatedAt: Date;
}): ChallengeOccurrenceView {
  return {
    id: occurrence.id,
    challengeId: occurrence.challengeId,
    occurrenceKey: occurrence.occurrenceKey,
    periodStart: occurrence.periodStart.toISOString(),
    periodEnd: occurrence.periodEnd.toISOString(),
    status: occurrence.status,
    createdAt: occurrence.createdAt.toISOString(),
    updatedAt: occurrence.updatedAt.toISOString(),
  };
}

export function toEnrollmentView(enrollment: {
  id: string;
  userId: string;
  occurrenceId: string;
  challengeId: string;
  status: EnrollmentStatus;
  currentProgress: number;
  targetValue: number;
  progressRatio: number;
  completedAt: Date | null;
  claimedAt: Date | null;
  lastEvaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): ChallengeEnrollmentView {
  return {
    id: enrollment.id,
    userId: enrollment.userId,
    occurrenceId: enrollment.occurrenceId,
    challengeId: enrollment.challengeId,
    status: enrollment.status,
    currentProgress: enrollment.currentProgress,
    targetValue: enrollment.targetValue,
    progressRatio: enrollment.progressRatio,
    completedAt: enrollment.completedAt ? enrollment.completedAt.toISOString() : null,
    claimedAt: enrollment.claimedAt ? enrollment.claimedAt.toISOString() : null,
    lastEvaluatedAt: enrollment.lastEvaluatedAt.toISOString(),
    createdAt: enrollment.createdAt.toISOString(),
    updatedAt: enrollment.updatedAt.toISOString(),
  };
}

export function toBadgeView(
  badge: {
    id: string;
    slug: string;
    name: string;
    description: string;
    category: BadgeCategory;
    tier: BadgeTier;
    iconName: string;
    pointsValue: number;
    isActive: boolean;
  },
  earned = false,
  earnedAt: Date | null = null,
): BadgeView {
  return {
    id: badge.id,
    slug: badge.slug,
    name: badge.name,
    description: badge.description,
    category: badge.category,
    tier: badge.tier,
    iconName: badge.iconName,
    pointsValue: badge.pointsValue,
    isActive: badge.isActive,
    earned,
    earnedAt: earnedAt ? earnedAt.toISOString() : null,
  };
}

export function toGamificationProfileView(profile: {
  userId: string;
  totalPoints: number;
  currentLevel: number;
  getLevelInfo: () => {
    title: string;
    currentLevelMinPoints: number;
    nextLevelMinPoints: number;
    pointsToNextLevel: number;
    levelProgressRatio: number;
  };
  badgesCount: number;
  challengesWon: number;
  updatedAt: Date;
}): GamificationProfileView {
  const levelInfo = profile.getLevelInfo();
  return {
    userId: profile.userId,
    totalPoints: profile.totalPoints,
    currentLevel: profile.currentLevel,
    levelTitle: levelInfo.title,
    currentLevelMinPoints: levelInfo.currentLevelMinPoints,
    nextLevelMinPoints: levelInfo.nextLevelMinPoints,
    pointsToNextLevel: levelInfo.pointsToNextLevel,
    levelProgressRatio: levelInfo.levelProgressRatio,
    badgesCount: profile.badgesCount,
    challengesWon: profile.challengesWon,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export function toPointsLedgerView(entry: {
  id: string;
  userId: string;
  points: number;
  sourceType: PointSourceType;
  sourceId: string;
  description: string;
  createdAt: Date;
}): PointsLedgerView {
  return {
    id: entry.id,
    userId: entry.userId,
    points: entry.points,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    description: entry.description,
    createdAt: entry.createdAt.toISOString(),
  };
}
