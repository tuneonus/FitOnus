import { randomUUID } from 'node:crypto';
import { ChallengeOccurrence } from '../../domain/challenge-occurrence.js';
import { ChallengeEnrollment } from '../../domain/challenge-enrollment.js';
import { calculateOccurrencePeriod } from '../../domain/period-calculator.js';
import type {
  IChallengeRepository,
  IChallengeOccurrenceRepository,
  IChallengeEnrollmentRepository,
} from '../ports.js';
import {
  toChallengeView,
  toOccurrenceView,
  toEnrollmentView,
  type ActiveChallengeItemView,
} from '../views.js';
import type { ChallengeEvaluatorService } from '../services/challenge-evaluator.js';

export interface ListActiveChallengesInput {
  userId: string;
  timezone?: string;
  evaluate?: boolean;
}

export class ListActiveChallengesUseCase {
  constructor(
    private readonly challengeRepo: IChallengeRepository,
    private readonly occurrenceRepo: IChallengeOccurrenceRepository,
    private readonly enrollmentRepo: IChallengeEnrollmentRepository,
    private readonly evaluatorService?: ChallengeEvaluatorService,
  ) {}

  async execute(input: ListActiveChallengesInput): Promise<{ challenges: ActiveChallengeItemView[] }> {
    const { userId, timezone = 'UTC', evaluate = true } = input;
    if (!userId) {
      throw new Error('User ID is required');
    }

    const challenges = await this.challengeRepo.listPublished();
    const result: ActiveChallengeItemView[] = [];
    const now = new Date();

    for (const challenge of challenges) {
      // 1. Calculate occurrence period based on challenge cadence and user's timezone
      const { periodStart, periodEnd, occurrenceKey } = calculateOccurrencePeriod(
        challenge.cadence,
        now,
        timezone,
      );

      // 2. Find or create occurrence for this period
      const newOccurrence = new ChallengeOccurrence({
        id: randomUUID(),
        challengeId: challenge.id,
        occurrenceKey,
        periodStart,
        periodEnd,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });

      const occurrence = await this.occurrenceRepo.findOrCreate(newOccurrence);

      // 3. Check if user is enrolled
      let enrollment = await this.enrollmentRepo.findByUserAndOccurrence(userId, occurrence.id);

      // 4. Auto-enroll if configured and not yet enrolled
      if (!enrollment && challenge.autoEnroll) {
        const newEnrollment = new ChallengeEnrollment({
          id: randomUUID(),
          userId,
          occurrenceId: occurrence.id,
          challengeId: challenge.id,
          status: 'in_progress',
          currentProgress: 0,
          targetValue: challenge.targetValue,
          lastEvaluatedAt: now,
          createdAt: now,
          updatedAt: now,
        });

        enrollment = await this.enrollmentRepo.enroll(newEnrollment);
      }

      // 5. Evaluate progress if enrolled and evaluation requested
      if (enrollment && evaluate && this.evaluatorService && !enrollment.isClaimed()) {
        const measuredVal = await this.evaluatorService.evaluateMetric({
          userId,
          metricType: challenge.metricType,
          periodStart: occurrence.periodStart,
          periodEnd: occurrence.periodEnd,
        });

        if (measuredVal !== enrollment.currentProgress) {
          enrollment.updateProgress(measuredVal, now);
          await this.enrollmentRepo.save(enrollment);
        }
      }

      result.push({
        challenge: toChallengeView(challenge),
        occurrence: toOccurrenceView(occurrence),
        enrollment: enrollment ? toEnrollmentView(enrollment) : null,
        enrolled: enrollment !== null,
        canClaim: enrollment ? enrollment.canClaim() : false,
      });
    }

    return { challenges: result };
  }
}
