import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetDashboardSummaryUseCase } from '../../../src/modules/dashboard/application/use-cases/get-dashboard-summary.js';
import type { DashboardRepository } from '../../../src/modules/dashboard/application/ports.js';
import type { DashboardSummary } from '../../../src/modules/dashboard/domain/dashboard-summary.js';
import { dashboardSummaryResponseSchema } from '../../../src/modules/dashboard/interface/dashboard.schemas.js';

describe('GetDashboardSummaryUseCase', () => {
  let mockDashboardRepo: DashboardRepository;
  let useCase: GetDashboardSummaryUseCase;

  const userId = '11111111-1111-4111-8111-111111111111';

  const emptyUserSummary: DashboardSummary = {
    userDisplayName: 'New Athlete',
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
      weight: null,
    },
    aiSummary: {
      greeting: 'Good morning, New!',
      sleepInsights: null,
      recoveryInsights: null,
      recommendation: 'Take today to recover, keep hydrated, and hit your nutrition targets.',
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

  it('throws UNAUTHENTICATED error when userId is missing or empty', async () => {
    await expect(useCase.execute({ userId: '' })).rejects.toThrowError(/User ID is required/);
    await expect(useCase.execute({ userId: '   ' })).rejects.toThrowError(/User ID is required/);
  });

  it('returns clean truthful zeros and nulls for a new user with no logged data', async () => {
    vi.mocked(mockDashboardRepo.getDashboardData).mockResolvedValueOnce(emptyUserSummary);

    const result = await useCase.execute({ userId, timezone: 'America/New_York' });

    expect(result.summary.caloriesBurned).toBe(0);
    expect(result.summary.activeMinutes).toBe(0);
    expect(result.summary.caloriesConsumed).toBe(0);
    expect(result.summary.waterIntake).toBe(0);
    expect(result.summary.recoveryScore).toBeNull();
    expect(result.summary.sleepDuration).toBeNull();
    expect(result.recentActivity).toHaveLength(0);

    const validation = dashboardSummaryResponseSchema.safeParse(result);
    expect(validation.success).toBe(true);
  });

  it('aggregates workout data (calories burned and active minutes)', async () => {
    const activeUserSummary: DashboardSummary = {
      ...emptyUserSummary,
      summary: {
        ...emptyUserSummary.summary,
        caloriesBurned: 450,
        activeMinutes: 52,
      },
      progress: {
        dailyGoalProgress: 1,
        weeklyGoalProgress: 0.5,
      },
      recentActivity: [
        {
          id: 'ws-1',
          type: 'workout',
          title: 'Morning Push',
          subtitle: '52 mins • 450 kcal',
          timestamp: 'Today',
        },
      ],
    };

    vi.mocked(mockDashboardRepo.getDashboardData).mockResolvedValueOnce(activeUserSummary);

    const result = await useCase.execute({ userId, timezone: 'UTC' });

    expect(result.summary.caloriesBurned).toBe(450);
    expect(result.summary.activeMinutes).toBe(52);
    expect(result.progress.dailyGoalProgress).toBe(1);
    expect(result.recentActivity[0]?.type).toBe('workout');
    expect(dashboardSummaryResponseSchema.safeParse(result).success).toBe(true);
  });

  it('aggregates nutrition data (calories, protein, carbs, fat)', async () => {
    const nutritionSummary: DashboardSummary = {
      ...emptyUserSummary,
      summary: {
        ...emptyUserSummary.summary,
        caloriesConsumed: 1850,
      },
      nutrition: {
        calories: 1850,
        caloriesGoal: 2400,
        protein: 145,
        proteinGoal: 160,
        carbs: 210,
        carbsGoal: 250,
        fat: 55,
        fatGoal: 65,
      },
      recentActivity: [
        {
          id: 'm-1',
          type: 'meal',
          title: 'Lunch',
          subtitle: '650 kcal • 48g Protein',
          timestamp: 'Today',
        },
      ],
    };

    vi.mocked(mockDashboardRepo.getDashboardData).mockResolvedValueOnce(nutritionSummary);

    const result = await useCase.execute({ userId, timezone: 'UTC' });

    expect(result.summary.caloriesConsumed).toBe(1850);
    expect(result.nutrition.calories).toBe(1850);
    expect(result.nutrition.protein).toBe(145);
    expect(result.nutrition.carbs).toBe(210);
    expect(result.nutrition.fat).toBe(55);
    expect(dashboardSummaryResponseSchema.safeParse(result).success).toBe(true);
  });

  it('aggregates hydration totals in liters and milliliters', async () => {
    const hydrationSummary: DashboardSummary = {
      ...emptyUserSummary,
      summary: {
        ...emptyUserSummary.summary,
        waterIntake: 2.5,
        waterIntakeMl: 2500,
      },
    };

    vi.mocked(mockDashboardRepo.getDashboardData).mockResolvedValueOnce(hydrationSummary);

    const result = await useCase.execute({ userId, timezone: 'UTC' });

    expect(result.summary.waterIntake).toBe(2.5);
    expect(result.summary.waterIntakeMl).toBe(2500);
    expect(dashboardSummaryResponseSchema.safeParse(result).success).toBe(true);
  });

  it('handles timezone fallback when timezone is omitted', async () => {
    vi.mocked(mockDashboardRepo.getDashboardData).mockResolvedValueOnce(emptyUserSummary);

    await useCase.execute({ userId });

    expect(mockDashboardRepo.getDashboardData).toHaveBeenCalledWith(userId, 'UTC');
  });

  it('enforces user isolation by passing the exact requested userId', async () => {
    const otherUserId = '22222222-2222-4222-8222-222222222222';
    vi.mocked(mockDashboardRepo.getDashboardData).mockResolvedValueOnce(emptyUserSummary);

    await useCase.execute({ userId: otherUserId, timezone: 'Europe/London' });

    expect(mockDashboardRepo.getDashboardData).toHaveBeenCalledWith(otherUserId, 'Europe/London');
    expect(mockDashboardRepo.getDashboardData).not.toHaveBeenCalledWith(userId, expect.anything());
  });

  it('passes schema validation for full populated dashboard payload', async () => {
    const fullSummary: DashboardSummary = {
      userDisplayName: 'Alex Morgan',
      summary: {
        recoveryScore: null,
        sleepScore: null,
        sleepDuration: null,
        steps: null,
        caloriesBurned: 520,
        caloriesConsumed: 2100,
        activeMinutes: 65,
        waterIntake: 3.0,
        waterIntakeMl: 3000,
        heartRate: null,
        weight: 74.5,
      },
      aiSummary: {
        greeting: 'Good afternoon, Alex!',
        sleepInsights: null,
        recoveryInsights: null,
        recommendation: 'Great work completing your workout today! Drink plenty of water.',
      },
      todayWorkout: {
        id: 'w-42',
        name: 'Full Body HIIT',
        duration: 45,
        exercises: 6,
        estimatedCalories: 338,
      },
      nutrition: {
        calories: 2100,
        caloriesGoal: 2300,
        protein: 160,
        proteinGoal: 165,
        carbs: 235,
        carbsGoal: 250,
        fat: 60,
        fatGoal: 65,
      },
      progress: {
        dailyGoalProgress: 1,
        weeklyGoalProgress: 0.75,
      },
      recentActivity: [
        {
          id: 'ws-1',
          type: 'workout',
          title: 'Full Body HIIT',
          subtitle: '45 mins • 338 kcal',
          timestamp: 'Today',
        },
        {
          id: 'm-1',
          type: 'meal',
          title: 'Lunch Bowl',
          subtitle: '650 kcal • 45g Protein',
          timestamp: 'Today',
        },
        {
          id: 'wl-1',
          type: 'weight',
          title: 'Logged Weight',
          subtitle: '74.5 kg',
          timestamp: 'Yesterday',
        },
      ],
    };

    vi.mocked(mockDashboardRepo.getDashboardData).mockResolvedValueOnce(fullSummary);

    const result = await useCase.execute({ userId, timezone: 'America/Los_Angeles' });
    const parsed = dashboardSummaryResponseSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});
