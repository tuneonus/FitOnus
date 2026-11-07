import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetWorkoutAnalyticsUseCase } from '../../../src/modules/analytics/application/use-cases/get-workout-analytics.js';
import type {
  IAnalyticsWorkoutRepository,
  IAnalyticsBodyRepository,
} from '../../../src/modules/analytics/application/ports.js';
import type { RawWorkoutSessionRecord } from '../../../src/modules/analytics/domain/workout-metrics.js';

describe('GetWorkoutAnalyticsUseCase', () => {
  let mockWorkoutRepo: IAnalyticsWorkoutRepository;
  let mockBodyRepo: IAnalyticsBodyRepository;
  let useCase: GetWorkoutAnalyticsUseCase;

  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    mockWorkoutRepo = {
      getCompletedSessions: vi.fn(),
      getExerciseSetsHistory: vi.fn(),
      getExerciseCurrentPr: vi.fn(),
    };

    mockBodyRepo = {
      getWeightLogs: vi.fn(),
      getMeasurements: vi.fn(),
      getUserProfileGoals: vi.fn(),
    };

    useCase = new GetWorkoutAnalyticsUseCase(mockWorkoutRepo, mockBodyRepo);
  });

  it('throws UNAUTHENTICATED error when userId is missing', async () => {
    await expect(useCase.execute({ userId: '' })).rejects.toThrowError(/User ID is required/);
    await expect(useCase.execute({ userId: '   ' })).rejects.toThrowError(/User ID is required/);
  });

  it('rejects invalid period range strings', async () => {
    await expect(
      useCase.execute({ userId, range: 'invalid-period' }),
    ).rejects.toThrowError(/Invalid analytics period/);
  });

  it('returns clean truthful empty state for empty accounts', async () => {
    vi.mocked(mockWorkoutRepo.getCompletedSessions).mockResolvedValueOnce([]);
    vi.mocked(mockBodyRepo.getUserProfileGoals).mockResolvedValueOnce(null);

    const res = await useCase.execute({
      userId,
      range: 'W',
      refDate: '2026-10-07',
    });

    expect(res.range).toBe('W');
    expect(res.totalSessions).toBe(0);
    expect(res.totalVolumeKg).toBe(0);
    expect(res.avgDurationMin).toBe(0);
    expect(res.consistencyPct).toBe(0);
    expect(res.frequencySeries).toHaveLength(7);
    expect(res.frequencySeries.every((p) => p.value === 0)).toBe(true);
    expect(res.volumeSeries.every((p) => p.value === 0)).toBe(true);
    expect(res.durationSeries.every((p) => p.value === 0)).toBe(true);
  });

  it('aggregates sessions correctly into calendar buckets and respects profile target', async () => {
    const sessions: RawWorkoutSessionRecord[] = [
      {
        id: 'ws-1',
        workoutName: 'Upper Body',
        startedAt: new Date('2026-10-02T10:00:00Z'),
        completedAt: new Date('2026-10-02T11:00:00Z'),
        durationSeconds: 3600, // 60 min
        totalVolumeKg: 5000,
        totalSets: 15,
        totalReps: 100,
        isCompleted: true,
      },
      {
        id: 'ws-2',
        workoutName: 'Lower Body',
        startedAt: new Date('2026-10-05T10:00:00Z'),
        completedAt: new Date('2026-10-05T10:45:00Z'),
        durationSeconds: 2700, // 45 min
        totalVolumeKg: 7500,
        totalSets: 12,
        totalReps: 80,
        isCompleted: true,
      },
    ];

    vi.mocked(mockWorkoutRepo.getCompletedSessions).mockResolvedValueOnce(sessions);
    vi.mocked(mockBodyRepo.getUserProfileGoals).mockResolvedValueOnce({
      primaryGoal: 'gain',
      startingWeightKg: 70,
      currentWeightKg: 72,
      targetWeightKg: 75,
      dailyCalorieTarget: 2600,
      dailyProteinGrams: 160,
      workoutDaysPerWeek: 4, // Target 4 sessions
    });

    const res = await useCase.execute({
      userId,
      range: 'W',
      refDate: '2026-10-07',
    });

    expect(res.totalSessions).toBe(2);
    expect(res.totalVolumeKg).toBe(12500);
    // Avg duration: (60 + 45) / 2 = 52.5 -> 53 min
    expect(res.avgDurationMin).toBe(53);
    // Consistency: 2 sessions / 4 target = 50%
    expect(res.consistencyPct).toBe(50);
  });

  it('propagates repository errors', async () => {
    vi.mocked(mockWorkoutRepo.getCompletedSessions).mockRejectedValueOnce(
      new Error('Database timeout'),
    );
    await expect(useCase.execute({ userId, range: 'M' })).rejects.toThrowError(
      'Database timeout',
    );
  });
});
