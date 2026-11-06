import { GamificationProfile } from '../../domain/gamification-profile.js';
import { calculateLevel } from '../../domain/level-calculator.js';
import type {
  IGamificationProfileRepository,
  IGamificationPointsLedgerRepository,
  IUserBadgeRepository,
} from '../ports.js';
import { toGamificationProfileView, type GamificationProfileView } from '../views.js';

export interface GetGamificationSummaryInput {
  userId: string;
}

export class GetGamificationSummaryUseCase {
  constructor(
    private readonly profileRepo: IGamificationProfileRepository,
    private readonly ledgerRepo: IGamificationPointsLedgerRepository,
    private readonly userBadgeRepo: IUserBadgeRepository,
  ) {}

  async execute(input: GetGamificationSummaryInput): Promise<{ profile: GamificationProfileView }> {
    const { userId } = input;
    if (!userId) throw new Error('User ID is required');

    let profile = await this.profileRepo.findByUserId(userId);
    const now = new Date();

    if (!profile) {
      // Calculate from ledger and badges
      const [totalPoints, userBadges] = await Promise.all([
        this.ledgerRepo.getTotalPoints(userId),
        this.userBadgeRepo.listByUser(userId),
      ]);

      const levelInfo = calculateLevel(totalPoints);
      profile = new GamificationProfile({
        userId,
        totalPoints,
        currentLevel: levelInfo.level,
        badgesCount: userBadges.length,
        challengesWon: 0,
        updatedAt: now,
      });

      await this.profileRepo.save(profile);
    }

    return { profile: toGamificationProfileView(profile) };
  }
}

