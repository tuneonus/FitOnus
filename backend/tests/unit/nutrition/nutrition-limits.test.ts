import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnitOfWork } from '../../../src/shared/application/unit-of-work.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import {
  AdminManageFoodUseCase,
  CreateCustomFoodUseCase,
  Food,
  LogMealUseCase,
  LogWaterUseCase,
  Meal,
  UpdateMealUseCase,
  type IFoodRepository,
  type IMealRepository,
  type IWaterRepository,
} from '../../../src/modules/nutrition/index.js';
import {
  COLUMN_CAPACITY,
  FOOD_LIMITS,
  MEAL_ITEM_LIMITS,
  MEAL_LIMITS,
  WATER_LIMITS,
  assertInRange,
  assertWaterAmount,
  type NumericLimit,
} from '../../../src/modules/nutrition/domain/nutrition-limits.js';
import {
  adminCreateFoodRequest,
  adminUpdateFoodRequest,
} from '../../../src/modules/nutrition/interface/admin-nutrition.schemas.js';
import {
  createCustomFoodRequest,
  getDailyNutritionRequest,
  getNutritionAnalyticsRequest,
  logMealRequest,
  logWaterRequest,
  updateMealRequest,
} from '../../../src/modules/nutrition/interface/nutrition.schemas.js';

const userId = '11111111-1111-4111-8111-111111111111';
const baseFood = {
  name: 'Test food',
  servingSize: 1,
  servingUnit: 'g',
  servingWeightG: 100,
  calories: 100,
  proteinG: 10,
  carbohydratesG: 10,
  fatG: 10,
};

/** Smallest value strictly above a limit, in the units the column stores (two decimals). */
const above = (limit: NumericLimit) => Math.round((limit.max + 0.01) * 100) / 100;

describe('nutrition limits stay strictly inside the PostgreSQL columns (migration 0008)', () => {
  const capacity = COLUMN_CAPACITY;

  it('column capacities match numeric(p,s) / integer', () => {
    expect(capacity.numeric_8_2).toBe(10 ** (8 - 2));
    expect(capacity.numeric_6_2).toBe(10 ** (6 - 2));
    expect(capacity.numeric_6_4).toBe(10 ** (6 - 4));
    expect(capacity.int4).toBe(2 ** 31);
  });

  it('every food limit is below the capacity of its column, with the two-decimal rounding margin', () => {
    const fits = (limit: NumericLimit, cap: number) => {
      expect(limit.max + 0.01).toBeLessThan(cap);
      expect(limit.min).toBeGreaterThanOrEqual(0);
    };
    fits(FOOD_LIMITS.servingSize, capacity.numeric_8_2); // foods.serving_size numeric(8,2)
    fits(FOOD_LIMITS.servingWeightG, capacity.numeric_8_2); // serving_weight_g numeric(8,2)
    fits(FOOD_LIMITS.servingVolumeMl, capacity.numeric_8_2); // serving_volume_ml numeric(8,2)
    fits(FOOD_LIMITS.densityGPerMl, capacity.numeric_6_4); // density_g_per_ml numeric(6,4)
    fits(FOOD_LIMITS.calories, capacity.numeric_8_2); // calories numeric(8,2)
    fits(FOOD_LIMITS.macroG, capacity.numeric_6_2); // protein/carbs/fat/fiber/sugar numeric(6,2)
    fits(FOOD_LIMITS.sodiumMg, capacity.numeric_8_2); // sodium_mg numeric(8,2)
    fits(FOOD_LIMITS.cholesterolMg, capacity.numeric_6_2); // cholesterol_mg numeric(6,2)
  });

  it('every meal item / meal / water limit is below the capacity of its column', () => {
    expect(MEAL_ITEM_LIMITS.servingMultiplier.max + 0.01).toBeLessThan(capacity.numeric_6_2); // numeric(6,2)
    expect(MEAL_ITEM_LIMITS.loggedWeightG.max + 0.01).toBeLessThan(capacity.numeric_8_2);
    expect(MEAL_ITEM_LIMITS.calories.max + 0.01).toBeLessThan(capacity.numeric_8_2);
    expect(MEAL_ITEM_LIMITS.macroG.max + 0.01).toBeLessThan(capacity.numeric_6_2);
    expect(MEAL_LIMITS.totalCalories.max + 0.01).toBeLessThan(capacity.numeric_8_2); // meals.total_calories
    expect(MEAL_LIMITS.totalMacroG.max + 0.01).toBeLessThan(capacity.numeric_6_2); // meals.total_*_g
    expect(WATER_LIMITS.amountMl.max).toBeLessThan(capacity.int4);
  });

  it('strictly positive columns have a lower bound that survives two-decimal rounding', () => {
    for (const limit of [
      FOOD_LIMITS.servingSize,
      FOOD_LIMITS.servingWeightG,
      FOOD_LIMITS.servingVolumeMl,
      FOOD_LIMITS.densityGPerMl,
      MEAL_ITEM_LIMITS.servingMultiplier,
      MEAL_ITEM_LIMITS.loggedWeightG,
    ]) {
      expect(Math.round(limit.min * 100)).toBeGreaterThanOrEqual(1);
    }
  });

  it('an item at its maximum can still sit inside a meal at its maximum', () => {
    expect(MEAL_ITEM_LIMITS.calories.max).toBeLessThanOrEqual(MEAL_LIMITS.totalCalories.max);
    expect(MEAL_ITEM_LIMITS.macroG.max).toBeLessThanOrEqual(MEAL_LIMITS.totalMacroG.max);
  });
});

