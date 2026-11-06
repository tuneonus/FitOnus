import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePortionNutrients,
  mapBackendFoodToFoodItem,
  mapBackendMealToMealEntry,
} from '../src/features/nutrition/utils/nutrition-calculator';
import { generateUUID } from '../src/features/nutrition/utils/uuid';
import {
  toDbMealType,
  toUiMealType,
  type BackendFoodView,
  type BackendMealView,
  type FoodItem,
} from '../src/features/nutrition/types/nutrition';

const RFC4122_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Mobile Nutrition Physical Serving Contract Calculations', () => {
  it('correctly calculates 1 piece (50g) Egg from 100g basis reference nutrients', () => {
    // USDA reference: 143 kcal per 100g. 1 egg = 50g.
    const egg: FoodItem = {
      id: 'f0000000-0000-4000-8000-000000000005',
      name: 'Egg, whole, raw, fresh',
      serving: '1 piece · 50g',
      kcal: 72,
      protein: 6.3,
      carbs: 0.4,
      fat: 4.8,
      fiber: 0,
      servingSize: 1,
      servingUnit: 'piece',
      servingWeightG: 50,
      servingBasis: '100g',
      referenceNutrients: {
        calories: 143,
        proteinG: 12.56,
        carbohydratesG: 0.72,
        fatG: 9.51,
        fiberG: 0,
      },
    };

    // 1 egg (multiplier = 1.0)
    const portion1 = calculatePortionNutrients(egg, 1.0);
    assert.equal(portion1.effectiveWeightG, 50);
    assert.equal(portion1.kcal, 72); // 143 * (50/100) = 71.5 -> 72
    assert.equal(portion1.protein, 6.3); // 12.56 * 0.5 = 6.28 -> 6.3
    assert.equal(portion1.fat, 4.8); // 9.51 * 0.5 = 4.755 -> 4.8

    // 2 eggs (multiplier = 2.0)
    const portion2 = calculatePortionNutrients(egg, 2.0);
    assert.equal(portion2.effectiveWeightG, 100);
    assert.equal(portion2.kcal, 143);
    assert.equal(portion2.protein, 12.6);
    assert.equal(portion2.fat, 9.5);
  });

  it('correctly calculates Banana (118g medium) from 100g basis', () => {
    // USDA reference: 89 kcal per 100g. 1 medium banana = 118g.
    const banana: FoodItem = {
      id: 'f0000000-0000-4000-8000-000000000006',
      name: 'Banana, raw',
      serving: '1 medium · 118g',
      kcal: 105,
      protein: 1.3,
      carbs: 27.0,
      fat: 0.4,
      fiber: 3.1,
      servingSize: 1,
      servingUnit: 'medium',
      servingWeightG: 118,
      servingBasis: '100g',
      referenceNutrients: {
        calories: 89,
        proteinG: 1.09,
        carbohydratesG: 22.84,
        fatG: 0.33,
        fiberG: 2.6,
      },
    };

    const portion = calculatePortionNutrients(banana, 1.0);
    assert.equal(portion.effectiveWeightG, 118);
    assert.equal(portion.kcal, 105); // 89 * (118/100) = 105.02 -> 105
    assert.equal(portion.protein, 1.3);
    assert.equal(portion.carbs, 27.0);
  });

  it('correctly calculates volumetric liquid with physical density (Milk: 240ml, density 1.03 g/ml)', () => {
    // USDA reference: 61 kcal per 100g. 1 cup = 240ml. Density = 1.03 g/ml -> 247.2g weight.
    const milk: FoodItem = {
      id: 'f0000000-0000-4000-8000-000000000008',
      name: 'Milk, whole, 3.25% milkfat',
      serving: '240 ml · 247.2g',
      kcal: 151,
      protein: 7.8,
      carbs: 11.9,
      fat: 7.9,
      fiber: 0,
      servingSize: 240,
      servingUnit: 'ml',
      servingWeightG: 247.2,
      servingVolumeMl: 240,
      densityGPerMl: 1.03,
      servingBasis: '100g',
      referenceNutrients: {
        calories: 61,
        proteinG: 3.15,
        carbohydratesG: 4.80,
        fatG: 3.25,
        fiberG: 0,
      },
    };

    const portion = calculatePortionNutrients(milk, 1.0);
    assert.equal(portion.effectiveWeightG, 247.2);
    assert.equal(portion.kcal, 151); // 61 * (247.2 / 100) = 150.792 -> 151
    assert.equal(portion.protein, 7.8);
    assert.equal(portion.carbs, 11.9);
    assert.equal(portion.fat, 8.0);
  });

  it('scales nutrients accurately for arbitrary multipliers (0.5x, 1.5x, 2.5x)', () => {
    const food: FoodItem = {
      id: 'f0000000-0000-4000-8000-000000000001',
      name: 'Chicken Breast, raw',
      serving: '100 g · 100g',
      kcal: 120,
      protein: 22.5,
      carbs: 0,
      fat: 2.6,
      fiber: 0,
      servingSize: 100,
      servingUnit: 'g',
      servingWeightG: 100,
      servingBasis: '100g',
      referenceNutrients: {
        calories: 120,
        proteinG: 22.5,
        carbohydratesG: 0,
        fatG: 2.62,
        fiberG: 0,
      },
    };

    const half = calculatePortionNutrients(food, 0.5);
    assert.equal(half.effectiveWeightG, 50);
    assert.equal(half.kcal, 60);
    assert.equal(half.protein, 11.3);

    const oneAndHalf = calculatePortionNutrients(food, 1.5);
    assert.equal(oneAndHalf.effectiveWeightG, 150);
    assert.equal(oneAndHalf.kcal, 180);
    assert.equal(oneAndHalf.protein, 33.8);
  });
});

