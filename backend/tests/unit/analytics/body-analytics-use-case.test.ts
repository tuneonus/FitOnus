import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetBodyAnalyticsUseCase } from '../../../src/modules/analytics/application/use-cases/get-body-analytics.js';
import type { IAnalyticsBodyRepository } from '../../../src/modules/analytics/application/ports.js';
import type {
  RawWeightLogRecord,
  RawMeasurementRecord,
} from '../../../src/modules/analytics/domain/body-analytics-metrics.js';

describe('GetBodyAnalyticsUseCase', () => {
  let mockBodyRepo: IAnalyticsBodyRepository;
  let useCase: GetBodyAnalyticsUseCase;

  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    mockBodyRepo = {
      getWeightLogs: vi.fn(),
      getMeasurements: vi.fn(),
      getUserProfileGoals: vi.fn(),
    };

    useCase = new GetBodyAnalyticsUseCase(mockBodyRepo);
  });

  it('throws UNAUTHENTICATED error when userId is missing', async () => {
    await expect(useCase.execute({ userId: '' })).rejects.toThrowError(/User ID is required/);
  });

  it('rejects invalid range strings', async () => {
    await expect(useCase.execute({ userId, range: 'wrong' })).rejects.toThrowError(
      /Invalid analytics period/,
    );
  });

  it('returns clean truthful empty state when no weight or measurement logs exist', async () => {
    vi.mocked(mockBodyRepo.getWeightLogs).mockResolvedValueOnce([]);
    vi.mocked(mockBodyRepo.getMeasurements).mockResolvedValueOnce([]);
    vi.mocked(mockBodyRepo.getUserProfileGoals).mockResolvedValueOnce(null);

    const res = await useCase.execute({
      userId,
      range: 'M',
      refDate: '2026-10-07',
    });

    expect(res.startingWeightKg).toBeNull();
    expect(res.currentWeightKg).toBeNull();
    expect(res.targetWeightKg).toBeNull();
    expect(res.weeklyVelocityKg).toBe(0);
    expect(res.goalProgressPct).toBe(0);
    expect(res.weightTrend).toEqual([]);
    expect(res.measurementTrends).toEqual({});
  });

  it('computes EMA smoothing, weekly velocity, and measurement progression', async () => {
    const weightLogs: RawWeightLogRecord[] = [
      { id: 'w1', weightKg: 85.0, loggedAt: new Date('2026-09-07T07:00:00Z') },
      { id: 'w2', weightKg: 84.0, loggedAt: new Date('2026-09-17T07:00:00Z') },
      { id: 'w3', weightKg: 83.0, loggedAt: new Date('2026-10-07T07:00:00Z') },
    ];

    const measurements: RawMeasurementRecord[] = [
      {
        id: 'm1',
        loggedAt: new Date('2026-09-07T07:00:00Z'),
        waistCm: 88,
        chestCm: 104,
        hipCm: 102,
        armCm: null,
        neckCm: null,
        bodyFatPct: 18.5,
        muscleMassKg: 65,
      },
      {
        id: 'm2',
        loggedAt: new Date('2026-10-07T07:00:00Z'),
        waistCm: 85,
        chestCm: 105,
        hipCm: 101,
        armCm: null,
        neckCm: null,
        bodyFatPct: 17.2,
        muscleMassKg: 65.5,
      },
    ];

    vi.mocked(mockBodyRepo.getWeightLogs).mockResolvedValueOnce(weightLogs);
    vi.mocked(mockBodyRepo.getMeasurements).mockResolvedValueOnce(measurements);
    vi.mocked(mockBodyRepo.getUserProfileGoals).mockResolvedValueOnce({
      primaryGoal: 'lose',
      startingWeightKg: 85.0,
      currentWeightKg: 83.0,
      targetWeightKg: 80.0,
      dailyCalorieTarget: 2200,
      dailyProteinGrams: 160,
      workoutDaysPerWeek: 4,
    });

    const res = await useCase.execute({
      userId,
      range: 'M',
      refDate: '2026-10-07',
    });

    expect(res.startingWeightKg).toBe(85.0);
    expect(res.currentWeightKg).toBe(83.0);
    expect(res.targetWeightKg).toBe(80.0);

    // Goal progress: (85 - 83) / (85 - 80) = 2 / 5 = 40%
    expect(res.goalProgressPct).toBe(40);

    // Velocity: (83 - 85) / 30 days * 7 = -0.466 -> -0.47 kg/week
    expect(res.weeklyVelocityKg).toBe(-0.47);

    // EMA series
    expect(res.weightTrend).toHaveLength(3);
    expect(res.weightTrend[0]?.raw).toBe(85);
    expect(res.weightTrend[0]?.ema).toBe(85);

    // Measurement trends grouped
    expect(res.measurementTrends.waistCm).toHaveLength(2);
    expect(res.measurementTrends.waistCm?.[0]?.value).toBe(88);
    expect(res.measurementTrends.waistCm?.[1]?.value).toBe(85);

    expect(res.measurementTrends.bodyFatPct).toHaveLength(2);
    expect(res.measurementTrends.bodyFatPct?.[0]?.value).toBe(18.5);
    expect(res.measurementTrends.bodyFatPct?.[1]?.value).toBe(17.2);
  });

  it('propagates repository errors', async () => {
    vi.mocked(mockBodyRepo.getWeightLogs).mockRejectedValueOnce(new Error('Body DB failure'));
    await expect(useCase.execute({ userId, range: 'M' })).rejects.toThrowError('Body DB failure');
  });
});