describe('assertInRange / assertWaterAmount', () => {
  it('rejects non-finite values and values on the wrong side of a bound with a validation error', () => {
    const limit = { min: 1, max: 5 };
    expect(() => assertInRange('x', 1, limit)).not.toThrow();
    expect(() => assertInRange('x', 5, limit)).not.toThrow();
    for (const bad of [
      0.99,
      5.01,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      '3',
      null,
    ]) {
      try {
        assertInRange('x', bad, limit);
        throw new Error(`expected rejection of ${String(bad)}`);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('VALIDATION_FAILED');
        expect((error as AppError).kind).toBe('unprocessable');
      }
    }
  });

  it('water: 1..10000 ml after rounding', () => {
    expect(() => assertWaterAmount(1)).not.toThrow();
    expect(() => assertWaterAmount(10_000)).not.toThrow();
    expect(() => assertWaterAmount(10_000.4)).not.toThrow(); // rounds to 10,000
    expect(() => assertWaterAmount(10_001)).toThrow(AppError);
    expect(() => assertWaterAmount(0.4)).toThrow(AppError); // rounds to 0
    expect(() => assertWaterAmount(Number.NaN)).toThrow(AppError);
  });
});

describe('request schemas', () => {
  const food = createCustomFoodRequest.body;
  const validFood = { ...baseFood };

  it.each([
    ['servingSize', FOOD_LIMITS.servingSize],
    ['servingWeightG', FOOD_LIMITS.servingWeightG],
    ['calories', FOOD_LIMITS.calories],
    ['proteinG', FOOD_LIMITS.macroG],
    ['carbohydratesG', FOOD_LIMITS.macroG],
    ['fatG', FOOD_LIMITS.macroG],
    ['fiberG', FOOD_LIMITS.macroG],
    ['sugarG', FOOD_LIMITS.macroG],
    ['sodiumMg', FOOD_LIMITS.sodiumMg],
    ['cholesterolMg', FOOD_LIMITS.cholesterolMg],
    ['servingVolumeMl', FOOD_LIMITS.servingVolumeMl],
    ['densityGPerMl', FOOD_LIMITS.densityGPerMl],
  ])(
    'custom food %s: the maximum passes, one step above fails (member and admin schemas)',
    (field, limit) => {
      const adminBase = { ...validFood, dataSource: 'usda_fdc' as const };
      for (const schema of [food, adminCreateFoodRequest.body]) {
        const base = schema === food ? validFood : adminBase;
        expect(schema.safeParse({ ...base, [field]: limit.max }).success, `${field} max`).toBe(true);
        expect(schema.safeParse({ ...base, [field]: above(limit) }).success, `${field} max+`).toBe(false);
        expect(schema.safeParse({ ...base, [field]: Number.NaN }).success, `${field} NaN`).toBe(false);
        expect(schema.safeParse({ ...base, [field]: Number.POSITIVE_INFINITY }).success, `${field} inf`).toBe(
          false,
        );
        expect(schema.safeParse({ ...base, [field]: 1e308 }).success, `${field} 1e308`).toBe(false);
      }
      expect(adminUpdateFoodRequest.body.safeParse({ [field]: above(limit) }).success).toBe(false);
      expect(adminUpdateFoodRequest.body.safeParse({ [field]: limit.max }).success).toBe(true);
    },
  );

  it('strictly positive food fields reject values the column would round to zero', () => {
    for (const field of ['servingSize', 'servingWeightG']) {
      expect(food.safeParse({ ...validFood, [field]: 0.01 }).success).toBe(true);
      expect(food.safeParse({ ...validFood, [field]: 0.004 }).success).toBe(false);
      expect(food.safeParse({ ...validFood, [field]: 0 }).success).toBe(false);
    }
  });

  it('text fields are capped at the varchar sizes (these used to overflow with a 500)', () => {
    expect(food.safeParse({ ...validFood, name: 'n'.repeat(150) }).success).toBe(true);
    expect(food.safeParse({ ...validFood, name: 'n'.repeat(151) }).success).toBe(false); // foods.name varchar(150)
    expect(food.safeParse({ ...validFood, servingUnit: 'u'.repeat(30) }).success).toBe(true);
    expect(food.safeParse({ ...validFood, servingUnit: 'u'.repeat(31) }).success).toBe(false); // varchar(30)
  });

  const mealBody = logMealRequest.body;
  const item = { foodName: 'Rice', servingMultiplier: 1 };

  it.each([
    ['servingMultiplier', MEAL_ITEM_LIMITS.servingMultiplier],
    ['loggedWeightG', MEAL_ITEM_LIMITS.loggedWeightG],
    ['calories', MEAL_ITEM_LIMITS.calories],
    ['proteinG', MEAL_ITEM_LIMITS.macroG],
    ['carbsG', MEAL_ITEM_LIMITS.macroG],
    ['fatG', MEAL_ITEM_LIMITS.macroG],
    ['fiberG', MEAL_ITEM_LIMITS.macroG],
    ['servingSize', FOOD_LIMITS.servingSize],
    ['servingWeightG', FOOD_LIMITS.servingWeightG],
  ])('meal item %s: the maximum passes, one step above fails', (field, limit) => {
    const make = (value: number) => ({
      mealType: 'lunch',
      date: '2026-11-13',
      items: [{ ...item, [field]: value }],
    });
    expect(mealBody.safeParse(make(limit.max)).success, `${field} max`).toBe(true);
    expect(mealBody.safeParse(make(above(limit))).success, `${field} max+`).toBe(false);
    expect(mealBody.safeParse(make(Number.POSITIVE_INFINITY)).success).toBe(false);
    expect(updateMealRequest.body.safeParse({ items: [{ ...item, [field]: above(limit) }] }).success).toBe(
      false,
    );
  });

  it('a meal holds at most 50 items and food names at most 150 characters', () => {
    const items = (n: number) => Array.from({ length: n }, () => item);
    expect(mealBody.safeParse({ mealType: 'lunch', date: '2026-11-13', items: items(50) }).success).toBe(
      true,
    );
    expect(mealBody.safeParse({ mealType: 'lunch', date: '2026-11-13', items: items(51) }).success).toBe(
      false,
    );
    expect(
      mealBody.safeParse({ mealType: 'lunch', items: [{ foodName: 'n'.repeat(151), servingMultiplier: 1 }] })
        .success,
    ).toBe(false);
  });

  it('water: 1..10000 ml integers', () => {
    const water = logWaterRequest.body;
    expect(water.safeParse({ date: '2026-11-13', amountMl: 10_000 }).success).toBe(true);
    expect(water.safeParse({ date: '2026-11-13', amountMl: 10_001 }).success).toBe(false);
    expect(water.safeParse({ date: '2026-11-13', amountMl: 2_147_483_647 }).success).toBe(false); // int4 max
    expect(water.safeParse({ date: '2026-11-13', amountMl: 0 }).success).toBe(false);
    expect(water.safeParse({ date: '2026-11-13', amountMl: 250.5 }).success).toBe(false);
  });

  it('dates must be real calendar days; date is optional where "today" can be defaulted', () => {
    for (const date of ['2026-02-30', '2026-13-01', '0000-01-01', '2026-04-31']) {
      expect(getDailyNutritionRequest.query.safeParse({ date }).success, date).toBe(false);
      expect(logWaterRequest.body.safeParse({ date, amountMl: 100 }).success, date).toBe(false);
      expect(getNutritionAnalyticsRequest.query.safeParse({ endDate: date }).success, date).toBe(false);
      expect(logMealRequest.body.safeParse({ mealType: 'lunch', date, items: [item] }).success, date).toBe(
        false,
      );
    }
    expect(getDailyNutritionRequest.query.safeParse({}).success).toBe(true);
    expect(logWaterRequest.body.safeParse({ amountMl: 100 }).success).toBe(true);
    expect(logMealRequest.body.safeParse({ mealType: 'lunch', items: [item] }).success).toBe(true);
    expect(getDailyNutritionRequest.query.safeParse({ date: '2028-02-29' }).success).toBe(true);
  });

  it('accepts any timezone string up to 64 chars (an unknown zone falls back to UTC in the use case)', () => {
    expect(getNutritionAnalyticsRequest.query.safeParse({ timezone: 'Asia/Kolkata' }).success).toBe(true);
    expect(getNutritionAnalyticsRequest.query.safeParse({ timezone: 'Not/AZone' }).success).toBe(true);
    expect(getNutritionAnalyticsRequest.query.safeParse({ timezone: 'x'.repeat(65) }).success).toBe(false);
  });
});

