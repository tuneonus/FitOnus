import { Challenge, type ChallengeCadence, type ChallengeStatus } from '../../domain/challenge.js';
import { ChallengeNotFoundError } from '../../domain/errors.js';
import type { IChallengeRepository } from '../ports.js';
import { toChallengeView, type ChallengeView } from '../views.js';

export class AdminPublishChallengeUseCase {
  constructor(private readonly challengeRepo: IChallengeRepository) {}

  async execute(input: { id: string }): Promise<{ challenge: ChallengeView }> {
    const challenge = await this.challengeRepo.findById(input.id);
    if (!challenge) {
      throw new ChallengeNotFoundError(input.id);
    }

    const updated = new Challenge({
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
      status: 'published',
      autoEnroll: challenge.autoEnroll,
      iconName: challenge.iconName,
      bannerColor: challenge.bannerColor,
      metadata: challenge.metadata,
      createdAt: challenge.createdAt,
      updatedAt: new Date(),
      deletedAt: null,
    });

    await this.challengeRepo.save(updated);
    return { challenge: toChallengeView(updated) };
  }
}

export class AdminArchiveChallengeUseCase {
  constructor(private readonly challengeRepo: IChallengeRepository) {}

  async execute(input: { id: string }): Promise<{ challenge: ChallengeView }> {
    const challenge = await this.challengeRepo.findById(input.id);
    if (!challenge) {
      throw new ChallengeNotFoundError(input.id);
    }

    const updated = new Challenge({
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
      status: 'archived',
      autoEnroll: challenge.autoEnroll,
      iconName: challenge.iconName,
      bannerColor: challenge.bannerColor,
      metadata: challenge.metadata,
      createdAt: challenge.createdAt,
      updatedAt: new Date(),
      deletedAt: challenge.deletedAt,
    });

    await this.challengeRepo.save(updated);
    return { challenge: toChallengeView(updated) };
  }
}

export class AdminListChallengesUseCase {
  constructor(private readonly challengeRepo: IChallengeRepository) {}

  async execute(input: { cadence?: ChallengeCadence; status?: ChallengeStatus } = {}): Promise<{ challenges: ChallengeView[] }> {
    const challenges = await this.challengeRepo.listAll(input);
    return { challenges: challenges.map(toChallengeView) };
  }
}

export class AdminGetChallengeUseCase {
  constructor(private readonly challengeRepo: IChallengeRepository) {}

  async execute(input: { id: string }): Promise<{ challenge: ChallengeView }> {
    const challenge = await this.challengeRepo.findById(input.id);
    if (!challenge) {
      throw new ChallengeNotFoundError(input.id);
    }
    return { challenge: toChallengeView(challenge) };
  }
}

