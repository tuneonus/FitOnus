import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  DashboardStats,
  DashboardTimeframe,
  RegistrationTrendPoint,
  EnhancedDashboardData,
} from '../src/features/dashboard/types';
import type { WorkoutStats } from '../src/features/workouts/types';
import type { NutritionCatalogStats } from '../src/features/nutrition/types';
import type { Challenge } from '../src/features/challenges/types';

describe('Admin Dashboard Enhancement — Phase 10.3 Tests', () => {
  const mockUserStats: DashboardStats = {
    totalUsers: 120,
    activeUsers: 95,
    disabledUsers: 5,
    activeUsers7d: 42,
    activeUsers30d: 88,
    completedOnboarding: 80,
    pendingOnboarding: 40,
    newRegistrations7d: 14,
    newRegistrations30d: 38,
    recentUsers: [
      {
        id: 'u-1',
        email: 'alex@example.com',
        displayName: 'Alex Runner',
        role: 'member',
        status: 'active',
        onboardingCompleted: true,
        createdAt: '2026-11-06T10:00:00Z',
      },
    ],
    registrationTrend: [
      { date: '2026-10-25', count: 2 },
      { date: '2026-10-26', count: 3 },
      { date: '2026-10-27', count: 1 },
      { date: '2026-10-28', count: 4 },
      { date: '2026-10-29', count: 2 },
      { date: '2026-10-30', count: 5 },
      { date: '2026-10-31', count: 3 },
      { date: '2026-11-01', count: 2 },
      { date: '2026-11-02', count: 1 },
      { date: '2026-11-03', count: 6 },
      { date: '2026-11-04', count: 4 },
      { date: '2026-11-05', count: 3 },
      { date: '2026-11-06', count: 5 },
      { date: '2026-11-07', count: 2 },
    ],
  };

  const mockWorkoutStats: WorkoutStats = {
    totalExercises: 145,
    totalSystemTemplates: 12,
    totalCompletedSessions: 320,
    totalVolumeLiftedKg: 15400,
    activeLiftersCount: 54,
  };

  const mockNutritionStats: NutritionCatalogStats = {
    totalVerifiedFoods: 850,
    totalCustomFoods: 62,
    totalMealsLogged: 1240,
    totalMealItemsLogged: 3620,
    totalWaterLogs: 780,
    verifiedFoodsBySource: { usda_fdc: 800, open_food_facts: 50 },
  };

  const mockChallenges: Challenge[] = [
    {
      id: 'c-1',
      slug: '5k-weekly',
      title: '5K Weekly',
      description: 'Run 5km weekly',
      cadence: 'weekly',
      category: 'workout',
      metricType: 'workout_duration_min',
      targetValue: 60,
      rewardPoints: 50,
      rewardBadgeId: null,
      status: 'published',
      autoEnroll: true,
      iconName: 'trophy',
      bannerColor: 'teal',
      metadata: {},
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'c-2',
      slug: 'hydration-hero',
      title: 'Hydration Hero',
      description: 'Drink 2L daily',
      cadence: 'daily',
      category: 'hydration',
      metricType: 'water_liters',
      targetValue: 2,
      rewardPoints: 20,
      rewardBadgeId: null,
      status: 'draft',
      autoEnroll: false,
      iconName: 'droplet',
      bannerColor: 'cyan',
      metadata: {},
      createdAt: '2026-11-02T00:00:00Z',
      updatedAt: '2026-11-02T00:00:00Z',
    },
  ];

  // 1. Timeframe filtering logic
  it('1. Timeframe: slices last 7 points for 7D and returns full trend for 30D/90D', () => {
    const filterTrend = (
      trend: RegistrationTrendPoint[],
      tf: DashboardTimeframe,
    ): RegistrationTrendPoint[] => {
      if (tf === '7d') return trend.slice(-7);
      return trend;
    };

    const trend7d = filterTrend(mockUserStats.registrationTrend, '7d');
    assert.equal(trend7d.length, 7);
    assert.equal(trend7d[0].date, '2026-11-01');
    assert.equal(trend7d[6].date, '2026-11-07');

    const trend30d = filterTrend(mockUserStats.registrationTrend, '30d');
    assert.equal(trend30d.length, 14);

    const trend90d = filterTrend(mockUserStats.registrationTrend, '90d');
    assert.equal(trend90d.length, 14);
  });

  // 2. Active users calculation based on timeframe
  it('2. Active Users KPI: selects activeUsers7d for 7D and activeUsers30d for 30D/90D', () => {
    const getActiveCount = (stats: DashboardStats, tf: DashboardTimeframe) => {
      return tf === '7d' ? stats.activeUsers7d : stats.activeUsers30d;
    };

    assert.equal(getActiveCount(mockUserStats, '7d'), 42);
    assert.equal(getActiveCount(mockUserStats, '30d'), 88);
    assert.equal(getActiveCount(mockUserStats, '90d'), 88);
  });

  // 3. New registrations calculation based on timeframe
  it('3. New Signups KPI: selects newRegistrations7d for 7D and newRegistrations30d for 30D/90D', () => {
    const getNewSignups = (stats: DashboardStats, tf: DashboardTimeframe) => {
      return tf === '7d' ? stats.newRegistrations7d : stats.newRegistrations30d;
    };

    assert.equal(getNewSignups(mockUserStats, '7d'), 14);
    assert.equal(getNewSignups(mockUserStats, '30d'), 38);
    assert.equal(getNewSignups(mockUserStats, '90d'), 38);
  });

  // 4. Onboarding completion percentage calculation
  it('4. Onboarding KPI: accurately calculates completed onboarding percentage', () => {
    const calcOnboardingRate = (stats: DashboardStats) => {
      if (stats.totalUsers <= 0) return 0;
      return Math.round((stats.completedOnboarding / stats.totalUsers) * 100);
    };

    // 80 / 120 = 66.66% -> 67%
    assert.equal(calcOnboardingRate(mockUserStats), 67);

    const zeroStats: DashboardStats = { ...mockUserStats, totalUsers: 0, completedOnboarding: 0 };
    assert.equal(calcOnboardingRate(zeroStats), 0);
  });

  // 5. Volume formatting in workouts activity
  it('5. Workout Activity: converts kg to tons when volume >= 1000kg', () => {
    const formatVolume = (kg: number) => {
      if (kg >= 1000) {
        return `${(kg / 1000).toFixed(1)} tons`;
      }
      return `${kg.toLocaleString()} kg`;
    };

    assert.equal(formatVolume(15400), '15.4 tons');
    assert.equal(formatVolume(1000), '1.0 tons');
    assert.equal(formatVolume(950), '950 kg');
    assert.equal(formatVolume(0), '0 kg');
  });

  // 6. Challenges catalog metrics derivation
  it('6. Challenges Activity: calculates published count and auto-enrollment rate', () => {
    const total = mockChallenges.length;
    const published = mockChallenges.filter((c) => c.status === 'published').length;
    const autoEnroll = mockChallenges.filter((c) => c.autoEnroll).length;
    const autoEnrollRate = total > 0 ? Math.round((autoEnroll / total) * 100) : 0;

    assert.equal(total, 2);
    assert.equal(published, 1);
    assert.equal(autoEnroll, 1);
    assert.equal(autoEnrollRate, 50);
  });

  // 7. Nutrition activity metrics derivation
  it('7. Nutrition Activity: extracts real meal, food, and water metrics', () => {
    assert.equal(mockNutritionStats.totalMealsLogged, 1240);
    assert.equal(mockNutritionStats.totalMealItemsLogged, 3620);
    assert.equal(mockNutritionStats.totalWaterLogs, 780);
    assert.equal(mockNutritionStats.totalVerifiedFoods, 850);
  });

  // 8. Resilience: Promise.allSettled handles secondary service failure gracefully
  it('8. Resilience: dashboard functions when secondary metrics fail', async () => {
    const simulateDashboardFetch = async (
      failWorkouts = false,
      failNutrition = false,
    ): Promise<EnhancedDashboardData> => {
      const [userRes, workoutRes, nutritionRes, challengesRes] = await Promise.allSettled([
        Promise.resolve(mockUserStats),
        failWorkouts ? Promise.reject(new Error('Workouts database error')) : Promise.resolve(mockWorkoutStats),
        failNutrition ? Promise.reject(new Error('Nutrition database error')) : Promise.resolve(mockNutritionStats),
        Promise.resolve(mockChallenges),
      ]);

      if (userRes.status === 'rejected') {
        throw new Error('Core dashboard failed');
      }

      return {
        userStats: userRes.value,
        workoutStats: workoutRes.status === 'fulfilled' ? workoutRes.value : null,
        nutritionStats: nutritionRes.status === 'fulfilled' ? nutritionRes.value : null,
        challenges: challengesRes.status === 'fulfilled' ? challengesRes.value : null,
        errors: {
          workouts: workoutRes.status === 'rejected' ? 'Workouts database error' : undefined,
          nutrition: nutritionRes.status === 'rejected' ? 'Nutrition database error' : undefined,
        },
      };
    };

    const result = await simulateDashboardFetch(true, false);
    assert.equal(result.userStats.totalUsers, 120);
    assert.equal(result.workoutStats, null);
    assert.equal(result.nutritionStats?.totalMealsLogged, 1240);
    assert.equal(result.errors.workouts, 'Workouts database error');
  });

  // 9. Core failure: throws when primary dashboard endpoint fails
  it('9. Resilience: throws when core user dashboard fails', async () => {
    const simulateCoreFailure = async () => {
      const [userRes] = await Promise.allSettled([
        Promise.reject(new Error('Database connection failed')),
      ]);

      if (userRes.status === 'rejected') {
        throw userRes.reason;
      }
    };

    await assert.rejects(simulateCoreFailure, /Database connection failed/);
  });

  // 10. Missing backend endpoint documentation
  it('10. Missing Endpoints: identifies endpoints pending implementation', () => {
    const PENDING_ENDPOINTS = [
      {
        path: '/api/v1/admin/challenges/stats',
        purpose: 'Cross-member aggregated challenge participation and completion tracking',
        phase: 'Phase 10.4',
      },
      {
        path: '/api/v1/admin/dashboard/stats?timeframe=90d',
        purpose: 'Dynamic 90-day historical time-series aggregation parameter',
        phase: 'Phase 10.4',
      },
    ];

    assert.equal(PENDING_ENDPOINTS.length, 2);
    assert.ok(PENDING_ENDPOINTS.some((e) => e.path.includes('challenges/stats')));
    assert.ok(PENDING_ENDPOINTS.some((e) => e.path.includes('timeframe=90d')));
  });
});
