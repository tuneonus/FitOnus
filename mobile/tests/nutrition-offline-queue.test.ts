import { networkState } from './helpers/native-network';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../src/services/api-client';
import { queryClient } from '../src/providers/query-provider';
import { useAuthStore } from '../src/features/auth/stores/auth-store';
import { useNutritionStore } from '../src/features/nutrition/store/nutritionStore';
import { nutritionOfflineSync } from '../src/features/nutrition/services/nutrition-offline-sync';
import { classifySyncFailure, rejectionReason } from '../src/features/nutrition/utils/sync-failure';
import { describeRejectedEntry } from '../src/features/nutrition/utils/rejected-entry';
import type { LogMealInput, LogWaterInput } from '../src/features/nutrition/types/nutrition';
import {
  createFakeNutritionBackend,
  fixtureId,
  type FakeNutritionBackend,
} from './helpers/nutrition-backend-adapter';

const USER = fixtureId(1);
const DATE = '2026-11-05';
const water = (n: number, amountMl = 250): LogWaterInput => ({
  id: fixtureId(100 + n),
  date: DATE,
  amountMl,
});
const meal = (n: number): LogMealInput => ({
  id: fixtureId(200 + n),
  mealType: 'lunch',
  date: DATE,
  items: [
    {
      foodName: 'Dal',
      foodBrand: 'AI Estimate',
      servingSize: 1,
      servingUnit: 'bowl',
      servingWeightG: 200,
      servingMultiplier: 1,
      loggedWeightG: 200,
      calories: 150,
      proteinG: 9,
      carbsG: 20,
      fatG: 3,
      fiberG: 4,
    },
  ],
});

describe('classifySyncFailure', () => {
  it('keeps an entry queued when the attempt failed, not the entry', () => {
    for (const status of [undefined, 500, 502, 503, 504, 401, 403, 408, 425, 429]) {
      assert.equal(classifySyncFailure(status), 'retry', `status ${status}`);
    }
  });

  it('refuses an entry the server rejected for good', () => {
    for (const status of [400, 404, 410, 413, 415, 422]) {
      assert.equal(classifySyncFailure(status), 'rejected', `status ${status}`);
    }
  });

  it('gives a short readable reason, never an unbounded server message', () => {
    assert.equal(rejectionReason(422, 'Water amount is too large'), 'Water amount is too large');
    assert.equal(rejectionReason(400, '  '), 'The server refused this entry (error 400).');
    assert.equal(rejectionReason(400, undefined), 'The server refused this entry (error 400).');
    assert.ok(rejectionReason(400, 'x'.repeat(500)).length <= 160);
  });
});

