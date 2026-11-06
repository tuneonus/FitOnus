import { randomUUID } from 'node:crypto';
import { ChallengeEnrollment } from '../../domain/challenge-enrollment.js';
import {
  ChallengeNotFoundError,
  DuplicateEnrollmentError,
  OccurrenceClosedError,
  OccurrenceNotFoundError,
} from '../../domain/errors.js';
import type {
  IChallengeRepository,
  IChallengeOccurrenceRepository,
  IChallengeEnrollmentRepository,
} from '../ports.js';
import { toEnrollmentView, type ChallengeEnrollmentView } from '../views.js';

export interface EnrollChallengeInput {
  userId: string;
  occurrenceId: string;
}

export class EnrollChallengeUseCase {
  constructor(
    private readonly challengeRepo: IChallengeRepository,
    private readonly occurrenceRepo: IChallengeOccurrenceRepository,
    private readonly enrollmentRepo: IChallengeEnrollmentRepository,
  ) {}

  async execute(input: EnrollChallengeInput): Promise<{ enrollment: ChallengeEnrollmentView }> {
    const { userId, occurrenceId } = input;
    if (!userId) throw new Error('User ID is required');
    if (!occurrenceId) throw new Error('Occurrence ID is required');

    // 1. Find occurrence
    const occurrence = await this.occurrenceRepo.findById(occurrenceId);
    if (!occurrence) {
      throw new OccurrenceNotFoundError(occurrenceId);
    }

    // 2. Validate occurrence is active
    const now = new Date();
    if (occurrence.status === 'closed' || occurrence.status === 'archived' || now.getTime() > occurrence.periodEnd.getTime()) {
      throw new OccurrenceClosedError(occurrenceId);
    }

    // 3. Find parent challenge definition
    const challenge = await this.challengeRepo.findById(occurrence.challengeId);
    if (!challenge) {
      throw new ChallengeNotFoundError(occurrence.challengeId);
    }

    // 4. Check if already enrolled
    const existing = await this.enrollmentRepo.findByUserAndOccurrence(userId, occurrence.id);
    if (existing) {
      throw new DuplicateEnrollmentError(userId, occurrence.id);
    }

    // 5. Create new enrollment
    const enrollment = new ChallengeEnrollment({
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

    const saved = await this.enrollmentRepo.enroll(enrollment);
    return { enrollment: toEnrollmentView(saved) };
  }
}

