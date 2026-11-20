import { networkState } from './helpers/native-network';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../src/services/api-client';
import { queryClient } from '../src/providers/query-provider';
import { useAuthStore } from '../src/features/auth/stores/auth-store';
import { useNutritionStore } from '../src/features/nutrition/store/nutritionStore';
import { withWaterTarget } from '../src/features/nutrition/utils/daily-summary';
import {
  clampWaterGoal,
  describeWaterGoal,
  formatLitres,
  stepWaterGoal,
  WATER_GOAL_MAX_ML,
  WATER_GOAL_MIN_ML,
} from '../src/features/nutrition/utils/water-goal';
import { buildHomeNutrition } from '../src/features/home/utils/home-overview';
import type { DailyNutritionView } from '../src/features/nutrition/types/nutrition';
import {
  createFakeNutritionBackend,
  fixtureId,
  type FakeNutritionBackend,
} from './helpers/nutrition-backend-adapter';

const USER = fixtureId(1);
const DATE = '2026-11-05';

const store = () => useNutritionStore.getState();

describe('water goal helpers', () => {
  it('keeps a goal to whole 250 ml steps inside 500 - 8000 ml', () => {
    assert.equal(clampWaterGoal(2100), 2000);
    assert.equal(clampWaterGoal(2200), 2250);
    assert.equal(clampWaterGoal(100), WATER_GOAL_MIN_ML);
    assert.equal(clampWaterGoal(99_999), WATER_GOAL_MAX_ML);
    assert.equal(clampWaterGoal(Number.NaN), WATER_GOAL_MIN_ML);
  });

  it('steps up and down but never past either end', () => {
    assert.equal(stepWaterGoal(2000, 1), 2250);
    assert.equal(stepWaterGoal(2000, -1), 1750);
    assert.equal(stepWaterGoal(WATER_GOAL_MIN_ML, -1), WATER_GOAL_MIN_ML);
    assert.equal(stepWaterGoal(WATER_GOAL_MAX_ML, 1), WATER_GOAL_MAX_ML);
  });

  it('says honestly where the goal came from', () => {
    const base = { calories: null, proteinG: null, carbsG: null, fatG: null };
    assert.match(describeWaterGoal(null), /No daily goal/);
    assert.match(describeWaterGoal({ ...base, waterMl: null }), /No daily goal/);
    assert.match(describeWaterGoal({ ...base, waterMl: 2800, waterSource: 'estimated' }), /Estimated from your weight \(35 ml per kg\)/);
    assert.match(describeWaterGoal({ ...base, waterMl: 3000, waterSource: 'saved' }), /Your own/);
  });

  it('writes litres without trailing noise', () => {
    assert.equal(formatLitres(2500).replace(/\s/g, ''), '2.5L');
    assert.equal(formatLitres(2000).replace(/\s/g, ''), '2L');
  });

  it('withWaterTarget changes the goal and what is left of it, and leaves the rest alone', () => {
    const summary: DailyNutritionView = {
      date: DATE,
      targets: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60, waterMl: 2800, waterSource: 'estimated' },
      consumed: { calories: 500, proteinG: 30, carbsG: 50, fatG: 10, fiberG: 5, waterMl: 1000 },
      remaining: { calories: 1500, proteinG: 120, carbsG: 150, fatG: 50, fiberG: 0, waterMl: 1800 },
      meals: [],
      waterEntries: [],
    };

    const updated = withWaterTarget(summary, { targetMl: 3000, source: 'saved' });

    assert.equal(updated.targets?.waterMl, 3000);
    assert.equal(updated.targets?.waterSource, 'saved');
    assert.equal(updated.remaining?.waterMl, 2000);
    assert.equal(updated.targets?.calories, 2000);
    assert.equal(updated.remaining?.calories, 1500);
    // Already past the goal: nothing left, never negative.
    assert.equal(withWaterTarget(summary, { targetMl: 800, source: 'saved' }).remaining?.waterMl, 0);
  });
});