describe('offline nutrition queue: permanent 4xx errors', () => {
  const originals = {
    adapter: apiClient.defaults.adapter,
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
    removeItem: AsyncStorage.removeItem,
  };
  const storage = new Map<string, string>();
  let backend: FakeNutritionBackend;

  beforeEach(() => {
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
  });

  afterEach(() => {
    apiClient.defaults.adapter = originals.adapter;
    AsyncStorage.getItem = originals.getItem;
    AsyncStorage.setItem = originals.setItem;
    AsyncStorage.removeItem = originals.removeItem;
  });

  it('an entry the backend refuses is kept in the rejected list with its reason, not silently dropped', async () => {
    // 20,000 ml is over the 10,000 ml the real backend accepts for one entry: a permanent 400.
    await nutritionOfflineSync.enqueueWater(water(1, 20_000));

    const result = await nutritionOfflineSync.syncAllPending();

    assert.deepEqual(result, { syncedMeals: 0, syncedWater: 0, remaining: 0, rejected: 1 });
    assert.equal((await nutritionOfflineSync.getPendingWater()).length, 0);
    const rejected = await nutritionOfflineSync.getRejected();
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]?.kind, 'water');
    assert.equal(rejected[0]?.id, fixtureId(101));
    assert.equal(rejected[0]?.status, 400);
    assert.ok((rejected[0]?.reason ?? '').length > 0);
    // What the member logged is still there, whole.
    assert.equal((rejected[0]?.payload as LogWaterInput).amountMl, 20_000);
  });

  it('a refused meal is kept too, and does not hold up the entries behind it', async () => {
    await nutritionOfflineSync.enqueueMeal(meal(1));
    await nutritionOfflineSync.enqueueMeal(meal(2));
    backend.failNext('post', /\/nutrition\/meals$/, 422);

    const result = await nutritionOfflineSync.syncAllPending();

    assert.equal(result.rejected, 1);
    assert.equal(result.syncedMeals, 1);
    assert.equal(result.remaining, 0);
    assert.deepEqual(
      (await nutritionOfflineSync.getRejected()).map((entry) => [entry.kind, entry.id, entry.status]),
      [['meal', fixtureId(201), 422]],
    );
    assert.ok(backend.meals.has(fixtureId(202)), 'the entry behind the refused one was saved');
  });

  it('a failed attempt is not a refusal: server errors keep the entry queued for the next try', async () => {
    await nutritionOfflineSync.enqueueWater(water(1));
    backend.failNext('post', /\/nutrition\/water$/, 500);

    const first = await nutritionOfflineSync.syncAllPending();

    assert.deepEqual(first, { syncedMeals: 0, syncedWater: 0, remaining: 1, rejected: 0 });
    const queued = await nutritionOfflineSync.getPendingWater();
    assert.equal(queued.length, 1);
    assert.equal(queued[0]?.retryCount, 1);
    assert.deepEqual(await nutritionOfflineSync.getRejected(), []);

    const second = await nutritionOfflineSync.syncAllPending();
    assert.equal(second.syncedWater, 1);
    assert.equal(backend.water.size, 1);
  });

  // 401 is left out on purpose: the real API client ends the session on it and the sync run is abandoned with the
  // queue untouched (SessionChangedError). `classifySyncFailure` above pins that a 401 would be kept anyway.
  for (const status of [403, 408, 429]) {
    it(`${status} is about the account or timing, not the entry: it stays queued`, async () => {
      await nutritionOfflineSync.enqueueWater(water(1));
      backend.failNext('post', /\/nutrition\/water$/, status);

      const result = await nutritionOfflineSync.syncAllPending();

      assert.equal(result.remaining, 1);
      assert.equal(result.rejected, 0);
      assert.deepEqual(await nutritionOfflineSync.getRejected(), []);
    });
  }

  it('"Try again" puts a refused entry back in the queue and it saves once the server accepts it', async () => {
    await nutritionOfflineSync.enqueueWater(water(1));
    backend.failNext('post', /\/nutrition\/water$/, 422);
    await nutritionOfflineSync.syncAllPending();
    assert.equal((await nutritionOfflineSync.getRejected()).length, 1);

    await nutritionOfflineSync.retryRejected('water', fixtureId(101));

    assert.deepEqual(await nutritionOfflineSync.getRejected(), []);
    assert.equal((await nutritionOfflineSync.getPendingWater()).length, 1);
    const result = await nutritionOfflineSync.syncAllPending();
    assert.equal(result.syncedWater, 1);
    assert.equal(backend.water.get(fixtureId(101))?.amountMl, 250);
  });

  it('"Remove" forgets only that entry', async () => {
    await nutritionOfflineSync.enqueueWater(water(1, 20_000));
    await nutritionOfflineSync.enqueueWater(water(2, 30_000));
    await nutritionOfflineSync.syncAllPending();
    assert.equal((await nutritionOfflineSync.getRejected()).length, 2);

    await nutritionOfflineSync.dismissRejected('water', fixtureId(101));

    assert.deepEqual(
      (await nutritionOfflineSync.getRejected()).map((entry) => entry.id),
      [fixtureId(102)],
    );
  });

  it('a refused entry that is refused again replaces itself instead of piling up', async () => {
    await nutritionOfflineSync.enqueueWater(water(1, 20_000));
    await nutritionOfflineSync.syncAllPending();
    await nutritionOfflineSync.retryRejected('water', fixtureId(101));
    await nutritionOfflineSync.syncAllPending();

    assert.equal((await nutritionOfflineSync.getRejected()).length, 1);
  });

  it('keeps only the newest 50 refused entries', async () => {
    for (let n = 0; n < 55; n++) await nutritionOfflineSync.enqueueWater(water(n, 20_000 + n));
    await nutritionOfflineSync.syncAllPending();

    const rejected = await nutritionOfflineSync.getRejected();
    assert.equal(rejected.length, 50);
    assert.equal(rejected.at(-1)?.id, fixtureId(154));
  });

  it('the store shows the refused entries, and removing one updates it', async () => {
    await nutritionOfflineSync.enqueueWater(water(1, 20_000));
    await nutritionOfflineSync.syncAllPending();

    await useNutritionStore.getState().refreshPendingSyncCount();
    assert.equal(useNutritionStore.getState().rejectedEntries.length, 1);

    await useNutritionStore.getState().dismissRejectedEntry('water', fixtureId(101));
    assert.equal(useNutritionStore.getState().rejectedEntries.length, 0);
  });

  it('logging out clears the refused entries along with the queues', async () => {
    await nutritionOfflineSync.enqueueWater(water(1, 20_000));
    await nutritionOfflineSync.syncAllPending();

    await nutritionOfflineSync.clearAllQueues();

    assert.deepEqual(await nutritionOfflineSync.getRejected(), []);
  });

  it('describes a refused entry in words the member recognises', () => {
    const base = { rejectedAt: '2026-11-05T10:00:00.000Z', status: 400, reason: 'x' };
    assert.equal(
      describeRejectedEntry({ ...base, kind: 'water', id: 'w', payload: water(1, 500) }),
      'Water · 500 ml',
    );
    assert.equal(
      describeRejectedEntry({ ...base, kind: 'meal', id: 'm', payload: meal(1) }),
      'Lunch · Dal',
    );
  });
});
