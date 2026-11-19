// The native network stub must be imported before any module that reads connectivity.
import { networkState } from './helpers/native-network';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../src/features/auth/stores/auth-store';
import { useWeightStore } from '../src/features/weight-tracking/store/weightStore';
import { useProgressStore } from '../src/features/analytics/store/progressStore';
import { progressApi } from '../src/features/progress/api/progress-api';
import { resolveDailyTargets } from '../src/features/profile/utils/resolve-daily-targets';
import type {
  ProgressAnalyticsResponse,
  WeightHistoryResponse,
} from '../src/features/progress/types/progress';
import type { MetabolicMetrics } from '../src/features/profile/types/profile';

const calculated: MetabolicMetrics = {
  bmr: 1780,
  tdee: 2759,
  dailyCalorieTarget: 2259,
  dailyProteinGrams: 160,
  dailyCarbGrams: 240,
  dailyFatGrams: 63,
};

describe('Daily targets on Nutrition preferences', () => {
  it('shows the profile’s calculated targets when it has them', () => {
    assert.deepEqual(resolveDailyTargets(calculated, undefined), {
      source: 'calculated',
      calories: 2259,
      protein: 160,
      carbs: 240,
      fat: 63,
    });
  });

  it('prefers calculated targets over the dashboard’s, even saved ones', () => {
    const resolved = resolveDailyTargets(calculated, {
      caloriesGoal: 1900,
      proteinGoal: 120,
      targetsSource: 'saved',
    });

    assert.equal(resolved.source, 'calculated');
    assert.equal(resolved.calories, 2259);
  });

  it('never shows the dashboard’s placeholder goals (2200 / 150) as the user’s targets', () => {
    for (const targetsSource of ['default', 'estimated'] as const) {
      const resolved = resolveDailyTargets(null, { caloriesGoal: 2200, proteinGoal: 150, targetsSource });

      assert.deepEqual(resolved, {
        source: 'missing',
        calories: null,
        protein: null,
        carbs: null,
        fat: null,
      });
    }
  });

  it('ignores dashboard goals from a backend that does not say where they came from', () => {
    const resolved = resolveDailyTargets(undefined, { caloriesGoal: 2200, proteinGoal: 150 });

    assert.equal(resolved.source, 'missing');
    assert.equal(resolved.calories, null);
  });

  it('is missing when there is no profile and no dashboard data yet', () => {
    assert.equal(resolveDailyTargets(undefined, undefined).source, 'missing');
    assert.equal(resolveDailyTargets(null, null).source, 'missing');
  });

  it('falls back to saved calories and protein, and leaves carbs and fat unset (they are never saved)', () => {
    const resolved = resolveDailyTargets(null, { caloriesGoal: 2100, proteinGoal: 150, targetsSource: 'saved' });

    assert.deepEqual(resolved, {
      source: 'saved',
      calories: 2100,
      protein: 150,
      carbs: null,
      fat: null,
    });
  });

  it('treats zero or negative values as missing rather than showing them', () => {
    const resolved = resolveDailyTargets({ ...calculated, dailyCalorieTarget: 0 }, undefined);

    assert.equal(resolved.source, 'missing');
  });
});

describe('Weight and Progress stores with real, and with no, weight data', () => {
  const originals = {
    getWeightHistory: progressApi.getWeightHistory,
    getAnalytics: progressApi.getAnalytics,
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
  };
  const storage = new Map<string, string>();

  beforeEach(() => {
    networkState.isConnected = true;
    networkState.isInternetReachable = true;
    useAuthStore
      .getState()
      .setAuth({ id: 'new-user', name: 'New User', email: 'new@example.test', isEmailVerified: true });
    storage.clear();
    AsyncStorage.getItem = async (key) => storage.get(key) ?? null;
    AsyncStorage.setItem = async (key, value) => {
      storage.set(key, value);
    };
    useWeightStore.getState().resetStore();
    useProgressStore.getState().resetStore();
  });
  afterEach(() => {
    progressApi.getWeightHistory = originals.getWeightHistory;
    progressApi.getAnalytics = originals.getAnalytics;
    AsyncStorage.getItem = originals.getItem;
    AsyncStorage.setItem = originals.setItem;
    useAuthStore.getState().clearAuth();
  });

  it('a new account’s weight history leaves the chart and entries empty (the screens’ empty state)', async () => {
    const empty: WeightHistoryResponse = {
      summary: {
        currentWeightKg: null,
        startingWeightKg: null,
        targetWeightKg: null,
        latestLoggedAt: null,
        totalLogsCount: 0,
      },
      points: [],
      entries: [],
      total: 0,
    };
    progressApi.getWeightHistory = async () => empty;

    await useWeightStore.getState().fetchWeightHistory('W', true);

    const state = useWeightStore.getState();
    assert.deepEqual(state.points, []);
    assert.deepEqual(state.entries, []);
    assert.equal(state.goalWeight, null);
    assert.equal(state.startWeight, null);
    assert.equal(state.error, null);
  });

  it('real weight history still reaches the chart and the entry list, oldest first', async () => {
    const history: WeightHistoryResponse = {
      summary: {
        currentWeightKg: 79.6,
        startingWeightKg: 82,
        targetWeightKg: 75,
        latestLoggedAt: '2026-11-10T07:00:00Z',
        totalLogsCount: 2,
      } as WeightHistoryResponse['summary'],
      points: [
        { label: 'Mon', value: 80 },
        { label: 'Tue', value: 79.6 },
      ],
      // The API lists newest first.
      entries: [
        { id: 'b', date: 'Nov 10', value: 79, source: 'manual' },
        { id: 'a', date: 'Nov 9', value: 80, source: 'manual' },
      ] as WeightHistoryResponse['entries'],
      total: 2,
    };
    progressApi.getWeightHistory = async () => history;

    await useWeightStore.getState().fetchWeightHistory('W', true);

    const state = useWeightStore.getState();
    assert.deepEqual(state.points, history.points);
    assert.deepEqual(
      state.entries.map((e) => e.value),
      [80, 79],
    );
    assert.equal(state.goalWeight, 75);
  });

  it('a new account’s weight analytics are stored as empty, with no headline value to show', async () => {
    const empty: ProgressAnalyticsResponse = {
      metric: 'weight',
      label: 'Weight',
      unit: 'kg',
      chart: 'line',
      lowerIsBetter: true,
      hasDeviceData: true,
      firstValue: 0,
      latestValue: 0,
      delta: 0,
      points: [],
    };
    progressApi.getAnalytics = async () => empty;

    await useProgressStore.getState().fetchAnalytics('weight', 'M', true);

    const stored = useProgressStore.getState().analyticsData['weight-M'];
    assert.deepEqual(stored?.points, []);
    // The Progress screen shows "—" (not "0 kg") when there are no points and no latest value.
    assert.equal(stored?.latestValue, 0);
    assert.equal(!stored?.latestValue, true);
  });
});
