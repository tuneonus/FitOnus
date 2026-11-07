import { randomUUID } from 'node:crypto';
import {
  Challenge,
  type ChallengeCadence,
  type ChallengeCategory,
  type ChallengeMetricType,
  type ChallengeStatus,
} from '../../domain/challenge.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { IChallengeRepository } from '../ports.js';
import { toChallengeView, type ChallengeView } from '../views.js';

export interface AdminCreateChallengeInput {
  slug: string;
  title: string;
  description: string;
  cadence: ChallengeCadence;
  category: ChallengeCategory;
  metricType: ChallengeMetricType;
  targetValue: number;
  rewardPoints: number;
  rewardBadgeId?: string | null;
  status?: ChallengeStatus;
  autoEnroll?: boolean;
  iconName?: string;
  bannerColor?: string;
  metadata?: Record<string, unknown>;
}

export class AdminCreateChallengeUseCase {
  constructor(private readonly challengeRepo: IChallengeRepository) {}

  async execute(input: AdminCreateChallengeInput): Promise<{ challenge: ChallengeView }> {
    const cleanSlug = input.slug.trim().toLowerCase();
    if (!cleanSlug) {
      throw new AppError('bad_request', 'BAD_REQUEST', 'Challenge slug is required');
    }
    if (!input.title || input.title.trim().length === 0) {
      throw new AppError('bad_request', 'BAD_REQUEST', 'Challenge title is required');
    }
    if (input.targetValue <= 0) {
      throw new AppError('bad_request', 'BAD_REQUEST', 'targetValue must be greater than 0');
    }
    if (input.rewardPoints < 0) {
      throw new AppError('bad_request', 'BAD_REQUEST', 'rewardPoints cannot be negative');
    }

    // Slug uniqueness check
    const existing = await this.challengeRepo.findBySlug(cleanSlug);
    if (existing) {
      throw new AppError('conflict', 'CONFLICT', `Challenge slug "${cleanSlug}" already exists`);
    }

    const now = new Date();
    const challenge = new Challenge({
      id: randomUUID(),
      slug: cleanSlug,
      title: input.title.trim(),
      description: input.description.trim(),
      cadence: input.cadence,
      category: input.category,
      metricType: input.metricType,
      targetValue: input.targetValue,
      rewardPoints: input.rewardPoints,
      rewardBadgeId: input.rewardBadgeId ?? null,
      status: input.status || 'published',
      autoEnroll: input.autoEnroll ?? true,
      iconName: input.iconName || 'trophy',
      bannerColor: input.bannerColor || 'teal',
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    });

    await this.challengeRepo.save(challenge);
    return { challenge: toChallengeView(challenge) };
  }
}
