import { describe, expect, it, vi } from 'vitest';
import { WeightLog } from '../../../src/modules/progress/domain/weight-log.js';
import { BodyMeasurement } from '../../../src/modules/progress/domain/body-measurement.js';
import { LogWeightUseCase } from '../../../src/modules/progress/application/use-cases/log-weight.js';
import { GetWeightHistoryUseCase } from '../../../src/modules/progress/application/use-cases/get-weight-history.js';
import { DeleteWeightLogUseCase } from '../../../src/modules/progress/application/use-cases/delete-weight-log.js';
import { LogMeasurementUseCase } from '../../../src/modules/progress/application/use-cases/log-measurement.js';
import { GetMeasurementsUseCase } from '../../../src/modules/progress/application/use-cases/get-measurements.js';
import { DeleteMeasurementUseCase } from '../../../src/modules/progress/application/use-cases/delete-measurement.js';
import { GetProgressAnalyticsUseCase } from '../../../src/modules/progress/application/use-cases/get-progress-analytics.js';
import { getTimeRangeBuckets } from '../../../src/modules/progress/domain/calendar-bounds.js';
import { GetPeriodComparisonUseCase } from '../../../src/modules/progress/application/use-cases/get-period-comparison.js';
import { GetAchievementsUseCase } from '../../../src/modules/progress/application/use-cases/get-achievements.js';
import { GetProgressReportsUseCase } from '../../../src/modules/progress/application/use-cases/get-progress-reports.js';
import type {
  IBodyMeasurementRepository,
  IProgressTelemetryPort,
  IWeightRepository,
  UserWeightSummary,
} from '../../../src/modules/progress/application/ports.js';

