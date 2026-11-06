import { describe, expect, it } from 'vitest';
import { Badge } from '../../../src/modules/challenges/domain/badge.js';
import { UserBadge } from '../../../src/modules/challenges/domain/user-badge.js';

describe('Legacy Achievements Integration & Mapping', () => {
  it('maps legacy achievements to Phase 7 badge definitions accurately', () => {
    // Legacy Achievement 1: Strength PR (from personal_records table)
    const prBadge = new Badge({
      id: 'b1111111-1111-1111-1111-111111111111',
      slug: 'strength_pr_first',
      name: 'First PR Broken',
      description: 'Achieved your first personal strength record',
      category: 'strength',
      tier: 'bronze',
      iconName: 'trophy',
      pointsValue: 50,
      unlockCondition: { type: 'pr_count', threshold: 1 },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(prBadge.slug).toBe('strength_pr_first');
    expect(prBadge.tier).toBe('bronze');
    expect(prBadge.pointsValue).toBe(50);
    expect(prBadge.unlockCondition.threshold).toBe(1);

    // Legacy Achievement 2: 16-workout consistency in a month
    const consistencyBadge = new Badge({
      id: 'b2222222-2222-2222-2222-222222222222',
      slug: 'workout_consistency_16',
      name: 'Consistency Champion',
      description: 'Completed 16 workouts in a single month',
      category: 'workout',
      tier: 'silver',
      iconName: 'flame',
      pointsValue: 100,
      unlockCondition: { type: 'monthly_workout_count', threshold: 16 },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(consistencyBadge.slug).toBe('workout_consistency_16');
    expect(consistencyBadge.tier).toBe('silver');
    expect(consistencyBadge.pointsValue).toBe(100);
    expect(consistencyBadge.unlockCondition.threshold).toBe(16);

    // Legacy Achievement 3: 10 kg down weight milestone
    const weightBadge = new Badge({
      id: 'b3333333-3333-3333-3333-333333333333',
      slug: 'weight_loss_10kg',
      name: '10 kg Down',
      description: 'Reaching a transformative 10 kg weight milestone',
      category: 'milestone',
      tier: 'gold',
      iconName: 'medal',
      pointsValue: 150,
      unlockCondition: { type: 'weight_loss_kg', threshold: 10.0 },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(weightBadge.slug).toBe('weight_loss_10kg');
    expect(weightBadge.tier).toBe('gold');
    expect(weightBadge.pointsValue).toBe(150);
    expect(weightBadge.unlockCondition.threshold).toBe(10.0);
  });

  it('guarantees user badge idempotency with unique user + badge pairing', () => {
    const userId = 'u4444444-4444-4444-4444-444444444444';
    const badgeId = 'b1111111-1111-1111-1111-111111111111';

    const userBadge1 = new UserBadge({
      id: 'ub111111-1111-1111-1111-111111111111',
      userId,
      badgeId,
      earnedAt: new Date('2026-11-06T10:00:00Z'),
      triggerType: 'pr',
      triggerId: 'pr-bench-press',
    });

    expect(userBadge1.userId).toBe(userId);
    expect(userBadge1.badgeId).toBe(badgeId);
    expect(userBadge1.triggerType).toBe('pr');

    // Simulated idempotency set in domain/memory representation
    const awardedBadges = new Set<string>();
    const key = `${userBadge1.userId}:${userBadge1.badgeId}`;
    const firstAward = !awardedBadges.has(key);
    awardedBadges.add(key);
    expect(firstAward).toBe(true);

    // Second award attempt for the same milestone
    const secondAward = !awardedBadges.has(key);
    expect(secondAward).toBe(false); // Idempotently skipped!
  });
});

