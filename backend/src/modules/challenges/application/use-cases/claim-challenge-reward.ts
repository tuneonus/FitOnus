import {
  ChallengeNotFoundError,
  EnrollmentNotFoundError,
  IneligibleForRewardError,
  OccurrenceClosedError,
  OccurrenceNotFoundError,
  RewardAlreadyClaimedError,
} from '../../domain/errors.js';
import { canClaimOccurrenceReward } from '../../domain/period-calculator.js';
import type {
  IChallengeRepository,
  IChallengeOccurrenceRepository,
  IChallengeEnrollmentRepository,
  IGamificationRewardPort,
} from '../ports.js';
import type { ChallengeEvaluatorService } from '../services/challenge-evaluator.js';

export interface ClaimChallengeRewardInput {
  userId: string;
  occurrenceId: string;
}

export interface ClaimChallengeRewardResult {
  claimed: boolean;
  pointsAwarded: number;
  badgeAwarded: boolean;
  newTotalPoints: number;
  newLevel: number;
}

export class ClaimChallengeRewardUseCase {
  constructor(
    private readonly challengeRepo: IChallengeRepository,
    private readonly occurrenceRepo: IChallengeOccurrenceRepository,
    private readonly enrollmentRepo: IChallengeEnrollmentRepository,
    private readonly rewardPort: IGamificationRewardPort,
    private readonly evaluatorService: ChallengeEvaluatorService,
  ) {}

  async execute(input: ClaimChallengeRewardInput): Promise<ClaimChallengeRewardResult> {
    const { userId, occurrenceId } = input;
    if (!userId) throw new Error('User ID is required');
    if (!occurrenceId) throw new Error('Occurrence ID is required');

    // 1. Find occurrence
    const occurrence = await this.occurrenceRepo.findById(occurrenceId);
    if (!occurrence) {
      throw new OccurrenceNotFoundError(occurrenceId);
    }

    // 2. Enforce 7-day claim grace period
    const now = new Date();
    if (!canClaimOccurrenceReward(occurrence.periodEnd, now, 7)) {
      throw new OccurrenceClosedError('Reward claim window for this occurrence has expired (7-day grace period exceeded).');
    }

    // 3. Find parent challenge
    const challenge = await this.challengeRepo.findById(occurrence.challengeId);
    if (!challenge) {
      throw new ChallengeNotFoundError(occurrence.challengeId);
    }

    // 4. Find user enrollment
    const enrollment = await this.enrollmentRepo.findByUserAndOccurrence(userId, occurrence.id);
    if (!enrollment) {
      throw new EnrollmentNotFoundError(`Occurrence: ${occurrence.id}`);
    }

    if (enrollment.isClaimed()) {
      throw new RewardAlreadyClaimedError(occurrence.id);
    }

    // 5. Single source of truth: re-verify genuine telemetry before claiming
    const verifiedProgress = await this.evaluatorService.evaluateMetric({
      userId,
      metricType: challenge.metricType,
      periodStart: occurrence.periodStart,
      periodEnd: occurrence.periodEnd,
    });

    if (verifiedProgress < challenge.targetValue) {
      // Update progress to reflect real telemetry
      enrollment.updateProgress(verifiedProgress, now);
      await this.enrollmentRepo.save(enrollment);
      throw new IneligibleForRewardError(
        `Target not completed. Progress is ${verifiedProgress} of ${challenge.targetValue}.`,
      );
    }

    // Ensure enrollment is marked completed before atomic claim
    if (enrollment.status !== 'completed') {
      enrollment.updateProgress(verifiedProgress, now);
      await this.enrollmentRepo.save(enrollment);
    }

    // 6. Execute atomic transaction (locks enrollment, inserts ledger, awards badge, updates profile)
    return this.rewardPort.executeAtomicRewardClaim({
      userId,
      occurrenceId: occurrence.id,
      points: challenge.rewardPoints,
      badgeId: challenge.rewardBadgeId,
      description: `Completed challenge: ${challenge.title}`,
    });
  }
}