describe('water goal and unified targets: mobile store against the real backend rules', () => {
  const originals = {
    adapter: apiClient.defaults.adapter,
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
    removeItem: AsyncStorage.removeItem,
  };
  const storage = new Map<string, string>();
  let backend: FakeNutritionBackend;

  beforeEach(async () => {
    networkState.isConnected = true;
    networkState.isInternetReachable = true;
    useAuthStore
      .getState()
      .setAuth({ id: USER, name: 'Tester', email: 'tester@example.test', isEmailVerified: true });
    storage.clear();
    AsyncStorage.getItem = async (key) => storage.get(key) ?? null;
    AsyncStorage.setItem = async (key, value) => {
      storage.set(key, value);
    };
    AsyncStorage.removeItem = async (key) => {
      storage.delete(key);
    };
    backend = createFakeNutritionBackend(USER);
    apiClient.defaults.adapter = backend.adapter as never;
    queryClient.clear();
    store().setSelectedDate(DATE);
    await new Promise((resolve) => setTimeout(resolve, 15));
  });

  afterEach(() => {
    apiClient.defaults.adapter = originals.adapter;
    AsyncStorage.getItem = originals.getItem;
    AsyncStorage.setItem = originals.setItem;
    AsyncStorage.removeItem = originals.removeItem;
  });

  it('a member nothing is known about has no goals at all (nothing is invented)', async () => {
    await store().fetchDailyNutrition(DATE, true);

    assert.equal(store().dailySummary?.targets, null);
    const home = buildHomeNutrition({
      date: DATE,
      summary: store().dailySummary,
      cachedSummary: null,
      entries: [],
      selectedDate: DATE,
      waterMl: 0,
    });
    assert.equal(home.goals.waterMl, null);
    assert.equal(home.goals.kcal, null);
  });

  it('starts from 35 ml per kg of body weight and says it is an estimate', async () => {
    backend.profile.weightKg = 80;

    await store().fetchDailyNutrition(DATE, true);

    const targets = store().dailySummary?.targets;
    assert.equal(targets?.waterMl, 2800);
    assert.equal(targets?.waterSource, 'estimated');
  });

  it('saving a goal wins over the estimate, and clearing it goes back to the estimate', async () => {
    backend.profile.weightKg = 80;
    await store().fetchDailyNutrition(DATE, true);

    await store().setWaterTarget(3250);
    assert.equal(store().dailySummary?.targets?.waterMl, 3250);
    assert.equal(store().dailySummary?.targets?.waterSource, 'saved');
    assert.ok(backend.requests.includes('PUT /nutrition/water-target'));

    // The same answer comes back from the server on the next read (nothing was only local).
    await store().fetchDailyNutrition(DATE, true);
    assert.equal(store().dailySummary?.targets?.waterMl, 3250);

    await store().setWaterTarget(null);
    assert.equal(store().dailySummary?.targets?.waterMl, 2800);
    assert.equal(store().dailySummary?.targets?.waterSource, 'estimated');
  });

  it('the home goal follows the saved water goal', async () => {
    backend.profile.weightKg = 80;
    await store().fetchDailyNutrition(DATE, true);
    await store().setWaterTarget(4000);

    const home = buildHomeNutrition({
      date: DATE,
      summary: store().dailySummary,
      cachedSummary: null,
      entries: [],
      selectedDate: DATE,
      waterMl: 0,
    });
    assert.equal(home.goals.waterMl, 4000);
  });

  it('a goal the backend refuses leaves the one in effect untouched', async () => {
    backend.profile.weightKg = 80;
    await store().fetchDailyNutrition(DATE, true);

    await assert.rejects(store().setWaterTarget(20_000));

    assert.equal(store().dailySummary?.targets?.waterMl, 2800);
    assert.equal(backend.profile.savedWaterTargetMl, null);
  });

  it('calories, protein, carbs and fat all come from the one resolver, saved or estimated', async () => {
    backend.profile.savedCalorieTarget = 2100;
    backend.profile.savedProteinGrams = 160;
    await store().fetchDailyNutrition(DATE, true);

    const saved = store().dailySummary?.targets;
    assert.deepEqual(
      [saved?.calories, saved?.proteinG, saved?.carbsG, saved?.fatG, saved?.source],
      [2100, 160, 235, 58, 'saved'],
    );

    // Nothing saved: the same four numbers are worked out from the profile.
    backend.profile.savedCalorieTarget = null;
    backend.profile.savedProteinGrams = null;
    Object.assign(backend.profile, {
      weightKg: 80,
      heightCm: 180,
      age: 30,
      sex: 'male',
      primaryGoal: 'maintain',
      workoutDaysPerWeek: 4,
    });
    await store().fetchDailyNutrition(DATE, true);

    const estimated = store().dailySummary?.targets;
    assert.equal(estimated?.source, 'estimated');
    assert.equal(estimated?.calories, 2759);
    assert.equal(estimated?.proteinG, 128);
    assert.ok((estimated?.carbsG ?? 0) > 0 && (estimated?.fatG ?? 0) > 0);

    const home = buildHomeNutrition({
      date: DATE,
      summary: store().dailySummary,
      cachedSummary: null,
      entries: [],
      selectedDate: DATE,
      waterMl: 0,
    });
    assert.deepEqual(
      [home.goals.kcal, home.goals.protein, home.goals.carbs, home.goals.fat],
      [estimated?.calories, estimated?.proteinG, estimated?.carbsG, estimated?.fatG],
    );
  });
});
