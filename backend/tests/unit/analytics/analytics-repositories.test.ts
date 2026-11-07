import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SqlExecutor } from '../../../src/database/transaction.js';
import {
  PgAnalyticsWorkoutRepository,
  PgAnalyticsNutritionRepository,
  PgAnalyticsBodyRepository,
  PgAnalyticsGoalsHabitsRepository,
} from '../../../src/modules/analytics/index.js';

describe('Analytics PostgreSQL Repositories', () => {
  let mockDb: SqlExecutor & { query: ReturnType<typeof vi.fn> };
  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    } as unknown as SqlExecutor & { query: ReturnType<typeof vi.fn> };
  });

  describe('PgAnalyticsWorkoutRepository', () => {
    let repo: PgAnalyticsWorkoutRepository;

    beforeEach(() => {
      repo = new PgAnalyticsWorkoutRepository(mockDb);
    });

    it('enforces user isolation and completed status in getCompletedSessions', async () => {
      const start = new Date('2026-10-01T00:00:00Z');
      const end = new Date('2026-10-07T23:59:59Z');

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ws-1',
            workout_name: 'Push Day',
            started_at: '2026-10-02T10:00:00Z',
            completed_at: '2026-10-02T11:00:00Z',
            duration_seconds: 3600,
            total_volume_kg: '4500.5',
            total_sets: 15,
            total_reps: 120,
            is_completed: true,
          },
        ],
        rowCount: 1,
      });

      const res = await repo.getCompletedSessions(userId, start, end);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('FROM workout_sessions');
      expect(sql).toContain('user_id = $1');
      expect(sql).toContain('is_completed = true');
      expect(sql).toContain('started_at >= $2');
      expect(sql).toContain('started_at <= $3');

      expect(params).toEqual([userId, start, end]);

      expect(res).toHaveLength(1);
      expect(res[0]!.id).toBe('ws-1');
      expect(res[0]!.workoutName).toBe('Push Day');
      expect(res[0]!.totalVolumeKg).toBe(4500.5);
      expect(res[0]!.durationSeconds).toBe(3600);
      expect(res[0]!.startedAt).toBeInstanceOf(Date);
    });

    it('retrieves exercise sets history joined with exercise name', async () => {
      const exerciseId = 'ex-bench-press';
      const start = new Date('2026-10-01T00:00:00Z');
      const end = new Date('2026-10-07T23:59:59Z');

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            set_id: 'set-1',
            session_id: 'ws-1',
            exercise_id: exerciseId,
            exercise_name: 'Barbell Bench Press',
            set_number: 1,
            weight_kg: '100',
            reps: 5,
            is_warmup: false,
            is_pr: true,
            rpe: '8.5',
            started_at: '2026-10-02T10:00:00Z',
          },
        ],
        rowCount: 1,
      });

      const res = await repo.getExerciseSetsHistory(userId, exerciseId, start, end);

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('FROM workout_session_sets wss');
      expect(sql).toContain('JOIN workout_sessions ws ON ws.id = wss.session_id');
      expect(sql).toContain('ws.user_id = $1');
      expect(sql).toContain('wss.exercise_id = $2');
      expect(params).toEqual([userId, exerciseId, start, end]);

      expect(res).toHaveLength(1);
      expect(res[0]!.exerciseName).toBe('Barbell Bench Press');
      expect(res[0]!.weightKg).toBe(100);
      expect(res[0]!.reps).toBe(5);
      expect(res[0]!.rpe).toBe(8.5);
      expect(res[0]!.isPr).toBe(true);
    });

    it('retrieves current PR or null if not found', async () => {
      const exerciseId = 'ex-bench-press';

      // Found case
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            record_type: 'max_weight',
            weight_kg: '120.0',
            reps: 1,
            volume_kg: '120.0',
            estimated_1rm_kg: '120.0',
            achieved_at: '2026-09-15T10:00:00Z',
          },
        ],
        rowCount: 1,
      });

      const pr = await repo.getExerciseCurrentPr(userId, exerciseId);
      expect(pr).not.toBeNull();
      expect(pr?.weightKg).toBe(120.0);
      expect(pr?.reps).toBe(1);
      expect(pr?.recordType).toBe('max_weight');
      expect(pr?.estimated1rmKg).toBe(120.0);

      // Not found case
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const prNull = await repo.getExerciseCurrentPr(userId, 'non-existent');
      expect(prNull).toBeNull();
    });
  });

  describe('PgAnalyticsNutritionRepository', () => {
    let repo: PgAnalyticsNutritionRepository;

    beforeEach(() => {
      repo = new PgAnalyticsNutritionRepository(mockDb);
    });

    it('aggregates daily meals and excludes soft-deleted records', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            date: '2026-10-01 00:00:00',
            total_calories: '2450.5',
            total_protein_g: '180.2',
            total_carbs_g: '220.0',
            total_fat_g: '75.3',
            total_fiber_g: '32.1',
            meal_count: 4,
          },
        ],
        rowCount: 1,
      });

      const res = await repo.getDailyMealAggregates(userId, '2026-10-01', '2026-10-07');

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('FROM meals');
      expect(sql).toContain('user_id = $1');
      expect(sql).toContain('deleted_at IS NULL');
      expect(sql).toContain('GROUP BY date');
      expect(params).toEqual([userId, '2026-10-01', '2026-10-07']);

      expect(res).toHaveLength(1);
      expect(res[0]!.date).toBe('2026-10-01');
      expect(res[0]!.totalCalories).toBe(2450.5);
      expect(res[0]!.totalProteinG).toBe(180.2);
      expect(res[0]!.mealCount).toBe(4);
    });

    it('aggregates daily water intake grouped by date', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            date: '2026-10-01',
            total_ml: 2800,
          },
        ],
        rowCount: 1,
      });

      const res = await repo.getDailyWaterAggregates(userId, '2026-10-01', '2026-10-07');

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('FROM water_intake');
      expect(sql).toContain('user_id = $1');
      expect(sql).toContain('GROUP BY date');
      expect(params).toEqual([userId, '2026-10-01', '2026-10-07']);

      expect(res).toHaveLength(1);
      expect(res[0]!.date).toBe('2026-10-01');
      expect(res[0]!.totalMl).toBe(2800);
    });
  });

  describe('PgAnalyticsBodyRepository', () => {
    let repo: PgAnalyticsBodyRepository;

    beforeEach(() => {
      repo = new PgAnalyticsBodyRepository(mockDb);
    });

    it('retrieves weight logs filtering by user and deleted_at', async () => {
      const start = new Date('2026-10-01T00:00:00Z');
      const end = new Date('2026-10-07T23:59:59Z');

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'w-1',
            weight_kg: '82.5',
            logged_at: '2026-10-01T07:00:00Z',
          },
        ],
        rowCount: 1,
      });

      const res = await repo.getWeightLogs(userId, start, end);

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('FROM weight_logs');
      expect(sql).toContain('user_id = $1');
      expect(sql).toContain('deleted_at IS NULL');
      expect(params).toEqual([userId, start, end]);

      expect(res).toHaveLength(1);
      expect(res[0]!.weightKg).toBe(82.5);
      expect(res[0]!.loggedAt).toBeInstanceOf(Date);
    });

    it('retrieves body measurements handling null metrics', async () => {
      const start = new Date('2026-10-01T00:00:00Z');
      const end = new Date('2026-10-07T23:59:59Z');

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'm-1',
            logged_at: '2026-10-01T07:30:00Z',
            waist_cm: '85.0',
            chest_cm: null,
            hip_cm: '100.5',
            arm_cm: null,
            neck_cm: null,
            body_fat_pct: '16.5',
            muscle_mass_kg: null,
          },
        ],
        rowCount: 1,
      });

      const res = await repo.getMeasurements(userId, start, end);

      expect(res).toHaveLength(1);
      expect(res[0]!.waistCm).toBe(85.0);
      expect(res[0]!.chestCm).toBeNull();
      expect(res[0]!.hipCm).toBe(100.5);
      expect(res[0]!.bodyFatPct).toBe(16.5);
      expect(res[0]!.muscleMassKg).toBeNull();
    });

    it('retrieves user profile goals or null when profile does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            primary_goal: 'lose',
            starting_weight_kg: '90.0',
            current_weight_kg: '82.5',
            target_weight_kg: '78.0',
            daily_calorie_target: 2200,
            daily_protein_grams: 175,
            workout_days_per_week: 4,
          },
        ],
        rowCount: 1,
      });

      const goals = await repo.getUserProfileGoals(userId);

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('FROM user_profiles');
      expect(sql).toContain('user_id = $1');
      expect(params).toEqual([userId]);

      expect(goals).toEqual({
        primaryGoal: 'lose',
        startingWeightKg: 90.0,
        currentWeightKg: 82.5,
        targetWeightKg: 78.0,
        dailyCalorieTarget: 2200,
        dailyProteinGrams: 175,
        workoutDaysPerWeek: 4,
      });

      // Null case
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const emptyGoals = await repo.getUserProfileGoals('other-user');
      expect(emptyGoals).toBeNull();
    });
  });

  describe('PgAnalyticsGoalsHabitsRepository', () => {
    let repo: PgAnalyticsGoalsHabitsRepository;

    beforeEach(() => {
      repo = new PgAnalyticsGoalsHabitsRepository(mockDb);
    });

    it('retrieves goals for user excluding soft-deleted records', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'g-1',
            type: 'weight',
            title: 'Drop to 78kg',
            start_value: '85.0',
            current_value: '82.0',
            target_value: '78.0',
            status: 'active',
            target_date: '2026-12-31 00:00:00',
            completed_at: null,
          },
        ],
        rowCount: 1,
      });

      const res = await repo.getGoals(userId);

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('FROM goals');
      expect(sql).toContain('user_id = $1');
      expect(sql).toContain('deleted_at IS NULL');
      expect(params).toEqual([userId]);

      expect(res).toHaveLength(1);
      expect(res[0]!.id).toBe('g-1');
      expect(res[0]!.startValue).toBe(85.0);
      expect(res[0]!.targetDate).toBe('2026-12-31');
      expect(res[0]!.completedAt).toBeNull();
    });

    it('retrieves habits with aggregated completion dates in window', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'h-1',
            title: 'Daily Run',
            category: 'fitness',
            frequency: 'daily',
            target_days_per_week: 7,
            current_streak: 5,
            longest_streak: 14,
            total_completions: 30,
            completion_dates: ['2026-10-01 00:00:00', '2026-10-02 00:00:00'],
          },
        ],
        rowCount: 1,
      });

      const res = await repo.getHabitsWithCompletions(userId, '2026-10-01', '2026-10-07');

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('FROM habits h');
      expect(sql).toContain('LEFT JOIN habit_completions hc');
      expect(sql).toContain('h.user_id = $1');
      expect(sql).toContain('hc.user_id = $1');
      expect(sql).toContain('h.is_archived = false');
      expect(sql).toContain('h.deleted_at IS NULL');
      expect(params).toEqual([userId, '2026-10-01', '2026-10-07']);

      expect(res).toHaveLength(1);
      expect(res[0]!.id).toBe('h-1');
      expect(res[0]!.completionDates).toEqual(['2026-10-01', '2026-10-02']);
    });
  });
});
