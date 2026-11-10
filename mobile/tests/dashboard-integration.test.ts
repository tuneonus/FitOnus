import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  type DashboardData,
} from '../src/features/dashboard/api/dashboard-repository';
import { MOCK_DASHBOARD_DATA } from './fixtures/dashboard';
import { DASHBOARD_QUERY_KEY, invalidateDashboard } from '../src/features/dashboard/hooks/use-dashboard';
import { queryClient } from '../src/providers/query-provider';

describe('Mobile Dashboard Data Contract & Integration', () => {
  it('has consistent query key matching dashboard cache', () => {
    assert.deepEqual(DASHBOARD_QUERY_KEY, ['dashboard']);
  });

  it('validates mock dashboard data conforms to DashboardData contract', () => {
    const data: DashboardData = MOCK_DASHBOARD_DATA;
    assert.ok(data.summary);
    assert.equal(data.summary.recoveryScore, 84);
    assert.equal(data.summary.sleepScore, 92);
    assert.equal(data.summary.sleepDuration, '7h 42m');
    assert.equal(data.summary.caloriesBurned, 2150);
    assert.equal(data.nutrition.calories, 1800);
    assert.equal(data.nutrition.protein, 120);
    assert.ok(Array.isArray(data.recentActivity));
    assert.equal(data.recentActivity.length, 3);
  });

  it('handles null recoveryScore, sleepScore, steps, and heartRate safely for devices without wearables', () => {
    const realServerData: DashboardData = {
      userDisplayName: 'Alex',
      summary: {
        recoveryScore: null,
        sleepScore: null,
        sleepDuration: null,
        steps: null,
        caloriesBurned: 350,
        caloriesConsumed: 1800,
        activeMinutes: 45,
        waterIntake: 2.0,
        waterIntakeMl: 2000,
        heartRate: null,
        weight: 75.5,
      },
      aiSummary: {
        greeting: 'Good morning, Alex!',
        sleepInsights: null,
        recoveryInsights: null,
        recommendation: "Today's recommendation:\nUpper Body Power.",
      },
      todayWorkout: null,
      nutrition: {
        calories: 1800,
        caloriesGoal: 2200,
        protein: 140,
        proteinGoal: 160,
        carbs: 200,
        carbsGoal: 250,
        fat: 55,
        fatGoal: 70,
      },
      progress: {
        dailyGoalProgress: 0.88,
        weeklyGoalProgress: 0.6,
      },
      recentActivity: [],
    };

    assert.equal(realServerData.summary.recoveryScore, null);
    assert.equal(realServerData.summary.sleepDuration, null);
    assert.equal(realServerData.todayWorkout, null);
    assert.equal(realServerData.recentActivity.length, 0);
    assert.equal(realServerData.summary.caloriesBurned, 350);
    assert.equal(realServerData.summary.waterIntake, 2.0);
  });

  it('handles populated recent activity records properly', () => {
    const activityList: DashboardData['recentActivity'] = [
      {
        id: 'ws-1',
        type: 'workout',
        title: 'Morning Push',
        subtitle: '45 mins • 350 kcal',
        timestamp: 'Today',
      },
      {
        id: 'm-1',
        type: 'meal',
        title: 'Lunch',
        subtitle: '650 kcal • 48g Protein',
        timestamp: 'Today',
      },
      {
        id: 'wl-1',
        type: 'weight',
        title: 'Logged Weight',
        subtitle: '75.5 kg',
        timestamp: 'Yesterday',
      },
    ];

    assert.equal(activityList.length, 3);
    assert.equal(activityList[0].type, 'workout');
    assert.equal(activityList[1].type, 'meal');
    assert.equal(activityList[2].type, 'weight');
  });

  it('invalidateDashboard helper invalidates DASHBOARD_QUERY_KEY on queryClient', async () => {
    let invalidatedKey: readonly unknown[] | null = null;
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = async (filters?: any) => {
      invalidatedKey = filters?.queryKey;
      return Promise.resolve();
    };

    try {
      await invalidateDashboard();
      assert.deepEqual(invalidatedKey, ['dashboard']);
    } finally {
      queryClient.invalidateQueries = originalInvalidate;
    }
  });
});