describe('Progress Application Use Cases', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  function createMockWeightRepo(): IWeightRepository {
    return {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
      findByClientId: vi.fn(),
      listForUser: vi.fn().mockResolvedValue({ logs: [], total: 0 }),
      getLatestForUser: vi.fn().mockResolvedValue(null),
      getEarliestForUser: vi.fn().mockResolvedValue(null),
      getUserWeightSummary: vi.fn().mockResolvedValue({
        currentWeightKg: 80.0,
        startingWeightKg: 85.0,
        targetWeightKg: 75.0,
        latestLoggedAt: new Date(),
        totalLogsCount: 1,
      } satisfies UserWeightSummary),
      softDelete: vi.fn().mockResolvedValue(true),
      hardDelete: vi.fn().mockResolvedValue(true),
    };
  }

  function createMockMeasRepo(): IBodyMeasurementRepository {
    return {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
      findByClientId: vi.fn(),
      listForUser: vi.fn().mockResolvedValue({ measurements: [], total: 0 }),
      getLatestForUser: vi.fn().mockResolvedValue(null),
      softDelete: vi.fn().mockResolvedValue(true),
    };
  }

  function createMockTelemetryPort(): IProgressTelemetryPort {
    return {
      getProfileGoals: vi.fn().mockResolvedValue({
        primaryGoal: 'lose',
        targetWeightKg: 75.0,
        startingWeightKg: 85.0,
        currentWeightKg: 80.0,
        dailyCalorieTarget: 2200,
        dailyProteinGrams: 150,
        workoutDaysPerWeek: 5,
      }),
      getWorkoutSessions: vi.fn().mockResolvedValue([]),
      getNutritionAggregates: vi.fn().mockResolvedValue([]),
      getWaterTotals: vi.fn().mockResolvedValue([]),
      getPersonalRecords: vi.fn().mockResolvedValue([]),
    };
  }

  describe('Weight Use Cases', () => {
    it('LogWeightUseCase saves weight and calculates change from start and previous', async () => {
      const weightRepo = createMockWeightRepo();
      const mockSaved = new WeightLog({
        id: 'w1',
        userId,
        weightKg: 79.5,
        loggedAt: new Date(),
        source: 'manual',
      });
      vi.mocked(weightRepo.save).mockResolvedValueOnce({ log: mockSaved, isNew: true });
      vi.mocked(weightRepo.getUserWeightSummary).mockResolvedValueOnce({
        currentWeightKg: 79.5,
        startingWeightKg: 85.0,
        targetWeightKg: 75.0,
        latestLoggedAt: new Date(),
        totalLogsCount: 2,
      });
      vi.mocked(weightRepo.listForUser).mockResolvedValueOnce({
        logs: [mockSaved, new WeightLog({ id: 'w0', userId, weightKg: 80.0, loggedAt: new Date() })],
        total: 2,
      });

      const useCase = new LogWeightUseCase(weightRepo);
      const res = await useCase.execute({
        userId,
        weightKg: 79.5,
        notes: 'Morning weigh-in',
      });

      expect(res.isNew).toBe(true);
      expect(res.currentWeight).toBe(79.5);
      expect(res.startingWeight).toBe(85.0);
      expect(res.changeFromStart).toBe(-5.5); // 79.5 - 85.0
      expect(res.changeFromPrevious).toBe(-0.5); // 79.5 - 80.0
    });

    it('GetWeightHistoryUseCase computes EMA smoothed points across requested range', async () => {
      const weightRepo = createMockWeightRepo();
      vi.mocked(weightRepo.getUserWeightSummary).mockResolvedValueOnce({
        currentWeightKg: 78.4,
        startingWeightKg: 84.0,
        targetWeightKg: 75.0,
        latestLoggedAt: new Date(),
        totalLogsCount: 3,
      });
      vi.mocked(weightRepo.listForUser)
        .mockResolvedValueOnce({
          logs: [new WeightLog({ id: 'w1', userId, weightKg: 78.4, loggedAt: new Date() })],
          total: 1,
        })
        .mockResolvedValueOnce({
          logs: [new WeightLog({ id: 'w1', userId, weightKg: 78.4, loggedAt: new Date() })],
          total: 1,
        });

      const useCase = new GetWeightHistoryUseCase(weightRepo);
      const res = await useCase.execute({ userId, range: 'D', timezone: 'UTC' });

      expect(res.summary.currentWeightKg).toBe(78.4);
      // The only weigh-in is today's, so the chart starts today instead of back-filling the six days before it.
      expect(res.points.length).toBe(1);
      expect(res.points[0]?.value).toBe(78.4);
      expect(res.entries.length).toBe(1);
    });

    it('DeleteWeightLogUseCase soft-deletes a weight entry', async () => {
      const weightRepo = createMockWeightRepo();
      const useCase = new DeleteWeightLogUseCase(weightRepo);

      const res = await useCase.execute({ id: 'w1', userId });
      expect(res.deleted).toBe(true);
      expect(weightRepo.softDelete).toHaveBeenCalledWith('w1', userId);
    });
  });

  describe('Measurement Use Cases', () => {
    it('LogMeasurementUseCase calculates diffs against previous measurement', async () => {
      const measRepo = createMockMeasRepo();
      const prevMeas = new BodyMeasurement({
        id: 'm0',
        userId,
        loggedAt: new Date('2026-09-01T08:00:00Z'),
        waistCm: 85.0,
        chestCm: 102.0,
        bodyFatPct: 17.0,
      });
      vi.mocked(measRepo.getLatestForUser).mockResolvedValueOnce(prevMeas);

      const newMeas = new BodyMeasurement({
        id: 'm1',
        userId,
        loggedAt: new Date('2026-10-01T08:00:00Z'),
        waistCm: 83.5,
        chestCm: 103.0,
        bodyFatPct: 16.0,
      });
      vi.mocked(measRepo.save).mockResolvedValueOnce({ measurement: newMeas, isNew: true });

      const useCase = new LogMeasurementUseCase(measRepo);
      const res = await useCase.execute({
        userId,
        waistCm: 83.5,
        chestCm: 103.0,
        bodyFatPct: 16.0,
      });

      expect(res.diffs.waist).toBe(-1.5); // 83.5 - 85.0
      expect(res.diffs.chest).toBe(1.0); // 103.0 - 102.0
      expect(res.diffs.bodyFat).toBe(-1.0); // 16.0 - 17.0
    });

    it('GetMeasurementsUseCase returns latest snapshot, diffs, and history table', async () => {
      const measRepo = createMockMeasRepo();
      const m1 = new BodyMeasurement({
        id: 'm1',
        userId,
        loggedAt: new Date('2026-10-05T08:00:00Z'),
        waistCm: 82.0,
      });
      const m0 = new BodyMeasurement({
        id: 'm0',
        userId,
        loggedAt: new Date('2026-09-05T08:00:00Z'),
        waistCm: 84.0,
      });
      vi.mocked(measRepo.listForUser).mockResolvedValueOnce({ measurements: [m1, m0], total: 2 });

      const useCase = new GetMeasurementsUseCase(measRepo);
      const res = await useCase.execute({ userId });

      expect(res.latest?.waist).toBe(82.0);
      expect(res.diffs.waist).toBe(-2.0);
      expect(res.history.length).toBe(2);
    });

    it('DeleteMeasurementUseCase soft-deletes a measurement', async () => {
      const measRepo = createMockMeasRepo();
      const useCase = new DeleteMeasurementUseCase(measRepo);
      const res = await useCase.execute({ id: 'm1', userId });

      expect(res.deleted).toBe(true);
      expect(measRepo.softDelete).toHaveBeenCalledWith('m1', userId);
    });
  });

  describe('Analytics & Comparisons', () => {
    it('returns empty series and hasDeviceData: false for unsupported wearable metrics', async () => {
      const weightRepo = createMockWeightRepo();
      const telemetryPort = createMockTelemetryPort();
      const useCase = new GetProgressAnalyticsUseCase(weightRepo, telemetryPort);

      const sleepRes = await useCase.execute({ userId, metric: 'sleep' });
      expect(sleepRes.hasDeviceData).toBe(false);
      expect(sleepRes.points).toEqual([]);

      const stepsRes = await useCase.execute({ userId, metric: 'steps' });
      expect(stepsRes.hasDeviceData).toBe(false);
      expect(stepsRes.points).toEqual([]);
    });

    it('averages nutrition calories/protein strictly across logged days (never faking zeros)', async () => {
      const weightRepo = createMockWeightRepo();
      const telemetryPort = createMockTelemetryPort();
      const todayStr = new Date().toISOString().slice(0, 10);
      vi.mocked(telemetryPort.getNutritionAggregates).mockResolvedValueOnce([
        { date: todayStr, totalCalories: 2200, totalProteinG: 140, mealCount: 3 },
      ]);

      const useCase = new GetProgressAnalyticsUseCase(weightRepo, telemetryPort);
      const res = await useCase.execute({ userId, metric: 'calories', range: 'D', timezone: 'UTC' });

      expect(res.hasDeviceData).toBe(true);
      expect(res.unit).toBe('kcal');
      // Points where meals exist should have true average, not pulled down by zero
      const loggedDayPoint = res.points.find((p) => p.value > 0);
      expect(loggedDayPoint).toBeDefined();
      expect(loggedDayPoint?.value).toBe(2200);
    });

    it('evaluates period comparison with goal-aware weight direction', async () => {
      const weightRepo = createMockWeightRepo();
      const telemetryPort = createMockTelemetryPort();

      // Current period lost 1.5 kg, previous period gained 0.5 kg
      vi.mocked(weightRepo.listForUser)
        .mockResolvedValueOnce({
          logs: [
            new WeightLog({ id: 'w2', userId, weightKg: 78.5, loggedAt: new Date() }),
            new WeightLog({ id: 'w1', userId, weightKg: 80.0, loggedAt: new Date() }),
          ],
          total: 2,
        })
        .mockResolvedValueOnce({
          logs: [
            new WeightLog({ id: 'w1', userId, weightKg: 80.0, loggedAt: new Date() }),
            new WeightLog({ id: 'w0', userId, weightKg: 79.5, loggedAt: new Date() }),
          ],
          total: 2,
        });

      // User goal is 'lose' -> weight loss is better (better: true)
      const useCase = new GetPeriodComparisonUseCase(weightRepo, telemetryPort);
      const res = await useCase.execute({ userId, period: 'month' });

      const weightComp = res.comparisons.find((c) => c.label === 'Weight change');
      expect(weightComp?.current).toBe('−1.5 kg');
      expect(weightComp?.better).toBe(true);

      // Now test with goal 'gain' -> weight loss should be better: false
      vi.mocked(telemetryPort.getProfileGoals).mockResolvedValueOnce({
        primaryGoal: 'gain',
        targetWeightKg: 85.0,
        startingWeightKg: 75.0,
        currentWeightKg: 78.5,
        dailyCalorieTarget: 3000,
        dailyProteinGrams: 180,
        workoutDaysPerWeek: 5,
      });

      vi.mocked(weightRepo.listForUser)
        .mockResolvedValueOnce({
          logs: [
            new WeightLog({ id: 'w2', userId, weightKg: 78.5, loggedAt: new Date() }),
            new WeightLog({ id: 'w1', userId, weightKg: 80.0, loggedAt: new Date() }),
          ],
          total: 2,
        })
        .mockResolvedValueOnce({
          logs: [],
          total: 0,
        });

      const gainRes = await useCase.execute({ userId, period: 'month' });
      const gainWeightComp = gainRes.comparisons.find((c) => c.label === 'Weight change');
      expect(gainWeightComp?.better).toBe(false); // Lost weight while on a muscle gain goal!
    });
  });

  describe('Achievements and Reports', () => {
    it('evaluates real achievements from personal_records and workout_sessions', async () => {
      const weightRepo = createMockWeightRepo();
      const telemetryPort = createMockTelemetryPort();

      vi.mocked(telemetryPort.getPersonalRecords).mockResolvedValueOnce([
        {
          id: 'pr-1',
          exerciseName: 'Barbell Bench Press',
          recordType: 'max_weight',
          weightKg: 85.0,
          reps: 5,
          volumeKg: 425.0,
          estimated1rmKg: 95.0,
          achievedAt: new Date(),
        },
      ]);

      vi.mocked(weightRepo.getUserWeightSummary).mockResolvedValueOnce({
        currentWeightKg: 79.2,
        startingWeightKg: 85.0,
        targetWeightKg: 75.0,
        latestLoggedAt: new Date(),
        totalLogsCount: 10,
      });

      const useCase = new GetAchievementsUseCase(weightRepo, telemetryPort);
      const res = await useCase.execute({ userId });

      expect(res.achievements.length).toBeGreaterThanOrEqual(2);
      expect(res.achievements[0]?.title).toBe('Barbell Bench Press PR');
      expect(res.achievements[0]?.earned).toBe(true);
      expect(res.achievements[res.achievements.length - 1]?.title).toBe('10 kg down');
      expect(res.achievements[res.achievements.length - 1]?.detail).toContain('5.8 of 10 kg');
    });

    it('generates deterministic progress report without any paid AI calls', async () => {
      const weightRepo = createMockWeightRepo();
      const telemetryPort = createMockTelemetryPort();

      vi.mocked(telemetryPort.getWorkoutSessions).mockResolvedValueOnce([
        {
          id: 's1',
          name: 'Push Day',
          startedAt: new Date(),
          completedAt: new Date(),
          durationSeconds: 3600,
          totalVolumeKg: 5000,
          isCompleted: true,
        },
        {
          id: 's2',
          name: 'Pull Day',
          startedAt: new Date(),
          completedAt: new Date(),
          durationSeconds: 3600,
          totalVolumeKg: 6000,
          isCompleted: true,
        },
      ]);

      vi.mocked(telemetryPort.getNutritionAggregates).mockResolvedValueOnce([
        { date: '2026-10-01', totalCalories: 2200, totalProteinG: 120, mealCount: 3 },
      ]);

      const useCase = new GetProgressReportsUseCase(weightRepo, telemetryPort);
      const report = await useCase.execute({ userId, type: 'weekly', timezone: 'UTC' });

      expect(report.period).toBeTruthy();
      expect(report.stats.length).toBe(4);
      expect(report.improvements.length).toBeGreaterThan(0);
      expect(report.nextGoals.length).toBeGreaterThan(0);
    });
  });

  /** Makes `listForUser` behave like the real repository: inclusive date filter, newest first, capped by limit. */
  function mockWeighIns(weightRepo: IWeightRepository, logs: WeightLog[]) {
    vi.mocked(weightRepo.listForUser).mockImplementation(async (_userId, filter) => {
      const matching = logs
        .filter((l) => !filter?.startDate || l.loggedAt >= filter.startDate)
        .filter((l) => !filter?.endDate || l.loggedAt <= filter.endDate)
        .sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime());
      return { logs: matching.slice(0, filter?.limit ?? 50), total: matching.length };
    });
  }
  const weighIn = (id: string, weightKg: number, loggedAt: Date) =>
    new WeightLog({ id, userId, weightKg, loggedAt });
  const midpointOf = (bucket: { startDate: Date; endDate: Date }) =>
    new Date((bucket.startDate.getTime() + bucket.endDate.getTime()) / 2);

  describe('Real weight data only (no fabricated chart points)', () => {
    it('history: a new user with no weigh-ins gets no points, even though the profile has a weight', async () => {
      // The default stub's profile summary says current 80 kg / starting 85 kg, but nothing was ever logged.
      const weightRepo = createMockWeightRepo();

      const res = await new GetWeightHistoryUseCase(weightRepo).execute({
        userId,
        range: 'W',
        timezone: 'UTC',
      });

      expect(res.points).toEqual([]);
      expect(res.entries).toEqual([]);
      expect(res.total).toBe(0);
      expect(res.summary.startingWeightKg).toBe(85);
    });

    it('history: smooths real weigh-ins and starts at the first one', async () => {
      const weightRepo = createMockWeightRepo();
      const days = getTimeRangeBuckets('D', new Date(), 'UTC');
      mockWeighIns(weightRepo, [
        weighIn('w1', 80, midpointOf(days[2]!)),
        weighIn('w2', 79, midpointOf(days[4]!)),
        weighIn('w3', 78, midpointOf(days[6]!)),
      ]);

      const res = await new GetWeightHistoryUseCase(weightRepo).execute({
        userId,
        range: 'D',
        timezone: 'UTC',
      });

      expect(res.points.map((p) => p.label)).toEqual(days.slice(2).map((d) => d.label));
      expect(res.points.map((p) => p.value)).toEqual([80, 80, 79.9, 79.8, 79.6]);
      expect(res.entries.map((e) => e.value)).toEqual([78, 79, 80]);
      expect(res.total).toBe(3);
    });

    it('history: carries the last weigh-in from before the range into the days that precede the first in-range one', async () => {
      const weightRepo = createMockWeightRepo();
      const days = getTimeRangeBuckets('D', new Date(), 'UTC');
      mockWeighIns(weightRepo, [
        weighIn('old', 82, new Date(days[0]!.startDate.getTime() - 30 * 24 * 60 * 60 * 1000)),
        weighIn('new', 79, midpointOf(days[5]!)),
      ]);

      const res = await new GetWeightHistoryUseCase(weightRepo).execute({
        userId,
        range: 'D',
        timezone: 'UTC',
      });

      expect(res.points).toHaveLength(7);
      expect(res.points[0]?.value).toBe(82);
      expect(res.points[6]?.value).toBe(81.4);
    });

    it('analytics: a new user gets an empty weight series and zeroed values, with the goal weight kept', async () => {
      const weightRepo = createMockWeightRepo();
      const telemetryPort = createMockTelemetryPort();

      const res = await new GetProgressAnalyticsUseCase(weightRepo, telemetryPort).execute({
        userId,
        metric: 'weight',
        range: 'W',
        timezone: 'UTC',
      });

      expect(res.points).toEqual([]);
      expect(res.firstValue).toBe(0);
      expect(res.latestValue).toBe(0);
      expect(res.delta).toBe(0);
      expect(res.goal).toBe(75);
    });

    it('analytics: real weigh-ins produce the smoothed series and the change over it', async () => {
      const weightRepo = createMockWeightRepo();
      const telemetryPort = createMockTelemetryPort();
      const days = getTimeRangeBuckets('D', new Date(), 'UTC');
      mockWeighIns(weightRepo, [
        weighIn('w1', 80, midpointOf(days[2]!)),
        weighIn('w2', 79, midpointOf(days[4]!)),
        weighIn('w3', 78, midpointOf(days[6]!)),
      ]);

      const res = await new GetProgressAnalyticsUseCase(weightRepo, telemetryPort).execute({
        userId,
        metric: 'weight',
        range: 'D',
        timezone: 'UTC',
      });

      expect(res.points.map((p) => p.value)).toEqual([80, 80, 79.9, 79.8, 79.6]);
      expect(res.firstValue).toBe(80);
      expect(res.latestValue).toBe(79.6);
      expect(res.delta).toBe(-0.4);
      expect(res.lowerIsBetter).toBe(true);
    });
  });

  describe('Progress report goals', () => {
    const completedSession = (id: string) => ({
      id,
      name: `Session ${id}`,
      startedAt: new Date(),
      completedAt: new Date(),
      durationSeconds: 3600,
      totalVolumeKg: 5000,
      isCompleted: true,
    });
    const noGoals = {
      primaryGoal: null,
      targetWeightKg: null,
      startingWeightKg: null,
      currentWeightKg: null,
      dailyCalorieTarget: null,
      dailyProteinGrams: null,
      workoutDaysPerWeek: null,
    };
    const statOf = (report: { stats: { label: string }[] }, label: string) =>
      report.stats.find((s) => s.label === label) as
        { label: string; value: string; unit: string; note?: string; good?: boolean } | undefined;

    it('a user with no goals and no activity gets no invented targets, advice or praise', async () => {
      const telemetryPort = createMockTelemetryPort();
      vi.mocked(telemetryPort.getProfileGoals).mockResolvedValueOnce(null);

      const report = await new GetProgressReportsUseCase(createMockWeightRepo(), telemetryPort).execute({
        userId,
        type: 'weekly',
        timezone: 'UTC',
      });

      expect(report.headline).toBe('No workouts logged this period');
      expect(report.nextGoals).toEqual([]);
      expect(report.improvements).toEqual([]);
      expect(report.achievements).toEqual([]);
      expect(statOf(report, 'Workouts')).toMatchObject({ value: '0', unit: '' });
      expect(statOf(report, 'Workouts')?.good).toBeUndefined();
      expect(statOf(report, 'Avg protein')?.note).toBeUndefined();
      expect(statOf(report, 'Avg protein')?.good).toBeUndefined();
      expect(JSON.stringify(report)).not.toMatch(/150|140|planned/);
    });

    it('a user with no goals still gets an honest summary of what they logged', async () => {
      const telemetryPort = createMockTelemetryPort();
      vi.mocked(telemetryPort.getProfileGoals).mockResolvedValueOnce(noGoals);
      vi.mocked(telemetryPort.getWorkoutSessions).mockResolvedValueOnce([
        completedSession('a'),
        completedSession('b'),
        completedSession('c'),
      ]);
      vi.mocked(telemetryPort.getNutritionAggregates).mockResolvedValueOnce([
        { date: '2026-10-01', totalCalories: 2100, totalProteinG: 120, mealCount: 3 },
      ]);

      const report = await new GetProgressReportsUseCase(createMockWeightRepo(), telemetryPort).execute({
        userId,
        type: 'weekly',
        timezone: 'UTC',
      });

      expect(report.headline).toBe('Logged 3 workouts this period');
      expect(report.improvements).toEqual([]);
      expect(report.nextGoals).toEqual([]);
      expect(statOf(report, 'Avg protein')).toMatchObject({ value: '120', unit: 'g' });
    });

    it('a user with configured goals is measured against them', async () => {
      const telemetryPort = createMockTelemetryPort(); // goals: 5 workouts/week, 150 g protein, 75 kg target
      vi.mocked(telemetryPort.getWorkoutSessions).mockResolvedValueOnce([
        completedSession('a'),
        completedSession('b'),
      ]);
      vi.mocked(telemetryPort.getNutritionAggregates).mockResolvedValueOnce([
        { date: '2026-10-01', totalCalories: 2200, totalProteinG: 120, mealCount: 3 },
      ]);

      const report = await new GetProgressReportsUseCase(createMockWeightRepo(), telemetryPort).execute({
        userId,
        type: 'weekly',
        timezone: 'UTC',
      });

      expect(report.headline).toBe('Completed 2 workouts, let’s aim for 5 next period');
      expect(report.improvements).toEqual([
        'Protein hit target on only 0 of 1 logged days. Add a post-workout protein source (+25 g).',
        'Missed 3 planned workout session(s) — schedule make-up slots.',
      ]);
      expect(report.nextGoals).toEqual([
        'Hit 150 g protein on 4+ days',
        'Complete 5 workouts',
        'Progress toward 75 kg goal weight',
      ]);
      expect(statOf(report, 'Workouts')).toMatchObject({ value: '2', unit: '/5', good: false });
      expect(statOf(report, 'Avg protein')).toMatchObject({ note: 'Goal 150', good: false });
    });

    it('a user who met their configured goals is told so', async () => {
      const telemetryPort = createMockTelemetryPort();
      vi.mocked(telemetryPort.getWorkoutSessions).mockResolvedValueOnce(
        ['a', 'b', 'c', 'd', 'e'].map(completedSession),
      );
      vi.mocked(telemetryPort.getNutritionAggregates).mockResolvedValueOnce([
        { date: '2026-10-01', totalCalories: 2300, totalProteinG: 160, mealCount: 4 },
      ]);

      const report = await new GetProgressReportsUseCase(createMockWeightRepo(), telemetryPort).execute({
        userId,
        type: 'weekly',
        timezone: 'UTC',
      });

      expect(report.headline).toBe('Outstanding training and nutrition week!');
      expect(report.achievements).toContain('5/5 planned workouts completed');
      expect(report.improvements).toEqual([
        'Solid consistency across workouts and nutrition. Keep the momentum going!',
      ]);
    });

    it('only the goals that are configured appear: no protein goal means no protein lines', async () => {
      const telemetryPort = createMockTelemetryPort();
      vi.mocked(telemetryPort.getProfileGoals).mockResolvedValueOnce({
        ...noGoals,
        workoutDaysPerWeek: 3,
      });
      vi.mocked(telemetryPort.getWorkoutSessions).mockResolvedValueOnce(
        ['a', 'b', 'c'].map(completedSession),
      );
      vi.mocked(telemetryPort.getNutritionAggregates).mockResolvedValueOnce([
        { date: '2026-10-01', totalCalories: 2000, totalProteinG: 50, mealCount: 3 },
      ]);

      const report = await new GetProgressReportsUseCase(createMockWeightRepo(), telemetryPort).execute({
        userId,
        type: 'weekly',
        timezone: 'UTC',
      });

      expect(report.headline).toBe('Strong training week (3 sessions)');
      expect(report.nextGoals).toEqual(['Complete 3 workouts']);
      expect(report.improvements).toEqual(['Solid workout consistency. Keep the momentum going!']);
      expect(statOf(report, 'Avg protein')?.note).toBeUndefined();
    });

    it('the weight stat shows a dash, not "0.0", until there are two weigh-ins to compare', async () => {
      const noWeighIns = await new GetProgressReportsUseCase(
        createMockWeightRepo(),
        createMockTelemetryPort(),
      ).execute({ userId, type: 'weekly', timezone: 'UTC' });
      expect(statOf(noWeighIns, 'Weight')).toMatchObject({ value: '—', unit: 'kg' });
      expect(statOf(noWeighIns, 'Weight')?.note).toBeUndefined();

      const oneWeighIn = createMockWeightRepo();
      vi.mocked(oneWeighIn.listForUser).mockResolvedValueOnce({
        logs: [weighIn('only', 80, new Date())],
        total: 1,
      });
      const single = await new GetProgressReportsUseCase(oneWeighIn, createMockTelemetryPort()).execute({
        userId,
        type: 'weekly',
        timezone: 'UTC',
      });
      expect(statOf(single, 'Weight')?.value).toBe('—');

      const twoWeighIns = createMockWeightRepo();
      vi.mocked(twoWeighIns.listForUser).mockResolvedValueOnce({
        logs: [
          weighIn('latest', 80.0, new Date()),
          weighIn('earliest', 81.2, new Date(Date.now() - 86_400_000)),
        ],
        total: 2,
      });
      const pair = await new GetProgressReportsUseCase(twoWeighIns, createMockTelemetryPort()).execute({
        userId,
        type: 'weekly',
        timezone: 'UTC',
      });
      expect(statOf(pair, 'Weight')).toMatchObject({
        value: '−1.2',
        unit: 'kg',
        note: '81.2 → 80.0',
        good: true,
      });
    });
  });
});
