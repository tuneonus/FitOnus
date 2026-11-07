import type { EnrollmentStatus } from '../../domain/challenge-enrollment.js';
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

export interface GetChallengeHistoryInput {
  userId: string;
  status?: EnrollmentStatus;
}

export class GetChallengeHistoryUseCase {
  constructor(
    private readonly challengeRepo: IChallengeRepository,
    private readonly occurrenceRepo: IChallengeOccurrenceRepository,
    private readonly enrollmentRepo: IChallengeEnrollmentRepository,
  ) {}

  async execute(input: GetChallengeHistoryInput): Promise<{ history: ActiveChallengeItemView[] }> {
    const { userId, status } = input;
    if (!userId) throw new Error('User ID is required');

    const enrollments = await this.enrollmentRepo.listByUser(userId, status);
    const history: ActiveChallengeItemView[] = [];

    for (const enrollment of enrollments) {
      const occurrence = await this.occurrenceRepo.findById(enrollment.occurrenceId);
      if (!occurrence) continue;

      const challenge = await this.challengeRepo.findById(enrollment.challengeId);
      if (!challenge) continue;

      history.push({
        challenge: toChallengeView(challenge),
        occurrence: toOccurrenceView(occurrence),
        enrollment: toEnrollmentView(enrollment),
        enrolled: true,
        canClaim: enrollment.canClaim(),
      });
    }

    return { history };
  }
}
