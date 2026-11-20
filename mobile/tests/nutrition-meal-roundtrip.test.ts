import { networkState } from './helpers/native-network';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../src/services/api-client';
import { queryClient } from '../src/providers/query-provider';
import { useAuthStore } from '../src/features/auth/stores/auth-store';
import { useNutritionStore } from '../src/features/nutrition/store/nutritionStore';
import {
  mapBackendFoodToFoodItem,
  mapBackendMealToMealEntry,
  scaleFood,
} from '../src/features/nutrition/utils/nutrition-calculator';
import { toMealItemPayload } from '../src/features/nutrition/utils/meal-payload';
import { MealPhotoApi } from '../src/features/ai-coach/services/meal-photo-api';
import { LOW_CONFIDENCE_THRESHOLD } from '../src/features/nutrition/utils/detected-food';
import type {
  BackendFoodView,
  BackendMealView,
  FoodItem,
} from '../src/features/nutrition/types/nutrition';
import { Food } from '../../backend/src/modules/nutrition/domain/food';
import { Meal, MealItem } from '../../backend/src/modules/nutrition/domain/meal';
import { toMealView } from '../../backend/src/modules/nutrition/application/nutrition-view';
import {
  createFakeNutritionBackend,
  fixtureId,
  type FakeNutritionBackend,
} from './helpers/nutrition-backend-adapter';

/**
 * Mobile store + real nutrition API client + REAL backend use cases and schemas (in memory), end to end.
 * See helpers/nutrition-backend-adapter.ts for why the "server" here is the real backend logic.
 */
const USER = fixtureId(1);
const DATE = '2026-11-05';
const EGG = fixtureId(2);
const RICE = fixtureId(3);

const eggProps = {
  id: EGG,
  name: 'Egg, whole, raw',
  brand: null,
  barcode: null,
  servingSize: 1,
  servingUnit: 'piece',
  servingWeightG: 50,
  servingBasis: '100g' as const,
  calories: 143,
  proteinG: 12.56,
  carbohydratesG: 0.72,
  fatG: 9.51,
  fiberG: 0,
  dataSource: 'usda_fdc' as const,
  sourceId: '171287',
  isCustom: false,
  isVerified: true,
  verificationStatus: 'verified' as const,
  createdBy: null,
};
const riceProps = {
  ...eggProps,
  id: RICE,
  name: 'Rice, cooked',
  servingUnit: 'cup',
  servingWeightG: 150,
  calories: 130,
  proteinG: 2.7,
  carbohydratesG: 28,
  fatG: 0.3,
  fiberG: 0.4,
  sourceId: '168878',
};

const aiChicken = (confidence: 'high' | 'medium' | 'low', n: number) => ({
  id: `ai-food-1700000000000-${n}`,
  name: 'Grilled Chicken Breast',
  brand: 'AI Estimate',
  serving: '150g fillet',
  servingWeightG: 150,
  servingUnit: 'fillet',
  servingSize: 1,
  kcal: 248,
  protein: 46.5,
  carbs: 0,
  fat: 5.4,
  fiber: 0,
  confidence,
  isAiEstimated: true,
});

