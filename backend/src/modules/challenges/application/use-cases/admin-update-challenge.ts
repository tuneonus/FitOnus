import { Challenge, type ChallengeStatus } from '../../domain/challenge.js';
import { ChallengeNotFoundError } from '../../domain/errors.js';
import type { ChallengeEnrollment } from '../../domain/challenge-enrollment.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type {
  IChallengeRepository,
  IChallengeOccurrenceRepository,
  IChallengeEnrollmentRepository,
} from '../ports.js';
import { toChallengeView, type ChallengeView } from '../views.js';

export interface AdminUpdateChallengeInput {
  id: string;
  title?: string;
  description?: string;
  targetValue?: number;
  rewardPoints?: number;
  rewardBadgeId?: string | null;
  status?: ChallengeStatus;
  autoEnroll?: boolean;
  iconName?: string;
  bannerColor?: string;
  metadata?: Record<string, unknown>;
}

export class AdminUpdateChallengeUseCase {
  constructor(
    private readonly challengeRepo: IChallengeRepository,
    private readonly occurrenceRepo: IChallengeOccurrenceRepository,
    private readonly enrollmentRepo: IChallengeEnrollmentRepository,
  ) {}

  async execute(input: AdminUpdateChallengeInput): Promise<{ challenge: ChallengeView }> {
    const { id } = input;
    const challenge = await this.challengeRepo.findById(id);
    if (!challenge) {
      throw new ChallengeNotFoundError(id);
    }

    // Safety rule: if targetValue is changing, ensure no active occurrences have in-progress enrollments
    if (input.targetValue !== undefined && input.targetValue !== challenge.targetValue) {
      if (input.targetValue <= 0) {
        throw new AppError('bad_request', 'BAD_REQUEST', 'targetValue must be greater than 0');
      }

      const occurrences = await this.occurrenceRepo.listByChallenge(challenge.id, 5);
      for (const occ of occurrences) {
        if (occ.status === 'active') {
          const enrollments = await this.enrollmentRepo.listByOccurrence(occ.id);
          const hasInProgress = enrollments.some((e: ChallengeEnrollment) => e.status === 'in_progress');
          if (hasInProgress) {
            throw new AppError(
              'conflict',
              'CONFLICT',
              'Cannot modify target value of a challenge with active in-progress enrollments. Archive it and create a new challenge definition instead.',
            );
          }
        }
      }
    }

    if (input.rewardPoints !== undefined && input.rewardPoints < 0) {
      throw new AppError('bad_request', 'BAD_REQUEST', 'rewardPoints cannot be negative');
    }

    const now = new Date();
    const updated = new Challenge({
      id: challenge.id,
      slug: challenge.slug,
      title: input.title !== undefined ? input.title.trim() : challenge.title,
      description: input.description !== undefined ? input.description.trim() : challenge.description,
      cadence: challenge.cadence,
      category: challenge.category,
      metricType: challenge.metricType,
      targetValue: input.targetValue !== undefined ? input.targetValue : challenge.targetValue,
      rewardPoints: input.rewardPoints !== undefined ? input.rewardPoints : challenge.rewardPoints,
      rewardBadgeId: input.rewardBadgeId !== undefined ? input.rewardBadgeId : challenge.rewardBadgeId,
      status: input.status !== undefined ? input.status : challenge.status,
      autoEnroll: input.autoEnroll !== undefined ? input.autoEnroll : challenge.autoEnroll,
      iconName: input.iconName !== undefined ? input.iconName : challenge.iconName,
      bannerColor: input.bannerColor !== undefined ? input.bannerColor : challenge.bannerColor,
      metadata: input.metadata !== undefined ? input.metadata : challenge.metadata,
      createdAt: challenge.createdAt,
      updatedAt: now,
      deletedAt: challenge.deletedAt,
    });

    await this.challengeRepo.save(updated);
    return { challenge: toChallengeView(updated) };
  }
}
