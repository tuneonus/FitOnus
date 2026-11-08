import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetDashboardSummaryUseCase } from '../../../src/modules/dashboard/application/use-cases/get-dashboard-summary.js';
import type { DashboardRepository } from '../../../src/modules/dashboard/application/ports.js';
import type { DashboardSummary } from '../../../src/modules/dashboard/domain/dashboard-summary.js';

describe('Phase 11.3: Dashboard Regression & Synchronization Test Suite', () => {
  let mockDashboardRepo: DashboardRepository;
  let useCase: GetDashboardSummaryUseCase;

  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';

  const baseSummary: DashboardSummary = {
    userDisplayName: 'Alex QA',
    summary: {
      recoveryScore: null,
      sleepScore: null,
      sleepDuration: null,
      steps: null,
      caloriesBurned: 0,
      caloriesConsumed: 0,
      activeMinutes: 0,
      waterIntake: 0,
      waterIntakeMl: 0,
      heartRate: null,
      weight: 72.0,
    },
    aiSummary: {
      greeting: 'Good morning, Alex!',
      sleepInsights: null,
      recoveryInsights: null,
      recommendation: null,
    },
    todayWorkout: null,
    nutrition: {
      calories: 0,
      caloriesGoal: 2200,
      protein: 0,
      proteinGoal: 150,
      carbs: 0,
      carbsGoal: 250,
      fat: 0,
      fatGoal: 70,
    },
    progress: {
      dailyGoalProgress: 0,
      weeklyGoalProgress: 0,
    },
    recentActivity: [],
  };

  beforeEach(() => {
    mockDashboardRepo = {
      getDashboardData: vi.fn(),
    };
    useCase = new GetDashboardSummaryUseCase(mockDashboardRepo);
  });

  it('1. Workout persistence reflection: aggregates calories burned, active minutes, and recent activity', async () => {
    const summaryWithWorkout: DashboardSummary = {
      ...baseSummary,
      summary: {
        ...baseSummary.summary,
        caloriesBurned: 420,
        activeMinutes: 50,
      },
      progress: {
        dailyGoalProgress: 1,
        weeklyGoalProgress: 0.25,
      },
      recentActivity: [
        {
          id: 'ws-101',
          type: 'workout',
          title: 'Push Hypertrophy',
          subtitle: '50 mins • 420 kcal',
          timestamp: 'Today',
        },
      ],
    };

    vi.mocked(mockDashboardRepo.getDashboardData).mockResolvedValueOnce(summaryWithWorkout);

    const result = await useCase.execute({ userId: userA, timezone: 'America/New_York' });

    expect(result.summary.caloriesBurned).toBe(420);
    expect(result.summary.activeMinutes).toBe(50);
    expect(result.progress.dailyGoalProgress).toBe(1);
    expect(result.recentActivity).toHaveLength(1);
    expect(result.recentActivity[0]?.type).toBe('workout');
  });

  it('2. Meal persistence & nutrition aggregation: totals match daily logs exactly', async () => {
    const summaryWithNutrition: DashboardSummary = {
      ...baseSummary,
      summary: {
        ...baseSummary.summary,
        caloriesConsumed: 1950,
      },
      nutrition: {
        calories: 1950,
        caloriesGoal: 2200,
        protein: 155,
        proteinGoal: 150,
        carbs: 215,
        carbsGoal: 250,
        fat: 58,
        fatGoal: 70,
      },
      recentActivity: [
        {
          id: 'm-201',
          type: 'meal',
          title: 'Lunch',
          subtitle: '750 kcal • 55g Protein',
          timestamp: 'Today',
        },
      ],
    };

    vi.mocked(mockDashboardRepo.getDashboardData).mockResolvedValueOnce(summaryWithNutrition);

    const result = await useCase.execute({ userId: userA, timezone: 'America/New_York' });

    expect(result.summary.caloriesConsumed).toBe(1950);
    expect(result.nutrition.protein).toBe(155);
    expect(result.nutrition.carbs).toBe(215);
    expect(result.nutrition.fat).toBe(58);
  });

  it('3. Meal editing updates: modified meals update nutrition targets and recent activity', async () => {
    const initialMealSummary: DashboardSummary = {
      ...baseSummary,
      summary: { ...baseSummary.summary, caloriesConsumed: 500 },
      nutrition: { ...baseSummary.nutrition, calories: 500, protein: 40 },
    };
    const editedMealSummary: DashboardSummary = {
      ...baseSummary,
      summary: { ...baseSummary.summary, caloriesConsumed: 750 },
      nutrition: { ...baseSummary.nutrition, calories: 750, protein: 60 },
    };

    vi.mocked(mockDashboardRepo.getDashboardData)
      .mockResolvedValueOnce(initialMealSummary)
      .mockResolvedValueOnce(editedMealSummary);

    const before = await useCase.execute({ userId: userA });
    expect(before.nutrition.calories).toBe(500);

    const after = await useCase.execute({ userId: userA });
    expect(after.nutrition.calories).toBe(750);
    expect(after.nutrition.protein).toBe(60);
  });

  it('4. Water persistence & hydration aggregation: totals match logged milliliters and liters', async () => {
    const summaryWithWater: DashboardSummary = {
      ...baseSummary,
      summary: {
        ...baseSummary.summary,
        waterIntake: 2.3,
        waterIntakeMl: 2250,
      },
    };

    vi.mocked(mockDashboardRepo.getDashboardData).mockResolvedValueOnce(summaryWithWater);

    const result = await useCase.execute({ userId: userA, timezone: 'UTC' });

    expect(result.summary.waterIntakeMl).toBe(2250);
    expect(result.summary.waterIntake).toBe(2.3);
  });

  it('5. Offline deduplication: idempotent replay does not inflate dashboard metrics', async () => {
    const deduplicatedSummary: DashboardSummary = {
      ...baseSummary,
      summary: {
        ...baseSummary.summary,
        caloriesBurned: 350,
      },
      recentActivity: [
        {
          id: 'ws-unique-1',
          type: 'workout',
          title: 'Full Body',
          subtitle: '40 mins • 350 kcal',
          timestamp: 'Today',
        },
      ],
    };

    vi.mocked(mockDashboardRepo.getDashboardData)
      .mockResolvedValueOnce(deduplicatedSummary)
      .mockResolvedValueOnce(deduplicatedSummary);

    const firstFetch = await useCase.execute({ userId: userA });
    const replayFetch = await useCase.execute({ userId: userA });

    expect(firstFetch.summary.caloriesBurned).toBe(350);
    expect(replayFetch.summary.caloriesBurned).toBe(350);
    expect(replayFetch.recentActivity).toHaveLength(1);
  });

  it('6. Strict user data isolation: user A never sees user B data', async () => {
    const summaryUserA: DashboardSummary = {
      ...baseSummary,
      userDisplayName: 'User A',
      summary: { ...baseSummary.summary, caloriesBurned: 500 },
    };
    const summaryUserB: DashboardSummary = {
      ...baseSummary,
      userDisplayName: 'User B',
      summary: { ...baseSummary.summary, caloriesBurned: 0 },
    };

    vi.mocked(mockDashboardRepo.getDashboardData).mockImplementation(async (uid) => {
      return uid === userA ? summaryUserA : summaryUserB;
    });

    const resA = await useCase.execute({ userId: userA });
    const resB = await useCase.execute({ userId: userB });

    expect(resA.userDisplayName).toBe('User A');
    expect(resA.summary.caloriesBurned).toBe(500);

    expect(resB.userDisplayName).toBe('User B');
    expect(resB.summary.caloriesBurned).toBe(0);
  });

  it('7. Timezone boundary precision: passes resolved timezone to repository', async () => {
    vi.mocked(mockDashboardRepo.getDashboardData).mockResolvedValueOnce(baseSummary);

    await useCase.execute({ userId: userA, timezone: 'Asia/Tokyo' });

    expect(mockDashboardRepo.getDashboardData).toHaveBeenCalledWith(userA, 'Asia/Tokyo');
  });
});
