import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetNutritionAnalyticsUseCase } from '../../../src/modules/analytics/application/use-cases/get-nutrition-analytics.js';
import type {
  IAnalyticsNutritionRepository,
  IAnalyticsBodyRepository,
} from '../../../src/modules/analytics/application/ports.js';
import type { RawMealAggregateRecord } from '../../../src/modules/analytics/domain/nutrition-metrics.js';

describe('GetNutritionAnalyticsUseCase', () => {
  let mockNutritionRepo: IAnalyticsNutritionRepository;
  let mockBodyRepo: IAnalyticsBodyRepository;
  let useCase: GetNutritionAnalyticsUseCase;

  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    mockNutritionRepo = {
      getDailyMealAggregates: vi.fn(),
      getDailyWaterAggregates: vi.fn(),
    };

    mockBodyRepo = {
      getWeightLogs: vi.fn(),
      getMeasurements: vi.fn(),
      getUserProfileGoals: vi.fn(),
    };

    useCase = new GetNutritionAnalyticsUseCase(mockNutritionRepo, mockBodyRepo);
  });

  it('throws UNAUTHENTICATED error when userId is missing', async () => {
    await expect(useCase.execute({ userId: '' })).rejects.toThrowError(/User ID is required/);
  });

  it('rejects invalid range strings', async () => {
    await expect(useCase.execute({ userId, range: 'bad-range' })).rejects.toThrowError(
      /Invalid analytics period/,
    );
  });

  it('returns clean truthful empty state for users with no logged meals', async () => {
    vi.mocked(mockNutritionRepo.getDailyMealAggregates).mockResolvedValueOnce([]);
    vi.mocked(mockBodyRepo.getUserProfileGoals).mockResolvedValueOnce(null);

    const res = await useCase.execute({
      userId,
      range: 'W',
      refDate: '2026-10-07',
    });

    expect(res.range).toBe('W');
    expect(res.avgCalories).toBe(0);
    expect(res.targetCalories).toBeNull();
    expect(res.calorieAdherencePct).toBe(0);
    expect(res.proteinAdherencePct).toBe(0);
    expect(res.macroSplit).toEqual([
      { label: 'Protein', pct: 0, grams: 0 },
      { label: 'Carbs', pct: 0, grams: 0 },
      { label: 'Fat', pct: 0, grams: 0 },
    ]);
    expect(res.dailyTrends).toHaveLength(7);
    expect(res.dailyTrends.every((d) => d.logged === false && d.calories === 0)).toBe(true);
  });

  it('excludes unlogged days from averages to prevent data skewing', async () => {
    // 7-day window ending on 2026-10-07. User logged meals on only 2 days.
    const meals: RawMealAggregateRecord[] = [
      {
        date: '2026-10-02',
        totalCalories: 2200,
        totalProteinG: 160,
        totalCarbsG: 240,
        totalFatG: 65,
        totalFiberG: 30,
        mealCount: 3,
      },
      {
        date: '2026-10-05',
        totalCalories: 2400,
        totalProteinG: 180,
        totalCarbsG: 260,
        totalFatG: 70,
        totalFiberG: 35,
        mealCount: 4,
      },
    ];

    vi.mocked(mockNutritionRepo.getDailyMealAggregates).mockResolvedValueOnce(meals);
    vi.mocked(mockBodyRepo.getUserProfileGoals).mockResolvedValueOnce({
      primaryGoal: 'maintain',
      startingWeightKg: 80,
      currentWeightKg: 80,
      targetWeightKg: 80,
      dailyCalorieTarget: 2300,
      dailyProteinGrams: 170,
      workoutDaysPerWeek: 3,
    });

    const res = await useCase.execute({
      userId,
      range: 'W',
      refDate: '2026-10-07',
    });

    // Average calories must be (2200 + 2400) / 2 = 2300 kcal (NOT divided by 7)
    expect(res.avgCalories).toBe(2300);
    expect(res.targetCalories).toBe(2300);

    // Target adherence across the 2 logged days:
    // Calorie target 2300: 2200 is within 10% (2070-2530), 2400 is within 10% -> 100%
    expect(res.calorieAdherencePct).toBe(100);
    // Protein target 170: 90% is 153g. Day 1 is 160 (>= 153), Day 2 is 180 (>= 153) -> 100%
    expect(res.proteinAdherencePct).toBe(100);

    // Macro split using Atwater factors:
    // Avg protein: 170g * 4 = 680 kcal
    // Avg carbs: 250g * 4 = 1000 kcal
    // Avg fat: 67.5g * 9 = 607.5 kcal
    // Total macro kcal: 2287.5
    expect(res.macroSplit).toHaveLength(3);
    const proteinMacro = res.macroSplit.find((m) => m.label === 'Protein');
    expect(proteinMacro?.grams).toBe(340);

    // Check daily trends
    expect(res.dailyTrends).toHaveLength(7);
    const loggedDays = res.dailyTrends.filter((d) => d.logged);
    expect(loggedDays).toHaveLength(2);
    expect(loggedDays[0]?.date).toBe('2026-10-02');
    expect(loggedDays[1]?.date).toBe('2026-10-05');
  });

  it('propagates repository errors', async () => {
    vi.mocked(mockNutritionRepo.getDailyMealAggregates).mockRejectedValueOnce(
      new Error('DB Query Failed'),
    );
    await expect(useCase.execute({ userId, range: 'W' })).rejects.toThrowError(
      'DB Query Failed',
    );
  });
});