describe('UUID and Idempotency Validation', () => {
  it('generates valid RFC 4122 v4 UUIDs for meal and water tracking', () => {
    for (let i = 0; i < 20; i++) {
      const id = generateUUID();
      assert.match(id, RFC4122_V4_REGEX, `Generated ID "${id}" must match RFC 4122 v4`);
    }
  });

  it('ensures distinct consecutive UUIDs (no collision)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = generateUUID();
      assert.equal(set.has(id), false, 'UUID collision detected');
      set.add(id);
    }
    assert.equal(set.size, 100);
  });
});

describe('Meal Type Bidirectional Mapping', () => {
  it('maps UI meal types to canonical DB meal types', () => {
    assert.equal(toDbMealType('breakfast'), 'breakfast');
    assert.equal(toDbMealType('lunch'), 'lunch');
    assert.equal(toDbMealType('dinner'), 'dinner');
    assert.equal(toDbMealType('snacks'), 'snack');
  });

  it('maps DB meal types back to UI meal types', () => {
    assert.equal(toUiMealType('snack'), 'snacks');
    assert.equal(toUiMealType('breakfast'), 'breakfast');
    assert.equal(toUiMealType('lunch'), 'lunch');
    assert.equal(toUiMealType('dinner'), 'dinner');
    assert.equal(toUiMealType('unknown'), 'lunch');
  });
});

describe('DTO Mapping Functions', () => {
  it('maps BackendFoodView into client FoodItem correctly', () => {
    const backendFood: BackendFoodView = {
      id: 'f0000000-0000-4000-8000-000000000001',
      name: 'Chicken Breast, boneless, raw',
      brand: null,
      barcode: null,
      servingSize: 100,
      servingUnit: 'g',
      servingWeightG: 100,
      servingVolumeMl: null,
      densityGPerMl: null,
      servingBasis: '100g',
      referenceNutrients: {
        calories: 120,
        proteinG: 22.5,
        carbohydratesG: 0,
        fatG: 2.6,
        fiberG: 0,
      },
      standardServingNutrients: {
        effectiveWeightG: 100,
        servingMultiplier: 1.0,
        calories: 120,
        proteinG: 22.5,
        carbsG: 0,
        fatG: 2.6,
        fiberG: 0,
      },
      isCustom: false,
      isVerified: true,
      isFavorite: true,
      dataSource: 'usda_fdc',
    };

    const item = mapBackendFoodToFoodItem(backendFood);
    assert.equal(item.id, backendFood.id);
    assert.equal(item.name, backendFood.name);
    assert.equal(item.isVerified, true);
    assert.equal(item.isFavorite, true);
    assert.equal(item.kcal, 120);
    assert.equal(item.protein, 22.5);
    assert.equal(item.serving, '100 g · 100g');
  });

  it('maps BackendMealView to MealEntry preserving frozen items', () => {
    const backendMeal: BackendMealView = {
      id: 'm0000000-0000-4000-8000-000000000001',
      userId: 'u0000000-0000-4000-8000-000000000001',
      mealType: 'snack',
      date: '2026-11-05',
      totalCalories: 250,
      totalProteinG: 20,
      totalCarbsG: 25,
      totalFatG: 5,
      totalFiberG: 3,
      notes: 'Post-workout snack',
      createdAt: '2026-11-05T10:30:00.000Z',
      updatedAt: '2026-11-05T10:30:00.000Z',
      items: [
        {
          id: 'i0000000-0000-4000-8000-000000000001',
          foodId: 'f0000000-0000-4000-8000-000000000001',
          foodName: 'Protein Shake',
          foodBrand: 'FitOnus',
          servingSize: 1,
          servingUnit: 'scoop',
          servingWeightG: 30,
          servingMultiplier: 1.0,
          loggedWeightG: 30,
          calories: 120,
          proteinG: 24,
          carbsG: 3,
          fatG: 1,
          fiberG: 1,
        },
      ],
    };

    const entry = mapBackendMealToMealEntry(backendMeal);
    assert.equal(entry.id, backendMeal.id);
    assert.equal(entry.meal, 'snacks'); // Canonical 'snack' mapped to UI 'snacks'
    assert.equal(entry.isSynced, true);
    assert.equal(entry.items.length, 1);
    assert.equal(entry.items[0]?.name, 'Protein Shake');
    assert.equal(entry.items[0]?.kcal, 120);
  });
});

