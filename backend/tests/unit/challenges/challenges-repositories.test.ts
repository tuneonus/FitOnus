import { describe, expect, it, vi } from 'vitest';
import type { SqlExecutor } from '../../../src/database/transaction.js';
import { Challenge } from '../../../src/modules/challenges/domain/challenge.js';
import { ChallengeOccurrence } from '../../../src/modules/challenges/domain/challenge-occurrence.js';
import { ChallengeEnrollment } from '../../../src/modules/challenges/domain/challenge-enrollment.js';
import { UserBadge } from '../../../src/modules/challenges/domain/user-badge.js';
import { PointsLedgerEntry } from '../../../src/modules/challenges/domain/points-ledger.js';
import { PgChallengeRepository } from '../../../src/modules/challenges/infrastructure/pg-challenge-repository.js';
import { PgChallengeOccurrenceRepository } from '../../../src/modules/challenges/infrastructure/pg-occurrence-repository.js';
import { PgChallengeEnrollmentRepository } from '../../../src/modules/challenges/infrastructure/pg-enrollment-repository.js';
import { PgBadgeRepository } from '../../../src/modules/challenges/infrastructure/pg-badge-repository.js';
import { PgGamificationRepository } from '../../../src/modules/challenges/infrastructure/pg-gamification-repository.js';

