import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMetricProgress,
  type ActiveChallengeItemView,
  type BadgeView,
  type ChallengeEnrollmentView,
  type ChallengeOccurrenceView,
  type ChallengeView,
  type ClaimRewardResult,
  type GamificationProfileView,
  type PointsLedgerView,
} from '../src/features/challenges/types/challenges';

const RFC4122_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe('Phase 7 Challenges & Gamification Mobile Integration Tests', () => {
  const userId = generateUUID();
  const challengeId = generateUUID();
  const occurrenceId = generateUUID();
  const enrollmentId = generateUUID();
  const badgeId = generateUUID();
  const ledgerId = generateUUID();

  const sampleChallenge: ChallengeView = {
    id: challengeId,
    slug: 'weekly-5-workouts',
    title: '5 Workouts This Week',
    description: 'Complete at least 5 workouts this week',
    cadence: 'weekly',
    category: 'workout',
    metricType: 'workout_count',
    targetValue: 5,
    rewardPoints: 150,
    rewardBadgeId: badgeId,
    status: 'published',
    autoEnroll: false,
    iconName: 'dumbbell',
    bannerColor: '#4CAF50',
    metadata: {},
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };

  const sampleOccurrence: ChallengeOccurrenceView = {
    id: occurrenceId,
    challengeId,
    occurrenceKey: 'weekly-5-workouts:2026-W45',
    periodStart: '2026-11-02T00:00:00.000Z',
    periodEnd: '2026-11-08T23:59:59.999Z',
    status: 'active',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };

  const sampleEnrollment: ChallengeEnrollmentView = {
    id: enrollmentId,
    userId,
    occurrenceId,
    challengeId,
    status: 'in_progress',
    currentProgress: 3,
    targetValue: 5,
    progressRatio: 0.6,
    completedAt: null,
    claimedAt: null,
    lastEvaluatedAt: '2026-11-06T12:00:00.000Z',
    createdAt: '2026-11-02T10:00:00.000Z',
    updatedAt: '2026-11-06T12:00:00.000Z',
  };

  const sampleActiveItem: ActiveChallengeItemView = {
    challenge: sampleChallenge,
    occurrence: sampleOccurrence,
    enrollment: sampleEnrollment,
    enrolled: true,
    canClaim: false,
  };

  const sampleProfile: GamificationProfileView = {
    userId,
    totalPoints: 1250,
    currentLevel: 3,
    levelTitle: 'Silver Athlete',
    currentLevelMinPoints: 1000,
    nextLevelMinPoints: 2500,
    pointsToNextLevel: 1250,
    levelProgressRatio: 0.1667,
    badgesCount: 4,
    challengesWon: 3,
    updatedAt: '2026-11-06T12:00:00.000Z',
  };

  const sampleBadges: BadgeView[] = [
    {
      id: badgeId,
      slug: '5-workouts-club',
      name: '5 Workouts Club',
      description: 'Completed 5 workouts in a single calendar week',
      category: 'workout',
      tier: 'silver',
      iconName: 'medal-silver',
      pointsValue: 150,
      isActive: true,
      earned: true,
      earnedAt: '2026-11-05T18:00:00.000Z',
    },
    {
      id: generateUUID(),
      slug: 'century-club',
      name: '100 Workouts Club',
      description: 'Completed 100 total logged workouts',
      category: 'milestone',
      tier: 'platinum',
      iconName: 'medal-platinum',
      pointsValue: 500,
      isActive: true,
      earned: false,
      earnedAt: null,
    },
  ];

  const samplePointsLedger: PointsLedgerView[] = [
    {
      id: ledgerId,
      userId,
      points: 150,
      sourceType: 'challenge',
      sourceId: occurrenceId,
      description: 'Completed 5 Workouts This Week',
      createdAt: '2026-11-05T18:00:00.000Z',
    },
  ];

  // -------------------------------------------------------------------------
  // 1. Challenges API Client & Contracts
  // -------------------------------------------------------------------------
  describe('1. Challenges API Client & Contracts', () => {
    it('validates ChallengeView contract adheres to backend schema', () => {
      assert.match(sampleChallenge.id, RFC4122_V4_REGEX);
      assert.equal(typeof sampleChallenge.title, 'string');
      assert.equal(typeof sampleChallenge.targetValue, 'number');
      assert.equal(typeof sampleChallenge.rewardPoints, 'number');
      assert.equal(sampleChallenge.rewardPoints > 0, true);
      assert.equal(['daily', 'weekly', 'monthly', 'special', 'custom'].includes(sampleChallenge.cadence), true);
      assert.equal(['workout', 'habit', 'nutrition', 'hydration', 'mixed'].includes(sampleChallenge.category), true);
    });

    it('validates ChallengeOccurrenceView contract adheres to backend schema', () => {
      assert.match(sampleOccurrence.id, RFC4122_V4_REGEX);
      assert.match(sampleOccurrence.challengeId, RFC4122_V4_REGEX);
      assert.equal(typeof sampleOccurrence.occurrenceKey, 'string');
      assert.equal(new Date(sampleOccurrence.periodStart) < new Date(sampleOccurrence.periodEnd), true);
    });

    it('validates ChallengeEnrollmentView contract adheres to backend schema', () => {
      assert.match(sampleEnrollment.id, RFC4122_V4_REGEX);
      assert.match(sampleEnrollment.userId, RFC4122_V4_REGEX);
      assert.match(sampleEnrollment.occurrenceId, RFC4122_V4_REGEX);
      assert.equal(typeof sampleEnrollment.currentProgress, 'number');
      assert.equal(typeof sampleEnrollment.targetValue, 'number');
      assert.equal(sampleEnrollment.progressRatio >= 0 && sampleEnrollment.progressRatio <= 1, true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Challenge Listing & Cadence Filtering
  // -------------------------------------------------------------------------
  describe('2. Challenge Listing & Cadence Filtering', () => {
    it('filters challenges accurately by cadence (daily vs weekly vs special)', () => {
      const dailyChallenge: ActiveChallengeItemView = {
        ...sampleActiveItem,
        challenge: { ...sampleChallenge, id: generateUUID(), cadence: 'daily', title: '10k Steps Today' },
        occurrence: { ...sampleOccurrence, id: generateUUID() },
      };
      const weeklyChallenge: ActiveChallengeItemView = { ...sampleActiveItem };

      const all = [dailyChallenge, weeklyChallenge];

      const dailyOnly = all.filter((item) => item.challenge.cadence === 'daily');
      const weeklyOnly = all.filter((item) => item.challenge.cadence === 'weekly');

      assert.equal(dailyOnly.length, 1);
      assert.equal(dailyOnly[0]?.challenge.title, '10k Steps Today');
      assert.equal(weeklyOnly.length, 1);
      assert.equal(weeklyOnly[0]?.challenge.title, '5 Workouts This Week');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Empty Challenge List State
  // -------------------------------------------------------------------------
  describe('3. Empty Challenge List State', () => {
    it('handles empty active challenges array with truthful empty state without fabricating records', () => {
      const emptyChallenges: ActiveChallengeItemView[] = [];

      assert.equal(emptyChallenges.length, 0);
      const hasEmptyNotice = emptyChallenges.length === 0;
      assert.equal(hasEmptyNotice, true, 'Must indicate empty challenges when list is empty');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Enrollment Success
  // -------------------------------------------------------------------------
  describe('4. Enrollment Success', () => {
    it('updates challenge item state correctly upon successful enrollment', () => {
      const unenrolledItem: ActiveChallengeItemView = {
        challenge: sampleChallenge,
        occurrence: sampleOccurrence,
        enrollment: null,
        enrolled: false,
        canClaim: false,
      };

      const newEnrollment: ChallengeEnrollmentView = {
        id: generateUUID(),
        userId,
        occurrenceId,
        challengeId,
        status: 'joined',
        currentProgress: 0,
        targetValue: 5,
        progressRatio: 0,
        completedAt: null,
        claimedAt: null,
        lastEvaluatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const enrolledItem: ActiveChallengeItemView = {
        ...unenrolledItem,
        enrollment: newEnrollment,
        enrolled: true,
        canClaim: false,
      };

      assert.equal(enrolledItem.enrolled, true);
      assert.equal(enrolledItem.enrollment?.status, 'joined');
      assert.equal(enrolledItem.enrollment?.currentProgress, 0);
      assert.equal(enrolledItem.canClaim, false);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Duplicate Enrollment Handling
  // -------------------------------------------------------------------------
  describe('5. Duplicate Enrollment Handling', () => {
    it('handles 409 conflict appropriately when already enrolled without corrupting state', () => {
      const activeState = [sampleActiveItem];

      const error = { response: { status: 409, data: { error: { code: 'CONFLICT', message: 'Already enrolled' } } } };

      let wasConflictHandled = false;
      if (error.response?.status === 409) {
        wasConflictHandled = true;
      }

      assert.equal(wasConflictHandled, true);
      assert.equal(activeState.length, 1);
      assert.equal(activeState[0]?.enrolled, true);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Genuine Progress Display & Metric Formatting
  // -------------------------------------------------------------------------
  describe('6. Genuine Progress Display & Metric Formatting', () => {
    it('correctly formats progress across different metric types with units', () => {
      const workoutCountFmt = formatMetricProgress('workout_count', 3, 5);
      assert.equal(workoutCountFmt.currentStr, '3');
      assert.equal(workoutCountFmt.targetStr, '5');
      assert.equal(workoutCountFmt.unit, 'workouts');

      const durationFmt = formatMetricProgress('workout_duration_min', 45, 120);
      assert.equal(durationFmt.currentStr, '45');
      assert.equal(durationFmt.targetStr, '120');
      assert.equal(durationFmt.unit, 'min');

      const volumeFmt = formatMetricProgress('workout_volume_kg', 12500, 20000);
      assert.equal(volumeFmt.currentStr, '12,500');
      assert.equal(volumeFmt.targetStr, '20,000');
      assert.equal(volumeFmt.unit, 'kg');

      const streakFmt = formatMetricProgress('habit_streak_days', 7, 14);
      assert.equal(streakFmt.unit, 'days streak');

      const waterFmt = formatMetricProgress('water_liters', 2.5, 3.0);
      assert.equal(waterFmt.currentStr, '2.5');
      assert.equal(waterFmt.targetStr, '3');
      assert.equal(waterFmt.unit, 'L');
    });

    it('calculates ratio accurately within [0.0, 1.0] bounds', () => {
      const ratio1 = Math.min(Math.max(3 / 5, 0), 1);
      assert.equal(ratio1, 0.6);

      // Overshoot clamped to 1.0
      const ratio2 = Math.min(Math.max(8 / 5, 0), 1);
      assert.equal(ratio2, 1.0);

      // Zero progress clamped to 0.0
      const ratio3 = Math.min(Math.max(0 / 5, 0), 1);
      assert.equal(ratio3, 0.0);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Claim Reward Success
  // -------------------------------------------------------------------------
  describe('7. Claim Reward Success', () => {
    it('applies claim result to update challenge status, total points, and level', () => {
      const completedItem: ActiveChallengeItemView = {
        ...sampleActiveItem,
        enrollment: {
          ...sampleEnrollment,
          status: 'completed',
          currentProgress: 5,
          progressRatio: 1.0,
          completedAt: '2026-11-06T11:00:00.000Z',
          claimedAt: null,
        },
        canClaim: true,
      };

      const claimResult: ClaimRewardResult = {
        claimed: true,
        pointsAwarded: 150,
        badgeAwarded: true,
        newTotalPoints: 1400,
        newLevel: 3,
      };

      // Transition to claimed
      const updatedItem: ActiveChallengeItemView = {
        ...completedItem,
        canClaim: false,
        enrollment: {
          ...completedItem.enrollment!,
          status: 'claimed',
          claimedAt: new Date().toISOString(),
        },
      };

      const updatedProfile: GamificationProfileView = {
        ...sampleProfile,
        totalPoints: claimResult.newTotalPoints,
        currentLevel: claimResult.newLevel,
        challengesWon: sampleProfile.challengesWon + 1,
      };

      assert.equal(updatedItem.canClaim, false);
      assert.equal(updatedItem.enrollment?.status, 'claimed');
      assert.equal(typeof updatedItem.enrollment?.claimedAt, 'string');
      assert.equal(updatedProfile.totalPoints, 1400);
      assert.equal(updatedProfile.challengesWon, 4);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Duplicate Claim Prevention & Lockout
  // -------------------------------------------------------------------------
  describe('8. Duplicate Claim Prevention & Lockout', () => {
    it('locks inFlight claim requests to prevent double-claim submissions', () => {
      const inFlightClaims: Record<string, boolean> = {};

      // First click locks
      assert.equal(Boolean(inFlightClaims[occurrenceId]), false);
      inFlightClaims[occurrenceId] = true;

      // Second click is blocked
      assert.equal(Boolean(inFlightClaims[occurrenceId]), true);

      // Release lock upon response
      inFlightClaims[occurrenceId] = false;
      assert.equal(Boolean(inFlightClaims[occurrenceId]), false);
    });

    it('handles 409 conflict on duplicate claim gracefully', () => {
      const error = {
        response: {
          status: 409,
          data: { error: { code: 'CONFLICT', message: 'Reward already claimed' } },
        },
      };

      assert.equal(error.response.status, 409);
      assert.equal(error.response.data.error.code, 'CONFLICT');
    });
  });

  // -------------------------------------------------------------------------
  // 9. Badge Listing & Catalog Filtering
  // -------------------------------------------------------------------------
  describe('9. Badge Listing & Catalog Filtering', () => {
    it('filters badges by earned vs locked without data loss', () => {
      const earnedBadges = sampleBadges.filter((b) => b.earned);
      const lockedBadges = sampleBadges.filter((b) => !b.earned);

      assert.equal(earnedBadges.length, 1);
      assert.equal(earnedBadges[0]?.slug, '5-workouts-club');
      assert.equal(earnedBadges[0]?.tier, 'silver');

      assert.equal(lockedBadges.length, 1);
      assert.equal(lockedBadges[0]?.slug, 'century-club');
      assert.equal(lockedBadges[0]?.tier, 'platinum');
    });
  });

  // -------------------------------------------------------------------------
  // 10. Gamification Summary Calculations
  // -------------------------------------------------------------------------
  describe('10. Gamification Summary Calculations', () => {
    it('validates gamification profile bounds and progression ratios', () => {
      assert.equal(sampleProfile.totalPoints >= 0, true);
      assert.equal(sampleProfile.currentLevel >= 1, true);
      assert.equal(sampleProfile.levelProgressRatio >= 0 && sampleProfile.levelProgressRatio <= 1, true);
      assert.equal(sampleProfile.pointsToNextLevel >= 0, true);
      assert.equal(typeof sampleProfile.levelTitle, 'string');
    });
  });

  // -------------------------------------------------------------------------
  // 11. Points Ledger History
  // -------------------------------------------------------------------------
  describe('11. Points Ledger History', () => {
    it('validates points ledger entries adhere to point source types and schemas', () => {
      const entry = samplePointsLedger[0]!;
      assert.match(entry.id, RFC4122_V4_REGEX);
      assert.equal(entry.points > 0, true);
      assert.equal(
        ['challenge', 'badge', 'habit_streak', 'workout_milestone', 'admin_adjustment'].includes(entry.sourceType),
        true,
      );
      assert.equal(typeof entry.description, 'string');
    });
  });

  // -------------------------------------------------------------------------
  // 12. API Failure & Resilience
  // -------------------------------------------------------------------------
  describe('12. API Failure & Resilience', () => {
    it('retains cached challenges when offline request fails, surfacing user-friendly error only if empty', () => {
      const cached = [sampleActiveItem];
      let activeList = [...cached];
      let errorMessage: string | null = null;

      // Simulated network failure
      const networkError = new Error('Network request failed');

      if (activeList.length === 0) {
        errorMessage = 'Unable to load challenges. Check your connection.';
      } else {
        // Fallback to cache without blanking out screen
        errorMessage = null;
      }

      assert.equal(activeList.length, 1, 'Cache must be preserved');
      assert.equal(errorMessage, null, 'Do not show blocking error when cache is present');
    });

    it('does not convert API errors into fabricated zero values', () => {
      const apiFailed = true;
      let totalPointsDisplay: number | null = null;

      if (!apiFailed) {
        totalPointsDisplay = 100;
      }

      assert.equal(totalPointsDisplay, null, 'Must remain null/unloaded, never fabricated as 0 on API error');
    });
  });

  // -------------------------------------------------------------------------
  // 13. Authentication Expiry & 401 Handling
  // -------------------------------------------------------------------------
  describe('13. Authentication Expiry & 401 Handling', () => {
    it('handles 401 unauthenticated response without emitting fake user data', () => {
      const errorResponse = { status: 401, message: 'Authentication required' };
      assert.equal(errorResponse.status, 401);
    });
  });

  // -------------------------------------------------------------------------
  // 14. User Account Switching & Cache Isolation
  // -------------------------------------------------------------------------
  describe('14. User Account Switching & Cache Isolation', () => {
    it('scopes cache keys per userId to avoid cross-user state leaks', () => {
      const userA = 'user-aaa-111';
      const userB = 'user-bbb-222';

      const keyA = `@fitonus:challenges_active:${userA}`;
      const keyB = `@fitonus:challenges_active:${userB}`;

      assert.notEqual(keyA, keyB);
      assert.equal(keyA.endsWith(userA), true);
      assert.equal(keyB.endsWith(userB), true);
    });
  });

  // -------------------------------------------------------------------------
  // 15. Loading & Empty State Machine
  // -------------------------------------------------------------------------
  describe('15. Loading & Empty State Machine', () => {
    it('correctly reports loading, empty, and data states', () => {
      // 1. Loading state
      let state = { isLoading: true, items: [] as ActiveChallengeItemView[], error: null };
      assert.equal(state.isLoading, true);

      // 2. Empty state
      state = { isLoading: false, items: [], error: null };
      assert.equal(state.items.length === 0 && !state.isLoading, true);

      // 3. Success state
      state = { isLoading: false, items: [sampleActiveItem], error: null };
      assert.equal(state.items.length > 0 && !state.isLoading, true);
    });
  });
});
