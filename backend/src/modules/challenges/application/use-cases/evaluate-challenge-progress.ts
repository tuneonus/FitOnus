import {
  ChallengeNotFoundError,
  EnrollmentNotFoundError,
  OccurrenceNotFoundError,
} from '../../domain/errors.js';
import type {
  IChallengeRepository,
  IChallengeOccurrenceRepository,
  IChallengeEnrollmentRepository,
} from '../ports.js';
import { toEnrollmentView, type ChallengeEnrollmentView } from '../views.js';
import type { ChallengeEvaluatorService } from '../services/challenge-evaluator.js';

export interface EvaluateChallengeProgressInput {
  userId: string;
  occurrenceId?: string;
}

export class EvaluateChallengeProgressUseCase {
  constructor(
    private readonly challengeRepo: IChallengeRepository,
    private readonly occurrenceRepo: IChallengeOccurrenceRepository,
    private readonly enrollmentRepo: IChallengeEnrollmentRepository,
    private readonly evaluatorService: ChallengeEvaluatorService,
  ) {}

  async execute(input: EvaluateChallengeProgressInput): Promise<{ enrollments: ChallengeEnrollmentView[] }> {
    const { userId, occurrenceId } = input;
    if (!userId) throw new Error('User ID is required');

    const now = new Date();

    if (occurrenceId) {
      // Evaluate single occurrence enrollment
      const occurrence = await this.occurrenceRepo.findById(occurrenceId);
      if (!occurrence) throw new OccurrenceNotFoundError(occurrenceId);

      const challenge = await this.challengeRepo.findById(occurrence.challengeId);
      if (!challenge) throw new ChallengeNotFoundError(occurrence.challengeId);

      const enrollment = await this.enrollmentRepo.findByUserAndOccurrence(userId, occurrence.id);
      if (!enrollment) throw new EnrollmentNotFoundError(`Occurrence: ${occurrence.id}`);

      if (!enrollment.isClaimed()) {
        const measured = await this.evaluatorService.evaluateMetric({
          userId,
          metricType: challenge.metricType,
          periodStart: occurrence.periodStart,
          periodEnd: occurrence.periodEnd,
        });

        enrollment.updateProgress(measured, now);
        await this.enrollmentRepo.save(enrollment);
      }

      return { enrollments: [toEnrollmentView(enrollment)] };
    }

    // Evaluate all active enrollments for user
    const activeEnrollments = await this.enrollmentRepo.listByUser(userId);
    const updatedViews: ChallengeEnrollmentView[] = [];

    for (const enrollment of activeEnrollments) {
      if (enrollment.isClaimed()) {
        updatedViews.push(toEnrollmentView(enrollment));
        continue;
      }

      const occurrence = await this.occurrenceRepo.findById(enrollment.occurrenceId);
      if (!occurrence) continue;

      const challenge = await this.challengeRepo.findById(enrollment.challengeId);
      if (!challenge) continue;

      const measured = await this.evaluatorService.evaluateMetric({
        userId,
        metricType: challenge.metricType,
        periodStart: occurrence.periodStart,
        periodEnd: occurrence.periodEnd,
      });

      enrollment.updateProgress(measured, now);
      await this.enrollmentRepo.save(enrollment);
      updatedViews.push(toEnrollmentView(enrollment));
    }

    return { enrollments: updatedViews };
  }
}

