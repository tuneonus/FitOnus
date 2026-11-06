import { randomUUID } from 'node:crypto';
import { UserBadge } from '../../domain/user-badge.js';
import { PointsLedgerEntry } from '../../domain/points-ledger.js';
import type {
  IBadgeRepository,
  IUserBadgeRepository,
  IGamificationPointsLedgerRepository,
  IGamificationProfileRepository,
  IGamificationTelemetryPort,
} from '../ports.js';
import { toBadgeView, type BadgeView } from '../views.js';

export interface EvaluateMilestonesInput {
  userId: string;
}

export interface EvaluateMilestonesResult {
  newlyUnlockedBadges: BadgeView[];
  totalBadgesCount: number;
}

export class EvaluateMilestonesAndBadgesUseCase {
  constructor(
    private readonly badgeRepo: IBadgeRepository,
    private readonly userBadgeRepo: IUserBadgeRepository,
    private readonly ledgerRepo: IGamificationPointsLedgerRepository,
    private readonly profileRepo: IGamificationProfileRepository,
    private readonly telemetryPort: IGamificationTelemetryPort,
  ) {}

  async execute(input: EvaluateMilestonesInput): Promise<EvaluateMilestonesResult> {
    const { userId } = input;
    if (!userId) throw new Error('User ID is required');

    const [activeBadges, earnedBadges] = await Promise.all([
      this.badgeRepo.listActive(),
      this.userBadgeRepo.listByUser(userId),
    ]);

    const ownedBadgeIds = new Set(earnedBadges.map((b) => b.badgeId));
    const newlyUnlocked: BadgeView[] = [];
    const now = new Date();

    for (const badge of activeBadges) {
      if (ownedBadgeIds.has(badge.id)) {
        continue;
      }

      const isSatisfied = await this.checkCriteria(userId, badge.slug);
      if (isSatisfied) {
        const userBadge = new UserBadge({
          id: randomUUID(),
          userId,
          badgeId: badge.id,
          earnedAt: now,
          triggerType: 'milestone',
          triggerId: badge.slug,
        });

        const awarded = await this.userBadgeRepo.awardBadge(userBadge);
        if (awarded) {
          // Award badge points to ledger (idempotent ON CONFLICT)
          if (badge.pointsValue > 0) {
            await this.ledgerRepo.recordPoints(
              new PointsLedgerEntry({
                id: randomUUID(),
                userId,
                points: badge.pointsValue,
                sourceType: 'badge',
                sourceId: badge.id,
                description: `Unlocked badge: ${badge.name}`,
                createdAt: now,
              }),
            );
          }

          // Update profile badges count
          const profile = await this.profileRepo.findByUserId(userId);
          if (profile) {
            profile.incrementBadges(1, now);
            await this.profileRepo.save(profile);
          }

          ownedBadgeIds.add(badge.id);
          newlyUnlocked.push(toBadgeView(badge, true, now));
        }
      }
    }

    return {
      newlyUnlockedBadges: newlyUnlocked,
      totalBadgesCount: ownedBadgeIds.size,
    };
  }

  private async checkCriteria(userId: string, badgeSlug: string): Promise<boolean> {
    const now = new Date();

    switch (badgeSlug) {
      case 'strength_pr_first': {
        const prCount = await this.telemetryPort.getPersonalRecordsCount(userId);
        return prCount >= 1;
      }

      case 'workout_consistency_16': {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const count = await this.telemetryPort.getWorkoutCount(userId, thirtyDaysAgo, now);
        return count >= 16;
      }

      case 'weight_loss_10kg': {
        const lostKg = await this.telemetryPort.getWeightLossKg(userId);
        return lostKg >= 10.0;
      }

      case 'habit_streak_7': {
        const streak = await this.telemetryPort.getMaxHabitStreak(userId);
        return streak >= 7;
      }

      case 'habit_streak_30': {
        const streak = await this.telemetryPort.getMaxHabitStreak(userId);
        return streak >= 30;
      }

      case 'workout_century_100': {
        const total = await this.telemetryPort.getTotalWorkoutCount(userId);
        return total >= 100;
      }

      case 'hydration_hero': {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const waterLiters = await this.telemetryPort.getWaterLiters(userId, sevenDaysAgo, now);
        // Average 2.0L+ daily across 7 days
        return waterLiters >= 14.0;
      }

      default:
        return false;
    }
  }
}

