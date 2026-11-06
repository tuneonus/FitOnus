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
        logs: [
          mockSaved,
          new WeightLog({ id: 'w0', userId, weightKg: 80.0, loggedAt: new Date() }),
        ],
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
          logs: [
            new WeightLog({ id: 'w1', userId, weightKg: 78.4, loggedAt: new Date() }),
          ],
          total: 1,
        })
        .mockResolvedValueOnce({
          logs: [
            new WeightLog({ id: 'w1', userId, weightKg: 78.4, loggedAt: new Date() }),
          ],
          total: 1,
        });

      const useCase = new GetWeightHistoryUseCase(weightRepo);
      const res = await useCase.execute({ userId, range: 'D', timezone: 'UTC' });

      expect(res.summary.currentWeightKg).toBe(78.4);
      expect(res.points.length).toBe(7);
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
});