const store = () => useNutritionStore.getState();
/** Lets the store's fire-and-forget refresh finish, then forces a final one so the state is settled. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 15));
  await store().fetchDailyNutrition(DATE, true);
}

describe('Nutrition meal edit / delete / restore / water: mobile store against the real backend rules', () => {
  const originals = {
    adapter: apiClient.defaults.adapter,
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
    removeItem: AsyncStorage.removeItem,
  };
  const storage = new Map<string, string>();
  let backend: FakeNutritionBackend;

  const catalogItem = (id: string): FoodItem =>
    mapBackendFoodToFoodItem(backend.foodView(id) as BackendFoodView);

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
    backend.addFood(new Food(eggProps));
    backend.addFood(new Food(riceProps));
    apiClient.defaults.adapter = backend.adapter as never;
    await store().resetStore();
    useNutritionStore.setState({ selectedDate: DATE });
  });

  afterEach(() => {
    apiClient.defaults.adapter = originals.adapter;
    AsyncStorage.getItem = originals.getItem;
    AsyncStorage.setItem = originals.setItem;
    AsyncStorage.removeItem = originals.removeItem;
    useAuthStore.getState().clearAuth();
    queryClient.clear();
  });

  async function logLunch(items: FoodItem[]) {
    await store().logMeal({ mealType: 'lunch', items });
    await settle();
    const entry = store().entries[0]!;
    assert.ok(entry, 'the logged meal is in the store');
    return entry;
  }

  describe('item identity (the "Food not found" bug)', () => {
    it('a synced item carries the catalog food id and the stored item id separately', async () => {
      const entry = await logLunch([catalogItem(EGG), catalogItem(RICE)]);

      assert.deepEqual(
        entry.items.map((item) => item.foodId),
        [EGG, RICE],
      );
      for (const item of entry.items) {
        assert.notEqual(
          item.id,
          item.foodId,
          'the stored item id must never double as the food id',
        );
        assert.equal(item.mealItemId, item.id);
      }
    });

    it('removing a food from a synced meal succeeds (it used to be a 404 "Food not found")', async () => {
      const entry = await logLunch([catalogItem(EGG), catalogItem(RICE)]);

      await store().removeItem(entry.id, entry.items[1]!.id);
      await settle();

      assert.equal(store().entries[0]!.items.length, 1);
      assert.equal(backend.meals.get(entry.id)!.items.length, 1);
      assert.ok(!backend.requests.some((r) => r.startsWith('PUT') && r.endsWith('404')));
    });

    it('editing keeps the other foods exactly as they were logged, even if the catalog changed since', async () => {
      const entry = await logLunch([scaleFood(catalogItem(EGG), 2), catalogItem(RICE)]);
      const eggBefore = entry.items[0]!;
      assert.equal(eggBefore.kcal, 143);

      // An admin corrects the catalog afterwards. What was logged must not move.
      backend.addFood(new Food({ ...eggProps, calories: 999 }));
      await store().removeItem(entry.id, entry.items[1]!.id);
      await settle();

      const after = store().entries[0]!.items[0]!;
      assert.equal(after.id, eggBefore.id, 'same stored item, not a re-created one');
      assert.equal(after.kcal, 143);
      assert.equal(backend.meals.get(entry.id)!.items[0]!.calories, 143);
      assert.equal(backend.meals.get(entry.id)!.totalCalories, 143);
    });

    it('undoing a removal puts the food back and leaves the others untouched', async () => {
      const entry = await logLunch([catalogItem(EGG), catalogItem(RICE)]);
      const original = { items: entry.items, notes: entry.notes };
      const riceKcal = original.items[1]!.kcal;

      await store().removeItem(entry.id, entry.items[1]!.id);
      await settle();
      assert.equal(store().entries[0]!.items.length, 1);

      // Exactly what the Undo action in the edit sheet does.
      await store().updateMeal(entry.id, original.items, original.notes ?? undefined);
      await settle();

      const restored = store().entries[0]!;
      assert.equal(restored.items.length, 2);
      assert.equal(
        restored.items[0]!.id,
        original.items[0]!.id,
        'the kept food is the same stored item',
      );
      assert.deepEqual(
        restored.items.map((item) => item.foodId),
        [EGG, RICE],
      );
      assert.equal(restored.items[1]!.kcal, riceKcal);
      assert.equal(backend.meals.get(entry.id)!.items.length, 2);
    });

    it('a synced item read back from the server is saved with mealItemId, never its id as foodId', async () => {
      const entry = await logLunch([catalogItem(EGG)]);
      const item = entry.items[0]!;

      const payload = toMealItemPayload(item, { forUpdate: true });

      assert.equal(payload.foodId, EGG);
      assert.equal(payload.mealItemId, item.id);
      assert.notEqual(payload.foodId, payload.mealItemId);
      assert.equal(
        toMealItemPayload(item).mealItemId,
        undefined,
        'a new meal has no stored items to refer to',
      );
    });
  });

  describe('scaling (2× then 1.5×)', () => {
    it('is relative to the current portion: 2× edited by 1.5× is 3× of the base serving, same as the sheet shows', async () => {
      const entry = await logLunch([catalogItem(EGG)]);
      assert.equal(entry.items[0]!.servingMultiplier, 1);

      await store().scaleItem(entry.id, entry.items[0]!.id, 2);
      await settle();
      const atTwo = store().entries[0]!.items[0]!;
      assert.equal(atTwo.servingMultiplier, 2);
      assert.equal(atTwo.loggedWeightG, 100);
      assert.equal(atTwo.kcal, 143);

      // What the sheet previews for "1.5×" on this item...
      const preview = scaleFood(atTwo, 1.5);
      await store().scaleItem(entry.id, atTwo.id, 1.5);
      await settle();

      // ...is what the server stores: 3× of the base serving = 150 g = 214.5 kcal.
      const atThree = store().entries[0]!.items[0]!;
      assert.equal(atThree.servingMultiplier, 3);
      assert.equal(atThree.loggedWeightG, 150);
      assert.equal(atThree.kcal, 214.5);
      assert.equal(backend.meals.get(entry.id)!.totalCalories, 214.5);
      assert.equal(preview.servingMultiplier, 3);
      assert.equal(Math.round(preview.kcal), Math.round(atThree.kcal));
      assert.equal(atThree.id, atTwo.id, 'scaling edits the stored item, it does not replace it');
    });

    it('scaling back down works from the stored snapshot (3× then 0.5× is 1.5×)', async () => {
      const entry = await logLunch([scaleFood(catalogItem(EGG), 3)]);

      await store().scaleItem(entry.id, entry.items[0]!.id, 0.5);
      await settle();

      const item = store().entries[0]!.items[0]!;
      assert.equal(item.servingMultiplier, 1.5);
      assert.equal(item.loggedWeightG, 75);
      assert.equal(item.kcal, 107.3);
    });

    it('a catalog item still being chosen (not yet saved) scales from its reference nutrients', () => {
      const egg = catalogItem(EGG);
      const two = scaleFood(egg, 2);
      const three = scaleFood(two, 1.5);

      assert.equal(two.servingMultiplier, 2);
      assert.equal(three.servingMultiplier, 3);
      assert.equal(three.kcal, 215); // 150 g x 143 kcal / 100 g = 214.5, shown rounded
    });
  });

  describe('AI photo items', () => {
    it("maps the model's high/medium/low to a 0..1 score and flags the item as an estimate", async () => {
      backend.photoResponse = {
        isFood: true,
        summary: 'Grilled chicken',
        items: [aiChicken('high', 0), aiChicken('medium', 1), aiChicken('low', 2)],
        overallConfidence: 0.75,
        totalKcal: 744,
        totalProteinGrams: 139.5,
        totalCarbsGrams: 0,
        totalFatGrams: 16.2,
        totalFiberGrams: 0,
        analyzedAt: '2026-11-05T10:00:00.000Z',
      };

      const result = await MealPhotoApi.analyzeMealPhoto({ image: 'aGVsbG8=', mealType: 'lunch' });

      assert.deepEqual(
        result.items.map((item) => item.confidence),
        [0.95, 0.8, 0.6],
      );
      for (const item of result.items) {
        // The old screen did arithmetic on the word and showed "NaN% confidence".
        assert.ok(Number.isFinite(Math.round((item.confidence ?? 0) * 100)));
        assert.equal(item.estimated, true);
        assert.equal(item.foodId, null);
      }
      const flagged = result.items.map((item) => (item.confidence ?? 1) < LOW_CONFIDENCE_THRESHOLD);
      assert.deepEqual(
        flagged,
        [false, false, true],
        'only the "low" item raises the low-confidence warning',
      );
    });

    it('stays an estimate after it is saved, after a refresh and after a portion edit', async () => {
      backend.photoResponse = {
        isFood: true,
        summary: 'Grilled chicken',
        items: [aiChicken('high', 0)],
        overallConfidence: 0.9,
        totalKcal: 248,
        totalProteinGrams: 46.5,
        totalCarbsGrams: 0,
        totalFatGrams: 5.4,
        totalFiberGrams: 0,
        analyzedAt: '2026-11-05T10:00:00.000Z',
      };
      const analysis = await MealPhotoApi.analyzeMealPhoto({ image: 'aGVsbG8=' });
      assert.equal(analysis.items[0]!.estimated, true);

      const entry = await logLunch(analysis.items);
      const saved = entry.items[0]!;
      assert.equal(
        saved.estimated,
        true,
        'still labelled after the server copy replaced the local one',
      );
      assert.equal(saved.brand, 'AI Estimate');
      assert.equal(saved.foodId, null);
      assert.equal(backend.meals.get(entry.id)!.items[0]!.foodBrand, 'AI Estimate');

      await store().scaleItem(entry.id, saved.id, 1.5);
      await settle();

      const scaled = store().entries[0]!.items[0]!;
      assert.equal(scaled.estimated, true);
      assert.equal(scaled.kcal, 372); // 248 x 1.5 from the stored snapshot
      assert.equal(scaled.loggedWeightG, 225);
    });
  });

  describe('meal delete and restore', () => {
    it('deleting removes the meal and its totals at once; restoring brings back the same meal', async () => {
      const entry = await logLunch([scaleFood(catalogItem(EGG), 2), catalogItem(RICE)]);
      const totalsBefore = store().dailySummary!.consumed.calories;
      assert.ok(totalsBefore > 0);

      const removed = await store().deleteMeal(entry.id);
      assert.equal(removed.id, entry.id);
      assert.equal(store().entries.length, 0);
      assert.equal(
        store().dailySummary!.consumed.calories,
        0,
        'totals drop immediately, before any refresh',
      );
      assert.equal(
        backend.meals.get(entry.id)!.deletedAt instanceof Date,
        true,
        'soft-deleted on the server',
      );

      await settle();
      assert.equal(store().entries.length, 0);
      assert.equal(store().dailySummary!.meals.length, 0);

      await store().restoreMeal(entry.id);
      await settle();

      const back = store().entries[0]!;
      assert.equal(back.id, entry.id, 'the same meal id, not a re-created meal');
      assert.deepEqual(
        back.items.map((item) => item.id),
        entry.items.map((item) => item.id),
      );
      assert.deepEqual(
        back.items.map((item) => item.kcal),
        entry.items.map((item) => item.kcal),
      );
      assert.equal(store().dailySummary!.consumed.calories, totalsBefore);
      assert.equal(backend.meals.size, 1);
    });

    it('a failed delete puts the meal and the totals back and reports the error', async () => {
      const entry = await logLunch([catalogItem(EGG)]);
      const totalsBefore = store().dailySummary!.consumed.calories;
      backend.failNext('delete', /\/nutrition\/meals\//, 500);

      await assert.rejects(store().deleteMeal(entry.id));

      assert.equal(store().entries.length, 1);
      assert.equal(store().entries[0]!.id, entry.id);
      assert.equal(store().dailySummary!.consumed.calories, totalsBefore);
      assert.equal(
        backend.meals.get(entry.id)!.deletedAt,
        null,
        'nothing was deleted on the server',
      );
    });

    it('a retried delete that finds the meal already gone counts as deleted', async () => {
      const entry = await logLunch([catalogItem(EGG)]);
      backend.failNext('delete', /\/nutrition\/meals\//, 404);

      await store().deleteMeal(entry.id);

      assert.equal(store().entries.length, 0);
    });

    it('refuses to delete a meal that is still waiting to sync, with a clear message', async () => {
      useNutritionStore.setState({
        entries: [
          {
            id: fixtureId(99),
            meal: 'lunch',
            time: '8:00 AM',
            method: 'search',
            items: [],
            isSynced: false,
          },
        ],
      });

      await assert.rejects(store().deleteMeal(fixtureId(99)), /Sync this meal before deleting it/);
      assert.equal(store().entries.length, 1);
    });

    it('removing the last food is not allowed: the meal has to be deleted instead', async () => {
      const entry = await logLunch([catalogItem(EGG)]);

      await assert.rejects(
        store().removeItem(entry.id, entry.items[0]!.id),
        /Delete the meal instead/,
      );
      assert.equal(backend.meals.get(entry.id)!.items.length, 1);
    });
  });

  describe('water entries', () => {
    it("lists the day's entries, deletes one, and the undo logs the same entry again", async () => {
      await store().logWater(250);
      await store().logWater(500);
      await settle();
      assert.equal(store().waterMl, 750);
      const entries = store().dailySummary!.waterEntries!;
      assert.deepEqual(
        entries.map((entry) => entry.amountMl),
        [250, 500],
      );

      const target = entries[1]!;
      const removed = await store().deleteWater(target.id);
      assert.equal(removed.id, target.id);
      assert.equal(store().waterMl, 250, 'the total drops at once');
      assert.equal(store().dailySummary!.consumed.waterMl, 250);
      assert.equal(backend.water.has(target.id), false);

      await settle();
      assert.equal(store().waterMl, 250);
      assert.deepEqual(
        store().dailySummary!.waterEntries!.map((entry) => entry.id),
        [entries[0]!.id],
      );

      // Exactly what the Undo action in the water log does.
      await store().logWater(removed.amountMl, {
        id: removed.id,
        date: removed.date,
        loggedAt: removed.loggedAt,
      });
      await settle();

      assert.equal(store().waterMl, 750);
      assert.equal(backend.water.get(target.id)!.amountMl, 500);
      assert.equal(backend.water.size, 2);
      assert.ok(store().dailySummary!.waterEntries!.some((entry) => entry.id === target.id));
    });

    it('a failed delete puts the entry and the total back', async () => {
      await store().logWater(300);
      await settle();
      const target = store().dailySummary!.waterEntries![0]!;
      backend.failNext('delete', /\/nutrition\/water\//, 500);

      await assert.rejects(store().deleteWater(target.id));

      assert.equal(store().waterMl, 300);
      assert.equal(store().dailySummary!.consumed.waterMl, 300);
      assert.equal(store().dailySummary!.waterEntries!.length, 1);
      assert.equal(backend.water.has(target.id), true);
    });

    it('re-logging an entry with its id is not mistaken for a double tap', async () => {
      await store().logWater(250);
      await settle();
      const entry = store().dailySummary!.waterEntries![0]!;
      await store().deleteWater(entry.id);

      // Same amount, immediately after: a double tap would be swallowed, an explicit undo must not be.
      await store().logWater(entry.amountMl, {
        id: entry.id,
        date: entry.date,
        loggedAt: entry.loggedAt,
      });
      await settle();

      assert.equal(backend.water.has(entry.id), true);
    });
  });

  describe('exact snapshot values on the way in', () => {
    it('keeps stored decimals instead of rounding them for display', () => {
      // The JSON the real backend produces for a meal with a fractional-calorie AI item.
      const meal = toMealView(fractionalAiMeal()) as unknown as BackendMealView;

      const entry = mapBackendMealToMealEntry(meal);
      const item = entry.items[0]!;
      assert.equal(item.kcal, 107.3);
      assert.equal(item.protein, 5.24);
      assert.equal(item.estimated, true);
      assert.equal(item.foodId, null);
      assert.equal(item.loggedWeightG, 75);
    });
  });
});

function fractionalAiMeal() {
  const mealId = fixtureId(50);
  return new Meal({
    id: mealId,
    userId: USER,
    mealType: 'lunch',
    date: DATE,
    items: [
      new MealItem({
        id: fixtureId(51),
        mealId,
        foodId: null,
        foodName: 'Dosa',
        foodBrand: 'AI Voice Estimate',
        servingSize: 2,
        servingUnit: 'piece',
        servingWeightG: 100,
        servingMultiplier: 0.75,
        loggedWeightG: 75,
        calories: 107.3,
        proteinG: 5.24,
        carbsG: 12,
        fatG: 3,
        fiberG: 1,
      }),
    ],
  });
}