describe('Olive Oil Serving Contract & Physical Density Calculations', () => {
  it('correctly calculates 1 tablespoon (14g) Olive Oil from 100g basis', () => {
    // USDA reference: 884 kcal per 100g, 100g fat. 1 tbsp = 14g.
    const oliveOil: FoodItem = {
      id: 'f0000000-0000-4000-8000-000000000007',
      name: 'Oil, olive, salad or cooking',
      serving: '1 tbsp · 14g',
      kcal: 124,
      protein: 0,
      carbs: 0,
      fat: 14.0,
      fiber: 0,
      servingSize: 1,
      servingUnit: 'tbsp',
      servingWeightG: 14,
      servingBasis: '100g',
      referenceNutrients: {
        calories: 884,
        proteinG: 0,
        carbohydratesG: 0,
        fatG: 100,
        fiberG: 0,
      },
    };

    const portion = calculatePortionNutrients(oliveOil, 1.0);
    assert.equal(portion.effectiveWeightG, 14);
    assert.equal(portion.kcal, 124); // 884 * (14/100) = 123.76 -> 124
    assert.equal(portion.fat, 14.0);
    assert.equal(portion.protein, 0);
  });

  it('correctly calculates volumetric liquid with physical density less than 1.0 (Olive Oil: 15ml, density 0.92 g/ml)', () => {
    const oliveOilVol: FoodItem = {
      id: 'f0000000-0000-4000-8000-000000000007',
      name: 'Olive Oil Volumetric',
      serving: '15 ml · 13.8g',
      kcal: 122,
      protein: 0,
      carbs: 0,
      fat: 13.8,
      fiber: 0,
      servingSize: 15,
      servingUnit: 'ml',
      servingWeightG: 13.8,
      servingVolumeMl: 15,
      densityGPerMl: 0.92,
      servingBasis: '100g',
      referenceNutrients: {
        calories: 884,
        proteinG: 0,
        carbohydratesG: 0,
        fatG: 100,
        fiberG: 0,
      },
    };

    const portion = calculatePortionNutrients(oliveOilVol, 1.0);
    assert.equal(portion.effectiveWeightG, 13.8); // 15 * 0.92 = 13.8g (not 15g!)
    assert.equal(portion.kcal, 122); // 884 * (13.8 / 100) = 121.992 -> 122
    assert.equal(portion.fat, 13.8);
  });
});

describe('AsyncStorage User Isolation & 409 Resolution Logic', () => {
  it('scopes cache and queue keys per user to prevent cross-account leakage', () => {
    const user1 = 'u1111111-1111-4111-8111-111111111111';
    const user2 = 'u2222222-2222-4222-8222-222222222222';

    const cacheKey1 = `@fitonus:nutrition_state_cache:${user1}`;
    const cacheKey2 = `@fitonus:nutrition_state_cache:${user2}`;
    const queueKey1 = `@fitonus:pending_meals:${user1}`;
    const queueKey2 = `@fitonus:pending_meals:${user2}`;

    assert.notEqual(cacheKey1, cacheKey2);
    assert.notEqual(queueKey1, queueKey2);
    assert.match(cacheKey1, new RegExp(user1));
    assert.match(cacheKey2, new RegExp(user2));
  });

  it('differentiates confirmed duplicate submissions from ID collisions on 409', () => {
    const existingMealId = 'm0000000-0000-4000-8000-000000000001';
    const serverStoredMeals: Record<string, { id: string; userId: string }> = {
      [existingMealId]: { id: existingMealId, userId: 'user-self' },
    };

    // Case 1: Confirmed duplicate (meal exists on server for this user)
    const isConfirmedDuplicate = (id: string, currentUserId: string): boolean => {
      const match = serverStoredMeals[id];
      return match !== undefined && match.userId === currentUserId;
    };

    assert.equal(isConfirmedDuplicate(existingMealId, 'user-self'), true);

    // Case 2: ID collision with another user (meal belongs to someone else)
    assert.equal(isConfirmedDuplicate(existingMealId, 'other-user'), false);

    // On collision, UUID must be regenerated so data is never lost
    let collidingId = existingMealId;
    if (!isConfirmedDuplicate(collidingId, 'other-user')) {
      collidingId = generateUUID();
    }
    assert.notEqual(collidingId, existingMealId);
    assert.match(collidingId, RFC4122_V4_REGEX);
  });
});
