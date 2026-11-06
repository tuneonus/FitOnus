import type { IBadgeRepository, IUserBadgeRepository } from '../ports.js';
import { toBadgeView, type BadgeView } from '../views.js';

export interface ListUserBadgesInput {
  userId: string;
}

export class ListUserBadgesUseCase {
  constructor(
    private readonly badgeRepo: IBadgeRepository,
    private readonly userBadgeRepo: IUserBadgeRepository,
  ) {}

  async execute(input: ListUserBadgesInput): Promise<{ badges: BadgeView[] }> {
    const { userId } = input;
    if (!userId) throw new Error('User ID is required');

    const [allBadges, userBadges] = await Promise.all([
      this.badgeRepo.listActive(),
      this.userBadgeRepo.listByUser(userId),
    ]);

    const earnedMap = new Map<string, Date>();
    for (const ub of userBadges) {
      earnedMap.set(ub.badgeId, ub.earnedAt);
    }

    const views = allBadges.map((badge) => {
      const earnedAt = earnedMap.get(badge.id) ?? null;
      return toBadgeView(badge, earnedAt !== null, earnedAt);
    });

    return { badges: views };
  }
}

