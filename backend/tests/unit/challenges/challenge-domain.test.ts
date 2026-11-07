import { describe, expect, it } from 'vitest';
import { Challenge } from '../../../src/modules/challenges/domain/challenge.js';
import { ChallengeOccurrence } from '../../../src/modules/challenges/domain/challenge-occurrence.js';
import { ChallengeEnrollment } from '../../../src/modules/challenges/domain/challenge-enrollment.js';
import { GamificationProfile } from '../../../src/modules/challenges/domain/gamification-profile.js';
import { PointsLedgerEntry } from '../../../src/modules/challenges/domain/points-ledger.js';

describe('Challenges Domain Entities & Business Rules', () => {
  describe('Challenge Entity', () => {
    it('creates a valid challenge and normalizes slug', () => {
      const challenge = new Challenge({
        id: '11111111-1111-1111-1111-111111111111',
        slug: '  DAILY_WORKOUT_LOG  ',
        title: 'Daily Workout',
        description: 'Complete and log one workout today',
        cadence: 'daily',
        category: 'workout',
        metricType: 'workout_count',
        targetValue: 1,
        rewardPoints: 50,
        status: 'published',
        autoEnroll: true,
        iconName: 'dumbbell',
        bannerColor: 'teal',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(challenge.slug).toBe('daily_workout_log');
      expect(challenge.isPublished()).toBe(true);
      expect(challenge.isRecurring()).toBe(true);
      expect(challenge.targetValue).toBe(1);
      expect(challenge.rewardPoints).toBe(50);
    });

    it('rejects invalid target values or negative points', () => {
      expect(
        () =>
          new Challenge({
            id: '11111111-1111-1111-1111-111111111111',
            slug: 'test',
            title: 'Test',
            description: 'Test',
            cadence: 'daily',
            category: 'workout',
            metricType: 'workout_count',
            targetValue: 0,
            rewardPoints: 50,
            status: 'published',
            autoEnroll: true,
            iconName: 'dumbbell',
            bannerColor: 'teal',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
      ).toThrow(/targetValue must be greater than 0/);

      expect(
        () =>
          new Challenge({
            id: '11111111-1111-1111-1111-111111111111',
            slug: 'test',
            title: 'Test',
            description: 'Test',
            cadence: 'daily',
            category: 'workout',
            metricType: 'workout_count',
            targetValue: 5,
            rewardPoints: -10,
            status: 'published',
            autoEnroll: true,
            iconName: 'dumbbell',
            bannerColor: 'teal',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
      ).toThrow(/rewardPoints cannot be negative/);
    });
  });

  describe('Challenge Occurrence Entity', () => {
    it('validates periodEnd is after periodStart', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000);

      expect(
        () =>
          new ChallengeOccurrence({
            id: '22222222-2222-2222-2222-222222222222',
            challengeId: '11111111-1111-1111-1111-111111111111',
            occurrenceKey: 'daily-2026-11-06',
            periodStart: now,
            periodEnd: past,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          }),
      ).toThrow(/periodEnd must be after periodStart/);
    });

    it('correctly determines active and claimable states', () => {
      const start = new Date('2026-11-06T00:00:00.000Z');
      const end = new Date('2026-11-06T23:59:59.999Z');

      const occurrence = new ChallengeOccurrence({
        id: '22222222-2222-2222-2222-222222222222',
        challengeId: '11111111-1111-1111-1111-111111111111',
        occurrenceKey: 'daily-2026-11-06',
        periodStart: start,
        periodEnd: end,
        status: 'active',
        createdAt: start,
        updatedAt: start,
      });

      // Active during period
      expect(occurrence.isActiveAt(new Date('2026-11-06T12:00:00.000Z'))).toBe(true);
      expect(occurrence.isActiveAt(new Date('2026-11-07T01:00:00.000Z'))).toBe(false);

      // Claimable with grace period
      expect(occurrence.isClaimableAt(new Date('2026-11-10T12:00:00.000Z'), 7)).toBe(true);
      expect(occurrence.isClaimableAt(new Date('2026-11-20T12:00:00.000Z'), 7)).toBe(false);
    });
  });

  describe('Challenge Enrollment Entity', () => {
    it('tracks progress and automatically marks completion when target is reached', () => {
      const now = new Date();
      const enrollment = new ChallengeEnrollment({
        id: '33333333-3333-3333-3333-333333333333',
        userId: '44444444-4444-4444-4444-444444444444',
        occurrenceId: '22222222-2222-2222-2222-222222222222',
        challengeId: '11111111-1111-1111-1111-111111111111',
        status: 'joined',
        currentProgress: 0,
        targetValue: 4,
        lastEvaluatedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      expect(enrollment.progressRatio).toBe(0);
      expect(enrollment.isCompleted()).toBe(false);

      // Progress update 1: partial
      enrollment.updateProgress(2);
      expect(enrollment.status).toBe('in_progress');
      expect(enrollment.currentProgress).toBe(2);
      expect(enrollment.progressRatio).toBe(0.5);
      expect(enrollment.isCompleted()).toBe(false);

      // Progress update 2: target met
      const completedTime = new Date();
      enrollment.updateProgress(4, completedTime);
      expect(enrollment.status).toBe('completed');
      expect(enrollment.currentProgress).toBe(4);
      expect(enrollment.progressRatio).toBe(1.0);
      expect(enrollment.isCompleted()).toBe(true);
      expect(enrollment.completedAt).toEqual(completedTime);
      expect(enrollment.canClaim()).toBe(true);

      // Claim reward
      const claimTime = new Date();
      enrollment.markClaimed(claimTime);
      expect(enrollment.status).toBe('claimed');
      expect(enrollment.claimedAt).toEqual(claimTime);
      expect(enrollment.isClaimed()).toBe(true);
      expect(enrollment.canClaim()).toBe(false);
    });

    it('prevents claiming if enrollment is not completed', () => {
      const now = new Date();
      const enrollment = new ChallengeEnrollment({
        id: '33333333-3333-3333-3333-333333333333',
        userId: '44444444-4444-4444-4444-444444444444',
        occurrenceId: '22222222-2222-2222-2222-222222222222',
        challengeId: '11111111-1111-1111-1111-111111111111',
        status: 'in_progress',
        currentProgress: 1,
        targetValue: 4,
        lastEvaluatedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      expect(() => enrollment.markClaimed()).toThrow(/Cannot claim enrollment in status "in_progress"/);
    });
  });

  describe('Gamification Profile & Level Progression', () => {
    it('awards points and updates level deterministically', () => {
      const profile = new GamificationProfile({
        userId: '44444444-4444-4444-4444-444444444444',
        totalPoints: 80,
        currentLevel: 1,
        badgesCount: 0,
        challengesWon: 0,
        updatedAt: new Date(),
      });

      expect(profile.currentLevel).toBe(1);

      // Award 70 points -> 150 points -> Level 2 (100–249)
      profile.awardPoints(70);
      expect(profile.totalPoints).toBe(150);
      expect(profile.currentLevel).toBe(2);
      expect(profile.getLevelInfo().title).toBe('Beginner');

      // Award 400 points -> 550 points -> Level 4 (500–999)
      profile.awardPoints(400);
      expect(profile.totalPoints).toBe(550);
      expect(profile.currentLevel).toBe(4);
      expect(profile.getLevelInfo().title).toBe('Dedicated');

      // Increment badges and challenges
      profile.incrementBadges(2);
      profile.incrementChallengesWon(1);
      expect(profile.badgesCount).toBe(2);
      expect(profile.challengesWon).toBe(1);
    });
  });

  describe('Points Ledger Entry', () => {
    it('validates points ledger invariants', () => {
      const entry = new PointsLedgerEntry({
        id: '55555555-5555-5555-5555-555555555555',
        userId: '44444444-4444-4444-4444-444444444444',
        points: 50,
        sourceType: 'challenge',
        sourceId: '22222222-2222-2222-2222-222222222222',
        description: 'Completed Daily Workout Challenge',
        createdAt: new Date(),
      });

      expect(entry.points).toBe(50);
      expect(entry.sourceType).toBe('challenge');

      expect(
        () =>
          new PointsLedgerEntry({
            id: '55555555-5555-5555-5555-555555555555',
            userId: '44444444-4444-4444-4444-444444444444',
            points: 0,
            sourceType: 'challenge',
            sourceId: '22222222-2222-2222-2222-222222222222',
            description: 'Test',
            createdAt: new Date(),
          }),
      ).toThrow(/points must be greater than 0/);
    });
  });
});
