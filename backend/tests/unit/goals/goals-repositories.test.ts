import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SqlExecutor } from '../../../src/database/transaction.js';
import { PgGoalRepository } from '../../../src/modules/goals/infrastructure/pg-goal-repository.js';
import { PgHabitRepository } from '../../../src/modules/goals/infrastructure/pg-habit-repository.js';
import { PgGoalsTelemetryAdapter } from '../../../src/modules/goals/infrastructure/pg-goals-telemetry-adapter.js';
import { Goal } from '../../../src/modules/goals/domain/goal.js';
import { GoalCheckpoint } from '../../../src/modules/goals/domain/goal-checkpoint.js';

describe('Goals & Habits PostgreSQL Repositories', () => {
  let mockDb: SqlExecutor & { query: ReturnType<typeof vi.fn> };
  let goalRepo: PgGoalRepository;
  let habitRepo: PgHabitRepository;
  let telemetryAdapter: PgGoalsTelemetryAdapter;

  const testUserId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    } as unknown as SqlExecutor & { query: ReturnType<typeof vi.fn> };

    goalRepo = new PgGoalRepository(mockDb);
    habitRepo = new PgHabitRepository(mockDb);
    telemetryAdapter = new PgGoalsTelemetryAdapter(mockDb);
  });

  describe('PgGoalRepository', () => {
    it('saves a goal with parameterized UPSERT query', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const goal = new Goal({
        id: '22222222-2222-4222-8222-222222222222',
        userId: testUserId,
        type: 'weightLoss',
        title: 'Reach 75 kg',
        metricUnit: 'kg',
        startValue: 84.2,
        currentValue: 78.4,
        targetValue: 75.0,
        cadence: 'once',
        direction: 'decrease',
        status: 'active',
        isPrimary: false,
        deadlineLabel: 'Ongoing',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await goalRepo.save(goal);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('INSERT INTO goals');
      expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');
      expect(params[0]).toBe(goal.id);
      expect(params[1]).toBe(testUserId);
      expect(params[6]).toBe(84.2);
    });

    it('enforces user ownership when finding by ID', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            user_id: testUserId,
            type: 'weightLoss',
            title: 'Reach 75 kg',
            metric_unit: 'kg',
            start_value: '84.2',
            current_value: '78.4',
            target_value: '75.0',
            cadence: 'once',
            direction: 'decrease',
            status: 'active',
            is_primary: true,
            deadline_label: 'Ongoing',
            target_date: null,
            completed_at: null,
            telemetry_source: 'weight_logs',
            metadata: {},
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          },
        ],
        rowCount: 1,
      });

      const found = await goalRepo.findById('22222222-2222-4222-8222-222222222222', testUserId);
      expect(found).not.toBeNull();
      expect(found?.title).toBe('Reach 75 kg');

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('user_id = $2');
      expect(params).toEqual(['22222222-2222-4222-8222-222222222222', testUserId]);
    });

    it('soft deletes a goal scoping to user', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const deleted = await goalRepo.delete('22222222-2222-4222-8222-222222222222', testUserId);
      expect(deleted).toBe(true);

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('UPDATE goals');
      expect(sql).toContain('deleted_at = NOW()');
      expect(params).toEqual(['22222222-2222-4222-8222-222222222222', testUserId]);
    });

    it('inserts and fetches checkpoints', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const checkpoint = new GoalCheckpoint({
        id: '33333333-3333-4333-8333-333333333333',
        goalId: '22222222-2222-4222-8222-222222222222',
        userId: testUserId,
        value: 78.4,
        date: '2026-11-06',
        recordedAt: new Date(),
        source: 'manual',
      });

      await goalRepo.addCheckpoint(checkpoint);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO goal_checkpoints'),
        expect.arrayContaining([checkpoint.id, checkpoint.goalId, testUserId, 78.4]),
      );
    });
  });

  describe('PgHabitRepository (Explicit Idempotent Completion)', () => {
    it('inserts completion idempotently when completed: true', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await habitRepo.setCompletion({
        id: '44444444-4444-4444-8444-444444444444',
        habitId: '55555555-5555-4555-8555-555555555555',
        userId: testUserId,
        date: '2026-11-06',
        completed: true,
      });

      expect(res).toBe(true);
      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('INSERT INTO habit_completions');
      expect(sql).toContain('ON CONFLICT (habit_id, date) DO NOTHING');
      expect(params).toEqual([
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
        testUserId,
        '2026-11-06',
        null,
      ]);
    });

    it('deletes completion idempotently when completed: false', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await habitRepo.setCompletion({
        habitId: '55555555-5555-4555-8555-555555555555',
        userId: testUserId,
        date: '2026-11-06',
        completed: false,
      });

      expect(res).toBe(true);
      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('DELETE FROM habit_completions');
      expect(sql).toContain('WHERE habit_id = $1 AND user_id = $2 AND date = $3');
      expect(params).toEqual(['55555555-5555-4555-8555-555555555555', testUserId, '2026-11-06']);
    });

    it('updates habit streaks in database', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await habitRepo.updateStreaks('55555555-5555-4555-8555-555555555555', testUserId, {
        currentStreak: 7,
        longestStreak: 14,
        totalCompletions: 42,
      });

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('UPDATE habits');
      expect(sql).toContain('current_streak = $1');
      expect(params).toEqual([7, 14, 42, '55555555-5555-4555-8555-555555555555', testUserId]);
    });
  });

  describe('PgGoalsTelemetryAdapter', () => {
    it('fetches latest weight from weight_logs if available', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ weight_kg: '78.20' }],
        rowCount: 1,
      });

      const weight = await telemetryAdapter.getLatestWeight(testUserId);
      expect(weight).toBe(78.2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM weight_logs'),
        [testUserId],
      );
    });

    it('falls back to user_profiles if no weight logs exist', async () => {
      // First query to weight_logs returns empty
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Second query to user_profiles returns profile weight
      mockDb.query.mockResolvedValueOnce({
        rows: [{ current_weight_kg: '79.5' }],
        rowCount: 1,
      });

      const weight = await telemetryAdapter.getLatestWeight(testUserId);
      expect(weight).toBe(79.5);
    });

    it('aggregates daily water intake in liters correctly', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ total_ml: 2750 }],
        rowCount: 1,
      });

      const liters = await telemetryAdapter.getDailyWaterIntakeLiters(testUserId, '2026-11-06');
      expect(liters).toBe(2.75);
    });

    it('aggregates daily calories and protein correctly', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ calories: '2150.40', protein_g: '148.60' }],
        rowCount: 1,
      });

      const nutrition = await telemetryAdapter.getDailyNutrition(testUserId, '2026-11-06');
      expect(nutrition).toEqual({ calories: 2150, proteinG: 149 });
    });

    it('counts completed workouts in weekly range', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ count: 4 }],
        rowCount: 1,
      });

      const count = await telemetryAdapter.getWeeklyWorkoutCount(
        testUserId,
        new Date('2026-11-02'),
        new Date('2026-11-08'),
      );
      expect(count).toBe(4);
    });
  });
});
