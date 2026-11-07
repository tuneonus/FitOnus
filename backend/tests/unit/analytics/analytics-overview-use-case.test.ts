import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetAnalyticsOverviewUseCase } from '../../../src/modules/analytics/application/use-cases/get-analytics-overview.js';
import type {
  IAnalyticsWorkoutRepository,
  IAnalyticsNutritionRepository,
  IAnalyticsBodyRepository,
} from '../../../src/modules/analytics/application/ports.js';
import type { RawWorkoutSessionRecord } from '../../../src/modules/analytics/domain/workout-metrics.js';
import type { RawMealAggregateRecord } from '../../../src/modules/analytics/domain/nutrition-metrics.js';
import type { RawWaterAggregateRecord } from '../../../src/modules/analytics/domain/hydration-metrics.js';
import type { RawWeightLogRecord } from '../../../src/modules/analytics/domain/body-analytics-metrics.js';

describe('GetAnalyticsOverviewUseCase', () => {
  let mockWorkoutRepo: IAnalyticsWorkoutRepository;
  let mockNutritionRepo: IAnalyticsNutritionRepository;
  let mockBodyRepo: IAnalyticsBodyRepository;
  let useCase: GetAnalyticsOverviewUseCase;

  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    mockWorkoutRepo = {
      getCompletedSessions: vi.fn(),
      getExerciseSetsHistory: vi.fn(),
      getExerciseCurrentPr: vi.fn(),
    };

    mockNutritionRepo = {
      getDailyMealAggregates: vi.fn(),
      getDailyWaterAggregates: vi.fn(),
    };

    mockBodyRepo = {
      getWeightLogs: vi.fn(),
      getMeasurements: vi.fn(),
      getUserProfileGoals: vi.fn(),
    };

    useCase = new GetAnalyticsOverviewUseCase(
      mockWorkoutRepo,
      mockNutritionRepo,
      mockBodyRepo,
    );
  });

  it('throws UNAUTHENTICATED error when userId is missing', async () => {
    await expect(useCase.execute({ userId: '' })).rejects.toThrowError(/User ID is required/);
  });

  it('returns clean truthful empty state for a new account without records', async () => {
    vi.mocked(mockWorkoutRepo.getCompletedSessions).mockResolvedValueOnce([]);
    vi.mocked(mockNutritionRepo.getDailyMealAggregates).mockResolvedValueOnce([]);
    vi.mocked(mockNutritionRepo.getDailyWaterAggregates).mockResolvedValueOnce([]);
    vi.mocked(mockBodyRepo.getWeightLogs).mockResolvedValueOnce([]);
    vi.mocked(mockBodyRepo.getUserProfileGoals).mockResolvedValueOnce(null);

    const res = await useCase.execute({
      userId,
      refDate: '2026-10-09',
    });

    expect(res.period).toBe('Oct 3 – Oct 9, 2026');
    expect(res.workoutSummary).toEqual({
      completedSessions: 0,
      targetSessions: 3,
      totalVolumeKg: 0,
      totalDurationMinutes: 0,
      consistencyPct: 0,
    });
    expect(res.nutritionSummary).toEqual({
      avgCalories: 0,
      targetCalories: null,
      avgProteinGrams: 0,
      targetProteinGrams: null,
      calorieAdherencePct: 0,
      proteinAdherencePct: 0,
      loggedDays: 0,
    });
    expect(res.hydrationSummary).toEqual({
      avgWaterMl: 0,
      targetWaterMl: 3000,
      adherencePct: 0,
    });
    expect(res.bodySummary).toEqual({
      currentWeightKg: null,
      startWeightKg: null,
      targetWeightKg: null,
      weeklyVelocityKg: 0,
      progressPct: 0,
    });
    expect(res.comparisonVsPriorPeriod).toHaveLength(5);
  });

  it('consolidates multi-domain metrics and calculates period comparisons', async () => {
    // Current period: Oct 3 - Oct 9, 2026
    // Previous period: Sep 26 - Oct 2, 2026
    const sessions: RawWorkoutSessionRecord[] = [
      // Previous week: 1 session, 5000 kg volume
      {
        id: 'ws-prev',
        workoutName: 'Full Body',
        startedAt: new Date('2026-09-28T10:00:00Z'),
        completedAt: new Date('2026-09-28T11:00:00Z'),
        durationSeconds: 3600,
        totalVolumeKg: 5000,
        totalSets: 15,
        totalReps: 100,
        isCompleted: true,
      },
      // Current week: 2 sessions, 12000 kg volume
      {
        id: 'ws-curr-1',
        workoutName: 'Push',
        startedAt: new Date('2026-10-04T10:00:00Z'),
        completedAt: new Date('2026-10-04T11:00:00Z'),
        durationSeconds: 3600,
        totalVolumeKg: 6000,
        totalSets: 15,
        totalReps: 100,
        isCompleted: true,
      },
      {
        id: 'ws-curr-2',
        workoutName: 'Pull',
        startedAt: new Date('2026-10-06T10:00:00Z'),
        completedAt: new Date('2026-10-06T11:00:00Z'),
        durationSeconds: 3600,
        totalVolumeKg: 6000,
        totalSets: 15,
        totalReps: 100,
        isCompleted: true,
      },
    ];

    const meals: RawMealAggregateRecord[] = [
      // Prev week: 2400 kcal, 160g protein
      {
        date: '2026-09-28',
        totalCalories: 2400,
        totalProteinG: 160,
        totalCarbsG: 250,
        totalFatG: 70,
        totalFiberG: 30,
        mealCount: 3,
      },
      // Current week: 2200 kcal, 175g protein
      {
        date: '2026-10-04',
        totalCalories: 2200,
        totalProteinG: 175,
        totalCarbsG: 220,
        totalFatG: 65,
        totalFiberG: 32,
        mealCount: 3,
      },
    ];

    const water: RawWaterAggregateRecord[] = [
      { date: '2026-09-28', totalMl: 2500 },
      { date: '2026-10-04', totalMl: 3200 },
    ];

    const weights: RawWeightLogRecord[] = [
      { id: 'w-prev', weightKg: 82.0, loggedAt: new Date('2026-09-28T07:00:00Z') },
      { id: 'w-curr', weightKg: 81.2, loggedAt: new Date('2026-10-05T07:00:00Z') },
    ];

    vi.mocked(mockWorkoutRepo.getCompletedSessions).mockResolvedValueOnce(sessions);
    vi.mocked(mockNutritionRepo.getDailyMealAggregates).mockResolvedValueOnce(meals);
    vi.mocked(mockNutritionRepo.getDailyWaterAggregates).mockResolvedValueOnce(water);
    vi.mocked(mockBodyRepo.getWeightLogs).mockResolvedValueOnce(weights);
    vi.mocked(mockBodyRepo.getUserProfileGoals).mockResolvedValueOnce({
      primaryGoal: 'lose',
      startingWeightKg: 85.0,
      currentWeightKg: 81.2,
      targetWeightKg: 78.0,
      dailyCalorieTarget: 2200,
      dailyProteinGrams: 170,
      workoutDaysPerWeek: 4,
    });

    const res = await useCase.execute({
      userId,
      refDate: '2026-10-09',
    });

    expect(res.period).toBe('Oct 3 – Oct 9, 2026');

    // Workout summary
    expect(res.workoutSummary.completedSessions).toBe(2);
    expect(res.workoutSummary.totalVolumeKg).toBe(12000);
    expect(res.workoutSummary.targetSessions).toBe(4);
    expect(res.workoutSummary.consistencyPct).toBe(50);

    // Nutrition summary
    expect(res.nutritionSummary.avgCalories).toBe(2200);
    expect(res.nutritionSummary.targetCalories).toBe(2200);
    expect(res.nutritionSummary.calorieAdherencePct).toBe(100);
    expect(res.nutritionSummary.proteinAdherencePct).toBe(100);

    // Hydration summary
    expect(res.hydrationSummary.avgWaterMl).toBe(3200);
    expect(res.hydrationSummary.adherencePct).toBe(100);

    // Body summary
    expect(res.bodySummary.currentWeightKg).toBe(81.2);
    expect(res.bodySummary.startWeightKg).toBe(85.0);
    expect(res.bodySummary.targetWeightKg).toBe(78.0);
    // (85 - 81.2) / (85 - 78) = 3.8 / 7 = 54.28% -> 54.3%
    expect(res.bodySummary.progressPct).toBe(54.3);

    // Comparisons
    expect(res.comparisonVsPriorPeriod.length).toBeGreaterThanOrEqual(5);

    const workoutComp = res.comparisonVsPriorPeriod.find((c) => c.label === 'Workouts');
    expect(workoutComp?.current).toBe('2');
    expect(workoutComp?.previous).toBe('1');
    expect(workoutComp?.delta).toBe(1);
    expect(workoutComp?.better).toBe(true);

    const calComp = res.comparisonVsPriorPeriod.find((c) => c.label === 'Calories');
    expect(calComp?.current).toBe('2,200 kcal');
    expect(calComp?.previous).toBe('2,400 kcal');
    expect(calComp?.delta).toBe(-200);
    // For 'lose' goal, lower calories is better
    expect(calComp?.better).toBe(true);

    const weightComp = res.comparisonVsPriorPeriod.find((c) => c.label === 'Weight');
    expect(weightComp?.current).toBe('81.2 kg');
    expect(weightComp?.previous).toBe('82.0 kg');
    expect(weightComp?.delta).toBe(-0.8);
    // For 'lose' goal, negative weight delta is better
    expect(weightComp?.better).toBe(true);
  });

  it('propagates repository errors', async () => {
    vi.mocked(mockWorkoutRepo.getCompletedSessions).mockRejectedValueOnce(
      new Error('Overview repo error'),
    );
    await expect(useCase.execute({ userId })).rejects.toThrowError('Overview repo error');
  });
});
