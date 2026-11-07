import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetHydrationAnalyticsUseCase } from '../../../src/modules/analytics/application/use-cases/get-hydration-analytics.js';
import type { IAnalyticsNutritionRepository } from '../../../src/modules/analytics/application/ports.js';
import type { RawWaterAggregateRecord } from '../../../src/modules/analytics/domain/hydration-metrics.js';

describe('GetHydrationAnalyticsUseCase', () => {
  let mockNutritionRepo: IAnalyticsNutritionRepository;
  let useCase: GetHydrationAnalyticsUseCase;

  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    mockNutritionRepo = {
      getDailyMealAggregates: vi.fn(),
      getDailyWaterAggregates: vi.fn(),
    };

    useCase = new GetHydrationAnalyticsUseCase(mockNutritionRepo);
  });

  it('throws UNAUTHENTICATED error when userId is missing', async () => {
    await expect(useCase.execute({ userId: '' })).rejects.toThrowError(/User ID is required/);
  });

  it('rejects invalid range strings', async () => {
    await expect(useCase.execute({ userId, range: 'fake' })).rejects.toThrowError(
      /Invalid analytics period/,
    );
  });

  it('returns clean truthful empty state when no water intake is logged', async () => {
    vi.mocked(mockNutritionRepo.getDailyWaterAggregates).mockResolvedValueOnce([]);

    const res = await useCase.execute({
      userId,
      range: 'W',
      refDate: '2026-10-07',
    });

    expect(res.range).toBe('W');
    expect(res.avgWaterMl).toBe(0);
    expect(res.targetWaterMl).toBe(3000);
    expect(res.adherencePct).toBe(0);
    expect(res.points).toHaveLength(7);
    expect(res.points.every((p) => p.amountMl === 0 && p.goalMet === false)).toBe(true);
  });

  it('calculates average and adherence percentage using custom target override', async () => {
    const waterLogs: RawWaterAggregateRecord[] = [
      { date: '2026-10-01', totalMl: 2600 },
      { date: '2026-10-02', totalMl: 2400 },
      { date: '2026-10-03', totalMl: 3000 },
    ];

    vi.mocked(mockNutritionRepo.getDailyWaterAggregates).mockResolvedValueOnce(waterLogs);

    const res = await useCase.execute({
      userId,
      range: 'W',
      refDate: '2026-10-07',
      customTargetMl: 2500,
    });

    expect(res.targetWaterMl).toBe(2500);
    // Average across 3 logged days: (2600 + 2400 + 3000) / 3 = 2666.67 -> 2667 ml
    expect(res.avgWaterMl).toBe(2667);
    // Target met: 2600 (>= 2500, yes), 2400 (no), 3000 (yes) -> 2 out of 3 = 67%
    expect(res.adherencePct).toBe(67);

    // Continuous 7-day series
    expect(res.points).toHaveLength(7);
    const day1 = res.points.find((p) => p.date === '2026-10-01');
    expect(day1?.amountMl).toBe(2600);
    expect(day1?.goalMet).toBe(true);

    const day2 = res.points.find((p) => p.date === '2026-10-02');
    expect(day2?.amountMl).toBe(2400);
    expect(day2?.goalMet).toBe(false);

    const unloggedDay = res.points.find((p) => p.date === '2026-10-04');
    expect(unloggedDay?.amountMl).toBe(0);
    expect(unloggedDay?.goalMet).toBe(false);
  });

  it('propagates repository errors', async () => {
    vi.mocked(mockNutritionRepo.getDailyWaterAggregates).mockRejectedValueOnce(
      new Error('Water intake query error'),
    );
    await expect(useCase.execute({ userId, range: 'W' })).rejects.toThrowError(
      'Water intake query error',
    );
  });
});
