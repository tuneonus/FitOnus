import type { Badge } from '../domain/badge.js';
import type { Challenge, ChallengeCadence, ChallengeStatus } from '../domain/challenge.js';
import type { ChallengeEnrollment, EnrollmentStatus } from '../domain/challenge-enrollment.js';
import type { ChallengeOccurrence, OccurrenceStatus } from '../domain/challenge-occurrence.js';
import type { GamificationProfile } from '../domain/gamification-profile.js';
import type { PointsLedgerEntry } from '../domain/points-ledger.js';
import type { UserBadge } from '../domain/user-badge.js';

export interface IChallengeRepository {
  findById(id: string): Promise<Challenge | null>;
  findBySlug(slug: string): Promise<Challenge | null>;
  listPublished(): Promise<Challenge[]>;
  listAll(options?: { cadence?: ChallengeCadence; status?: ChallengeStatus }): Promise<Challenge[]>;
  save(challenge: Challenge): Promise<void>;
  softDelete(id: string): Promise<void>;
}

export interface IChallengeOccurrenceRepository {
  findById(id: string): Promise<ChallengeOccurrence | null>;
  findByChallengeAndStart(challengeId: string, periodStart: Date): Promise<ChallengeOccurrence | null>;
  findByChallengeAndKey(challengeId: string, occurrenceKey: string): Promise<ChallengeOccurrence | null>;
  listActiveForPeriod(fromDate: Date, toDate: Date): Promise<ChallengeOccurrence[]>;
  listByChallenge(challengeId: string, limit?: number): Promise<ChallengeOccurrence[]>;
  findOrCreate(occurrence: ChallengeOccurrence): Promise<ChallengeOccurrence>;
  updateStatus(id: string, status: OccurrenceStatus): Promise<void>;
}

export interface IChallengeEnrollmentRepository {
  findById(id: string): Promise<ChallengeEnrollment | null>;
  findByUserAndOccurrence(userId: string, occurrenceId: string): Promise<ChallengeEnrollment | null>;
  listByUser(userId: string, status?: EnrollmentStatus): Promise<ChallengeEnrollment[]>;
  listByOccurrence(occurrenceId: string): Promise<ChallengeEnrollment[]>;
  enroll(enrollment: ChallengeEnrollment): Promise<ChallengeEnrollment>;
  save(enrollment: ChallengeEnrollment): Promise<void>;
}

export interface IBadgeRepository {
  findById(id: string): Promise<Badge | null>;
  findBySlug(slug: string): Promise<Badge | null>;
  listActive(): Promise<Badge[]>;
  save(badge: Badge): Promise<void>;
}

export interface IUserBadgeRepository {
  listByUser(userId: string): Promise<UserBadge[]>;
  hasBadge(userId: string, badgeId: string): Promise<boolean>;
  awardBadge(userBadge: UserBadge): Promise<boolean>;
}

export interface IGamificationProfileRepository {
  findByUserId(userId: string): Promise<GamificationProfile | null>;
  save(profile: GamificationProfile): Promise<void>;
}

export interface IGamificationPointsLedgerRepository {
  recordPoints(entry: PointsLedgerEntry): Promise<boolean>;
  listByUser(userId: string, limit?: number): Promise<PointsLedgerEntry[]>;
  getTotalPoints(userId: string): Promise<number>;
}

export interface IGamificationTelemetryPort {
  getWorkoutCount(userId: string, fromDate: Date, toDate: Date): Promise<number>;
  getWorkoutDurationMinutes(userId: string, fromDate: Date, toDate: Date): Promise<number>;
  getWorkoutVolumeKg(userId: string, fromDate: Date, toDate: Date): Promise<number>;
  getHabitCompletionsCount(userId: string, fromDate: Date, toDate: Date): Promise<number>;
  getMaxHabitStreak(userId: string): Promise<number>;
  getWaterLiters(userId: string, fromDate: Date, toDate: Date): Promise<number>;
  getCalorieTargetHitDays(userId: string, fromDate: Date, toDate: Date): Promise<number>;
  getProteinTargetHitDays(userId: string, fromDate: Date, toDate: Date): Promise<number>;
  getPersonalRecordsCount(userId: string): Promise<number>;
  getWeightLossKg(userId: string): Promise<number>;
  getTotalWorkoutCount(userId: string): Promise<number>;
}

export interface ClaimRewardTransactionInput {
  userId: string;
  occurrenceId: string;
  points: number;
  badgeId?: string | null;
  description: string;
}

export interface ClaimRewardTransactionResult {
  claimed: boolean;
  pointsAwarded: number;
  badgeAwarded: boolean;
  newTotalPoints: number;
  newLevel: number;
}

export interface IGamificationRewardPort {
  executeAtomicRewardClaim(input: ClaimRewardTransactionInput): Promise<ClaimRewardTransactionResult>;
}