describe('Challenges PostgreSQL Repositories & Concurrency Guarantees', () => {
  it('PgChallengeRepository: saves challenge with full parameters', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    const db: SqlExecutor = { query: mockQuery as unknown as SqlExecutor['query'] };
    const repo = new PgChallengeRepository(db);

    const challenge = new Challenge({
      id: 'c1111111-1111-1111-1111-111111111111',
      slug: 'daily_hydration',
      title: 'Daily Hydration Target',
      description: 'Drink 2.5L of water today',
      cadence: 'daily',
      category: 'hydration',
      metricType: 'water_liters',
      targetValue: 2.5,
      rewardPoints: 25,
      status: 'published',
      autoEnroll: true,
      iconName: 'droplet',
      bannerColor: 'sky',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await repo.save(challenge);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0]![0]).toContain('INSERT INTO challenges');
    expect(mockQuery.mock.calls[0]![1]).toContain('daily_hydration');
  });

  it('PgChallengeOccurrenceRepository: findOrCreate uses ON CONFLICT for concurrency safety', async () => {
    const start = new Date('2026-11-06T00:00:00.000Z');
    const end = new Date('2026-11-06T23:59:59.999Z');
    const row = {
      id: 'o1111111-1111-1111-1111-111111111111',
      challenge_id: 'c1111111-1111-1111-1111-111111111111',
      occurrence_key: 'daily-2026-11-06',
      period_start: start,
      period_end: end,
      status: 'active',
      created_at: start,
      updated_at: start,
    };

    const mockQuery = vi.fn().mockResolvedValue({ rows: [row] });
    const db: SqlExecutor = { query: mockQuery as unknown as SqlExecutor['query'] };
    const repo = new PgChallengeOccurrenceRepository(db);

    const occurrence = new ChallengeOccurrence({
      id: row.id,
      challengeId: row.challenge_id,
      occurrenceKey: row.occurrence_key,
      periodStart: start,
      periodEnd: end,
      status: 'active',
      createdAt: start,
      updatedAt: start,
    });

    const result = await repo.findOrCreate(occurrence);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0]![0]).toContain('ON CONFLICT (challenge_id, period_start) DO UPDATE');
    expect(result.id).toBe(row.id);
  });

  it('PgChallengeEnrollmentRepository: enroll uses ON CONFLICT (user_id, occurrence_id) for idempotent enrollment', async () => {
    const now = new Date();
    const row = {
      id: 'e1111111-1111-1111-1111-111111111111',
      user_id: 'u1111111-1111-1111-1111-111111111111',
      occurrence_id: 'o1111111-1111-1111-1111-111111111111',
      challenge_id: 'c1111111-1111-1111-1111-111111111111',
      status: 'joined',
      current_progress: 0,
      target_value: 1,
      completed_at: null,
      claimed_at: null,
      last_evaluated_at: now,
      created_at: now,
      updated_at: now,
    };

    const mockQuery = vi.fn().mockResolvedValue({ rows: [row] });
    const db: SqlExecutor = { query: mockQuery as unknown as SqlExecutor['query'] };
    const repo = new PgChallengeEnrollmentRepository(db);

    const enrollment = new ChallengeEnrollment({
      id: row.id,
      userId: row.user_id,
      occurrenceId: row.occurrence_id,
      challengeId: row.challenge_id,
      status: 'joined',
      currentProgress: 0,
      targetValue: 1,
      lastEvaluatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const res = await repo.enroll(enrollment);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0]![0]).toContain('ON CONFLICT (user_id, occurrence_id) DO UPDATE');
    expect(res.id).toBe(row.id);
  });

  it('PgBadgeRepository: awardBadge uses ON CONFLICT (user_id, badge_id) DO NOTHING', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [{ id: 'b-new' }] });
    const db: SqlExecutor = { query: mockQuery as unknown as SqlExecutor['query'] };
    const repo = new PgBadgeRepository(db);

    const userBadge = new UserBadge({
      id: 'ub-1',
      userId: 'u-1',
      badgeId: 'b-1',
      earnedAt: new Date(),
      triggerType: 'challenge',
      triggerId: 'o-1',
    });

    const awarded = await repo.awardBadge(userBadge);
    expect(awarded).toBe(true);
    expect(mockQuery.mock.calls[0]![0]).toContain('ON CONFLICT (user_id, badge_id) DO NOTHING');

    // Duplicate attempt simulation: PostgreSQL returns empty rows because of DO NOTHING
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const duplicateAward = await repo.awardBadge(userBadge);
    expect(duplicateAward).toBe(false);
  });

  it('PgGamificationRepository: recordPoints uses ON CONFLICT (user_id, source_type, source_id) DO NOTHING', async () => {
    const mockQuery = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO gamification_points_ledger')) {
        return { rows: [{ id: 'ledger-1' }] };
      }
      if (sql.includes('SELECT * FROM gamification_profiles')) {
        return {
          rows: [
            {
              user_id: 'u-1',
              total_points: 50,
              current_level: 1,
              badges_count: 0,
              challenges_won: 0,
              updated_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const db: SqlExecutor = { query: mockQuery as unknown as SqlExecutor['query'] };
    const repo = new PgGamificationRepository(db);

    const entry = new PointsLedgerEntry({
      id: 'l-1',
      userId: 'u-1',
      points: 50,
      sourceType: 'challenge',
      sourceId: 'occ-1',
      description: 'Daily challenge points',
      createdAt: new Date(),
    });

    const recorded = await repo.recordPoints(entry);
    expect(recorded).toBe(true);
    expect(mockQuery.mock.calls[0]![0]).toContain('ON CONFLICT (user_id, source_type, source_id) DO NOTHING');
  });

  describe('executeAtomicRewardClaim', () => {
    it('successfully claims reward and updates points ledger, badge, and profile level atomically', async () => {
      const mockQuery = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('UPDATE challenge_enrollments')) {
          return { rows: [{ id: 'e-1', status: 'claimed', claimed_at: new Date() }] };
        }
        if (sql.includes('INSERT INTO gamification_points_ledger')) {
          return { rows: [{ id: 'l-1' }] };
        }
        if (sql.includes('INSERT INTO user_badges')) {
          return { rows: [{ id: 'ub-1' }] };
        }
        if (sql.includes('INSERT INTO gamification_profiles')) {
          return { rows: [] };
        }
        if (sql.includes('SELECT * FROM gamification_profiles')) {
          return {
            rows: [
              {
                user_id: 'u-1',
                total_points: 150,
                current_level: 2,
                badges_count: 1,
                challenges_won: 1,
                updated_at: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      });

      const db: SqlExecutor = { query: mockQuery as unknown as SqlExecutor['query'] };
      const repo = new PgGamificationRepository(db);

      const result = await repo.executeAtomicRewardClaim({
        userId: 'u-1',
        occurrenceId: 'occ-1',
        points: 50,
        badgeId: 'badge-1',
        description: 'Completed Weekly Challenge',
      });

      expect(result.claimed).toBe(true);
      expect(result.pointsAwarded).toBe(50);
      expect(result.badgeAwarded).toBe(true);
      expect(result.newTotalPoints).toBe(150);
      expect(result.newLevel).toBe(2);
    });

    it('rejects claim if enrollment has already been claimed', async () => {
      const mockQuery = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('UPDATE challenge_enrollments')) {
          // No row updated because status != 'completed' or claimed_at IS NOT NULL
          return { rows: [] };
        }
        if (sql.includes('SELECT status, claimed_at FROM challenge_enrollments')) {
          return { rows: [{ status: 'claimed', claimed_at: new Date() }] };
        }
        return { rows: [] };
      });

      const db: SqlExecutor = { query: mockQuery as unknown as SqlExecutor['query'] };
      const repo = new PgGamificationRepository(db);

      await expect(
        repo.executeAtomicRewardClaim({
          userId: 'u-1',
          occurrenceId: 'occ-1',
          points: 50,
          description: 'Weekly Challenge',
        }),
      ).rejects.toThrow(/already been claimed/);
    });

    it('rejects claim if enrollment target was not completed yet', async () => {
      const mockQuery = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('UPDATE challenge_enrollments')) {
          return { rows: [] };
        }
        if (sql.includes('SELECT status, claimed_at FROM challenge_enrollments')) {
          return { rows: [{ status: 'in_progress', claimed_at: null }] };
        }
        return { rows: [] };
      });

      const db: SqlExecutor = { query: mockQuery as unknown as SqlExecutor['query'] };
      const repo = new PgGamificationRepository(db);

      await expect(
        repo.executeAtomicRewardClaim({
          userId: 'u-1',
          occurrenceId: 'occ-1',
          points: 50,
          description: 'Weekly Challenge',
        }),
      ).rejects.toThrow(/target not completed yet/);
    });
  });
});

