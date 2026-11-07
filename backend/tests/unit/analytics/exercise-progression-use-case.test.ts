import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetExerciseProgressionUseCase } from '../../../src/modules/analytics/application/use-cases/get-exercise-progression.js';
import type { IAnalyticsWorkoutRepository } from '../../../src/modules/analytics/application/ports.js';
import type {
  RawExercisePrRecord,
  RawExerciseSetRecord,
} from '../../../src/modules/analytics/domain/workout-metrics.js';

describe('GetExerciseProgressionUseCase', () => {
  let mockWorkoutRepo: IAnalyticsWorkoutRepository;
  let useCase: GetExerciseProgressionUseCase;

  const userId = '11111111-1111-4111-8111-111111111111';
  const exerciseId = 'ex-bench-press';

  beforeEach(() => {
    mockWorkoutRepo = {
      getCompletedSessions: vi.fn(),
      getExerciseSetsHistory: vi.fn(),
      getExerciseCurrentPr: vi.fn(),
    };

    useCase = new GetExerciseProgressionUseCase(mockWorkoutRepo);
  });

  it('throws UNAUTHENTICATED error when userId is missing', async () => {
    await expect(useCase.execute({ userId: '', exerciseId })).rejects.toThrowError(/User ID is required/);
  });

  it('throws VALIDATION_FAILED when exerciseId is missing', async () => {
    await expect(useCase.execute({ userId, exerciseId: '' })).rejects.toThrowError(/Exercise ID is required/);
  });

  it('returns clean empty state when no historical sets or PR exist', async () => {
    vi.mocked(mockWorkoutRepo.getExerciseCurrentPr).mockResolvedValueOnce(null);
    vi.mocked(mockWorkoutRepo.getExerciseSetsHistory).mockResolvedValueOnce([]);

    const res = await useCase.execute({
      userId,
      exerciseId,
      range: '3M',
    });

    expect(res.exerciseId).toBe(exerciseId);
    expect(res.exerciseName).toBe('Exercise');
    expect(res.currentPr).toBeNull();
    expect(res.progression).toEqual([]);
  });

  it('aggregates exercise sets into date-grouped progression points with e1RM and volume', async () => {
    const currentPr: RawExercisePrRecord = {
      recordType: 'max_weight',
      weightKg: 100,
      reps: 5,
      volumeKg: 2500,
      estimated1rmKg: 116.7,
      achievedAt: new Date('2026-10-05T18:30:00Z'),
    };

    const sets: RawExerciseSetRecord[] = [
      // Session 1: 2026-09-01
      {
        setId: 's1',
        sessionId: 'ws-1',
        exerciseId,
        exerciseName: 'Barbell Bench Press',
        setNumber: 1,
        weightKg: 80,
        reps: 8,
        isWarmup: false,
        isPr: false,
        rpe: 8,
        startedAt: new Date('2026-09-01T10:00:00Z'),
      },
      {
        setId: 's2',
        sessionId: 'ws-1',
        exerciseId,
        exerciseName: 'Barbell Bench Press',
        setNumber: 2,
        weightKg: 85,
        reps: 6,
        isWarmup: false,
        isPr: false,
        rpe: 9,
        startedAt: new Date('2026-09-01T10:05:00Z'),
      },
      // Session 2: 2026-10-05
      {
        setId: 's3',
        sessionId: 'ws-2',
        exerciseId,
        exerciseName: 'Barbell Bench Press',
        setNumber: 1,
        weightKg: 100,
        reps: 5,
        isWarmup: false,
        isPr: true,
        rpe: 10,
        startedAt: new Date('2026-10-05T10:00:00Z'),
      },
    ];

    vi.mocked(mockWorkoutRepo.getExerciseCurrentPr).mockResolvedValueOnce(currentPr);
    vi.mocked(mockWorkoutRepo.getExerciseSetsHistory).mockResolvedValueOnce(sets);

    const res = await useCase.execute({
      userId,
      exerciseId,
      range: 'all',
    });

    expect(res.exerciseId).toBe(exerciseId);
    expect(res.exerciseName).toBe('Barbell Bench Press');
    expect(res.currentPr).toEqual({
      weightKg: 100,
      reps: 5,
      volumeKg: 2500,
      estimated1rmKg: 116.7,
      achievedAt: '2026-10-05T18:30:00.000Z',
    });

    expect(res.progression).toHaveLength(2);
    // Session 1: top set was 85kg x 6 (e1RM = 85 * (1 + 6/30) = 102.0), volume = 80*8 + 85*6 = 640 + 510 = 1150
    expect(res.progression[0]).toEqual({
      date: '2026-09-01',
      topWeightKg: 85,
      reps: 6,
      estimated1rmKg: 102,
      volumeKg: 1150,
    });
    // Session 2: top set was 100kg x 5 (e1RM = 100 * (1 + 5/30) = 116.7), volume = 100*5 = 500
    expect(res.progression[1]).toEqual({
      date: '2026-10-05',
      topWeightKg: 100,
      reps: 5,
      estimated1rmKg: 116.7,
      volumeKg: 500,
    });
  });

  it('propagates repository errors', async () => {
    vi.mocked(mockWorkoutRepo.getExerciseCurrentPr).mockRejectedValueOnce(new Error('Connection failure'));
    await expect(useCase.execute({ userId, exerciseId })).rejects.toThrowError('Connection failure');
  });
});
