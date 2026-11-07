import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetGoalsHabitsAnalyticsUseCase } from '../../../src/modules/analytics/application/use-cases/get-goals-habits-analytics.js';
import type { IAnalyticsGoalsHabitsRepository } from '../../../src/modules/analytics/application/ports.js';
import type {
  RawGoalRecord,
  RawHabitRecord,
} from '../../../src/modules/analytics/domain/goals-habits-metrics.js';

describe('GetGoalsHabitsAnalyticsUseCase', () => {
  let mockGoalsHabitsRepo: IAnalyticsGoalsHabitsRepository;
  let useCase: GetGoalsHabitsAnalyticsUseCase;

  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    mockGoalsHabitsRepo = {
      getGoals: vi.fn(),
      getHabitsWithCompletions: vi.fn(),
    };

    useCase = new GetGoalsHabitsAnalyticsUseCase(mockGoalsHabitsRepo);
  });

  it('throws UNAUTHENTICATED error when userId is missing', async () => {
    await expect(useCase.execute({ userId: '' })).rejects.toThrowError(/User ID is required/);
  });

  it('clamps windowDays between 7 and 365 (defaults to 30)', async () => {
    vi.mocked(mockGoalsHabitsRepo.getGoals).mockResolvedValue([]);
    vi.mocked(mockGoalsHabitsRepo.getHabitsWithCompletions).mockResolvedValue([]);

    // Default 30 days
    const resDefault = await useCase.execute({
      userId,
      refDate: '2026-10-30',
    });
    expect(resDefault.consistencyHeatmap).toHaveLength(30);

    // Clamp small window (< 7) to 7
    const resSmall = await useCase.execute({
      userId,
      windowDays: 2,
      refDate: '2026-10-30',
    });
    expect(resSmall.consistencyHeatmap).toHaveLength(7);

    // Clamp large window (> 365) to 365
    const resLarge = await useCase.execute({
      userId,
      windowDays: 500,
      refDate: '2026-10-30',
    });
    expect(resLarge.consistencyHeatmap).toHaveLength(365);
  });

  it('returns clean truthful empty state when no goals or habits exist', async () => {
    vi.mocked(mockGoalsHabitsRepo.getGoals).mockResolvedValueOnce([]);
    vi.mocked(mockGoalsHabitsRepo.getHabitsWithCompletions).mockResolvedValueOnce([]);

    const res = await useCase.execute({
      userId,
      windowDays: 7,
      refDate: '2026-10-07',
    });

    expect(res.goalStats).toEqual({
      totalGoals: 0,
      active: 0,
      completed: 0,
      completionRatePct: 0,
    });
    expect(res.habitsSummary).toEqual([]);
    expect(res.overallHabitAdherencePct).toBe(0);
    expect(res.consistencyHeatmap).toHaveLength(7);
    expect(res.consistencyHeatmap.every((h) => h.count === 0)).toBe(true);
  });

  it('computes goal stats, habit streaks, completion rates, and heatmap', async () => {
    const goals: RawGoalRecord[] = [
      {
        id: 'g1',
        type: 'weight',
        title: 'Reach 75kg',
        startValue: 80,
        currentValue: 75,
        targetValue: 75,
        status: 'completed',
        targetDate: null,
        completedAt: new Date(),
      },
      {
        id: 'g2',
        type: 'strength',
        title: 'Bench 100kg',
        startValue: 80,
        currentValue: 95,
        targetValue: 100,
        status: 'active',
        targetDate: null,
        completedAt: null,
      },
    ];

    const habits: RawHabitRecord[] = [
      {
        id: 'h1',
        title: 'Daily Meditation',
        category: 'mindfulness',
        frequency: 'daily',
        targetDaysPerWeek: 7,
        currentStreak: 5,
        longestStreak: 12,
        totalCompletions: 25,
        completionDates: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'],
      },
    ];

    vi.mocked(mockGoalsHabitsRepo.getGoals).mockResolvedValueOnce(goals);
    vi.mocked(mockGoalsHabitsRepo.getHabitsWithCompletions).mockResolvedValueOnce(habits);

    const res = await useCase.execute({
      userId,
      windowDays: 7,
      refDate: '2026-10-07', // 2026-10-01 to 2026-10-07
    });

    expect(res.goalStats.totalGoals).toBe(2);
    expect(res.goalStats.completed).toBe(1);
    expect(res.goalStats.active).toBe(1);
    expect(res.goalStats.completionRatePct).toBe(50);

    expect(res.habitsSummary).toHaveLength(1);
    const h1 = res.habitsSummary[0]!;
    expect(h1.habitId).toBe('h1');
    expect(h1.completionsInWindow).toBe(5);
    // 5 completions out of 7 days = 71.4%
    expect(h1.completionRatePct).toBe(71.4);
    expect(h1.currentStreak).toBe(5);

    expect(res.consistencyHeatmap).toHaveLength(7);
    const day1 = res.consistencyHeatmap.find((d) => d.date === '2026-10-01');
    expect(day1?.count).toBe(1);
    const day7 = res.consistencyHeatmap.find((d) => d.date === '2026-10-07');
    expect(day7?.count).toBe(0);
  });

  it('propagates repository errors', async () => {
    vi.mocked(mockGoalsHabitsRepo.getGoals).mockRejectedValueOnce(new Error('Habits timeout'));
    await expect(useCase.execute({ userId })).rejects.toThrowError('Habits timeout');
  });
});