describe('use cases refuse values no column can hold (clean 422, never a raw numeric overflow)', () => {
  let foodRepo: IFoodRepository;
  let mealRepo: IMealRepository;
  let waterRepo: IWaterRepository;
  let uow: UnitOfWork;
  let logMeal: LogMealUseCase;

  /** 100 g basis, 100 g serving, 900 kcal / 100 g: the densest realistic food (pure fat). */
  const fat = new Food({
    id: 'f0000000-0000-4000-8000-0000000000f1',
    name: 'Olive oil',
    brand: null,
    barcode: null,
    servingSize: 1,
    servingUnit: 'g',
    servingWeightG: 100,
    servingBasis: '100g',
    calories: 900,
    proteinG: 0,
    carbohydratesG: 0,
    fatG: 100,
    fiberG: 0,
    dataSource: 'usda_fdc',
    isCustom: false,
    isVerified: true,
    verificationStatus: 'verified',
    createdBy: null,
  });

  /** A food whose serving is 5 kg: logging a few grams gives a multiplier of 0.0002. */
  const watermelon = new Food({
    ...{
      id: 'f0000000-0000-4000-8000-0000000000f2',
      name: 'Whole watermelon',
      brand: null,
      barcode: null,
      servingSize: 1,
      servingUnit: 'melon',
      servingWeightG: 5000,
      servingBasis: '100g' as const,
      calories: 30,
      proteinG: 0.6,
      carbohydratesG: 7.5,
      fatG: 0.2,
      fiberG: 0.4,
      dataSource: 'usda_fdc' as const,
      isCustom: false,
      isVerified: true,
      verificationStatus: 'verified' as const,
      createdBy: null,
    },
  });

  beforeEach(() => {
    foodRepo = {
      findById: vi.fn(async (id: string) => (id === fat.id ? fat : id === watermelon.id ? watermelon : null)),
      findByBarcode: vi.fn(),
      search: vi.fn(),
      listRecent: vi.fn(),
      listFavorites: vi.fn(),
      create: vi.fn(async (f: Food) => f),
      update: vi.fn(),
      softDelete: vi.fn(),
      countVerified: vi.fn(),
      countCustom: vi.fn(),
      getCatalogStats: vi.fn(),
    };
    mealRepo = {
      findById: vi.fn().mockResolvedValue(null),
      listByDate: vi.fn(),
      listDateRange: vi.fn(),
      create: vi.fn(async (meal: Meal) => ({ meal, created: true })),
      update: vi.fn(async (_id: string, _u: string, meal: Meal) => meal),
      softDelete: vi.fn(),
      getMostLoggedFoods: vi.fn(),
      countLoggedDays: vi.fn(),
    };
    waterRepo = {
      findById: vi.fn().mockResolvedValue(null),
      create: vi.fn(async (entry) => ({ entry, created: true })),
      listByDate: vi.fn(),
      getTotalByDate: vi.fn(),
      getTotalDateRange: vi.fn(),
    };
    uow = { run: vi.fn(async (work) => work()) };
    logMeal = new LogMealUseCase(mealRepo, foodRepo, uow);
  });

  const adHoc = (overrides: Record<string, unknown> = {}) => ({
    foodName: 'Stew',
    servingMultiplier: 1,
    loggedWeightG: 300,
    ...overrides,
  });
  const log = (items: Record<string, unknown>[]) =>
    logMeal.execute({ userId, mealType: 'lunch', date: '2026-11-13', items: items as never });
  const rejects = (promise: Promise<unknown>) =>
    expect(promise).rejects.toMatchObject({ code: 'VALIDATION_FAILED', kind: 'unprocessable' });

  describe('ad-hoc items (typed in, or an AI estimate the client logs)', () => {
    it('accepts every field at its maximum and rejects one step above', async () => {
      await expect(
        log([
          adHoc({
            calories: 10_000,
            proteinG: 2_000,
            carbsG: 2_000,
            fatG: 2_000,
            fiberG: 2_000,
            loggedWeightG: 10_000,
          }),
        ]),
      ).resolves.toMatchObject({ created: true });

      await rejects(log([adHoc({ calories: 10_000.01 })]));
      await rejects(log([adHoc({ proteinG: 2_000.01 })]));
      await rejects(log([adHoc({ carbsG: 2_000.01 })]));
      await rejects(log([adHoc({ fatG: 2_000.01 })]));
      await rejects(log([adHoc({ fiberG: 2_000.01 })]));
      await rejects(log([adHoc({ loggedWeightG: 10_000.01 })]));
      await rejects(log([adHoc({ calories: Number.NaN })]));
      await rejects(log([adHoc({ calories: Number.POSITIVE_INFINITY })]));
      await rejects(log([adHoc({ calories: 1e300 })]));
    });

    it('guards the PRODUCT of two legal values (default logged weight = serving weight x multiplier)', async () => {
      // 5,000 servings of 100 g = 500,000 g: both inputs are legal, the product is not.
      await rejects(log([{ foodName: 'Rice', servingMultiplier: 5_000, servingWeightG: 100 }]));
      // 100 servings of 100 g = exactly 10,000 g
      await expect(
        log([{ foodName: 'Rice', servingMultiplier: 100, servingWeightG: 100 }] as never),
      ).resolves.toMatchObject({ created: true });
    });

    it('rejects a tiny default weight that would be stored as 0.00', async () => {
      await rejects(log([{ foodName: 'Dust', servingMultiplier: 0.01, servingWeightG: 0.01 }]));
    });
  });

  describe('catalog items (values computed server-side)', () => {
    it('computes per-100 g values and rejects a portion whose result is too large', async () => {
      // 1,000 g of a 900 kcal/100 g food = 9,000 kcal (legal)
      const ok = await log([{ foodId: fat.id, servingMultiplier: 1, loggedWeightG: 1_000 } as never]);
      expect(ok.meal.items[0]!.calories).toBe(9_000);

      // 10,000 g of the same food = 90,000 kcal: each input is legal, the result exceeds one item's limit
      await rejects(log([{ foodId: fat.id, servingMultiplier: 1, loggedWeightG: 10_000 } as never]));
      // 150 servings of 100 g = 15,000 g > 10,000 g
      await rejects(log([{ foodId: fat.id, servingMultiplier: 150 } as never]));
      // 5,000 servings x 100 g = 500,000 g
      await rejects(log([{ foodId: fat.id, servingMultiplier: 5_000 } as never]));
    });

    it('floors the stored multiplier of a tiny portion instead of letting the column round it to zero', async () => {
      const res = await log([{ foodId: watermelon.id, servingMultiplier: 1, loggedWeightG: 1 } as never]);
      expect(res.meal.items[0]!.servingMultiplier).toBe(0.01); // true ratio is 0.0002
      expect(res.meal.items[0]!.loggedWeightG).toBe(1);
    });

    it('rejects a weight-based multiplier above the column capacity (10,000 g of a 0.01 g serving)', async () => {
      const tiny = new Food({
        id: 'f0000000-0000-4000-8000-0000000000f3',
        name: 'Sprinkle',
        brand: null,
        barcode: null,
        servingSize: 1,
        servingUnit: 'pinch',
        servingWeightG: 0.01,
        servingBasis: '100g',
        calories: 10,
        proteinG: 0,
        carbohydratesG: 0,
        fatG: 0,
        fiberG: 0,
        dataSource: 'usda_fdc',
        isCustom: false,
        isVerified: true,
        verificationStatus: 'verified',
        createdBy: null,
      });
      vi.mocked(foodRepo.findById).mockResolvedValue(tiny);
      await rejects(log([{ foodId: tiny.id, servingMultiplier: 1, loggedWeightG: 10_000 } as never]));
    });
  });

  describe('meal totals', () => {
    it('limits the summed calories, summed macros and the item count', async () => {
      const heavy = adHoc({ calories: 9_000 });
      await expect(log([heavy, heavy, heavy, heavy, heavy])).resolves.toMatchObject({ created: true }); // 45,000
      await rejects(log([heavy, heavy, heavy, heavy, heavy, heavy])); // 54,000 > 50,000

      const protein = adHoc({ proteinG: 1_900 });
      await expect(log([protein, protein])).resolves.toMatchObject({ created: true }); // 3,800 g
      await rejects(log([protein, protein, protein])); // 5,700 g > 5,000 g

      await expect(
        logMeal.execute({
          userId,
          mealType: 'lunch',
          date: '2026-11-13',
          items: Array.from({ length: 51 }, () => adHoc()) as never,
        }),
      ).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });

    it('UpdateMeal applies the same guards to a replaced item list', async () => {
      const existing = new Meal({ id: 'm1', userId, mealType: 'lunch', date: '2026-11-13', items: [] });
      vi.mocked(mealRepo.findById).mockResolvedValue(existing);
      const update = new UpdateMealUseCase(mealRepo, foodRepo, uow);

      await expect(
        update.execute({ id: 'm1', userId, items: [adHoc({ calories: 10_000 })] as never }),
      ).resolves.toBeDefined();
      await rejects(update.execute({ id: 'm1', userId, items: [adHoc({ calories: 10_001 })] as never }));
      await rejects(
        update.execute({
          id: 'm1',
          userId,
          items: [{ foodId: fat.id, servingMultiplier: 1, loggedWeightG: 10_000 }] as never,
        }),
      );
    });
  });

  describe('foods', () => {
    it('custom food: every field at the maximum passes, one step above is rejected', async () => {
      const create = new CreateCustomFoodUseCase(foodRepo);
      const max = {
        userId,
        name: 'n'.repeat(150),
        servingSize: 10_000,
        servingUnit: 'u'.repeat(30),
        servingWeightG: 10_000,
        servingVolumeMl: 10_000,
        densityGPerMl: 10,
        calories: 10_000,
        proteinG: 2_000,
        carbohydratesG: 2_000,
        fatG: 2_000,
        fiberG: 2_000,
        sugarG: 2_000,
        sodiumMg: 100_000,
        cholesterolMg: 5_000,
      };
      await expect(create.execute(max)).resolves.toBeDefined();

      for (const [field, limit] of Object.entries({
        servingSize: FOOD_LIMITS.servingSize,
        servingWeightG: FOOD_LIMITS.servingWeightG,
        servingVolumeMl: FOOD_LIMITS.servingVolumeMl,
        densityGPerMl: FOOD_LIMITS.densityGPerMl,
        calories: FOOD_LIMITS.calories,
        proteinG: FOOD_LIMITS.macroG,
        carbohydratesG: FOOD_LIMITS.macroG,
        fatG: FOOD_LIMITS.macroG,
        fiberG: FOOD_LIMITS.macroG,
        sugarG: FOOD_LIMITS.macroG,
        sodiumMg: FOOD_LIMITS.sodiumMg,
        cholesterolMg: FOOD_LIMITS.cholesterolMg,
      })) {
        await rejects(create.execute({ ...max, [field]: above(limit) }));
      }
      await rejects(create.execute({ ...max, name: 'n'.repeat(151) }));
      await rejects(create.execute({ ...max, servingUnit: 'u'.repeat(31) }));
      await rejects(create.execute({ ...max, servingWeightG: 0.004 }));
    });

    it('admin create and update enforce the same limits (only on the fields being changed)', async () => {
      const audit = { logAction: vi.fn() };
      const admin = new AdminManageFoodUseCase(foodRepo, audit);
      const input = { adminId: userId, ...baseFood, dataSource: 'usda_fdc' as const };

      await rejects(admin.create({ ...input, calories: 10_001 }));
      await rejects(admin.create({ ...input, sodiumMg: 100_001 }));
      await rejects(
        admin.create({ ...input, servingWeightG: 10_001, proteinG: 1, carbohydratesG: 1, fatG: 1 }),
      );
      await expect(
        admin.create({ ...input, calories: 10_000, proteinG: 30, carbohydratesG: 30, fatG: 30 }),
      ).resolves.toBeDefined();

      // update: a legacy row (outside today's limits) stays editable for unrelated fields
      const legacy = new Food({
        ...baseFood,
        id: 'f0000000-0000-4000-8000-0000000000f9',
        servingBasis: 'serving',
        brand: null,
        barcode: null,
        fiberG: 0,
        calories: 50_000,
        dataSource: 'usda_fdc',
        isCustom: false,
        isVerified: true,
        verificationStatus: 'verified',
        createdBy: null,
      });
      vi.mocked(foodRepo.findById).mockResolvedValue(legacy);
      vi.mocked(foodRepo.update).mockResolvedValue(legacy);
      await expect(
        admin.update({ adminId: userId, foodId: legacy.id, name: 'Renamed' }),
      ).resolves.toBeDefined();
      await rejects(admin.update({ adminId: userId, foodId: legacy.id, calories: 10_001 }));
    });
  });

  describe('water', () => {
    it('accepts 1..10000 ml and rejects the rest before any insert', async () => {
      const water = new LogWaterUseCase(waterRepo);
      await expect(water.execute({ userId, date: '2026-11-13', amountMl: 10_000 })).resolves.toMatchObject({
        created: true,
      });
      await expect(water.execute({ userId, date: '2026-11-13', amountMl: 1 })).resolves.toMatchObject({
        created: true,
      });
      await rejects(water.execute({ userId, date: '2026-11-13', amountMl: 10_001 }));
      await rejects(water.execute({ userId, date: '2026-11-13', amountMl: 2_147_483_647 }));
      await rejects(water.execute({ userId, date: '2026-11-13', amountMl: 0.4 }));
      await rejects(water.execute({ userId, date: '2026-11-13', amountMl: Number.NaN }));
      expect(waterRepo.create).toHaveBeenCalledTimes(2);
    });
  });
});
