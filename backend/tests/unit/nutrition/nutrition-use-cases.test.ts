import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../src/shared/errors/app-error.js';
import type { UnitOfWork } from '../../../src/shared/application/unit-of-work.js';
import {
  Food,
  Meal,
  MealItem,
  WaterIntake,
  SearchFoodsUseCase,
  GetFoodDetailsUseCase,
  CreateCustomFoodUseCase,
  LogMealUseCase,
  UpdateMealUseCase,
  GetDailyNutritionUseCase,
  LogWaterUseCase,
  GetNutritionAnalyticsUseCase,
  ManageFoodFavoritesUseCase,
  GetRecentFoodsUseCase,
  type IFoodRepository,
  type IMealRepository,
  type IWaterRepository,
  type IFoodFavoriteRepository,
  type IUserProfileTargetPort,
} from '../../../src/modules/nutrition/index.js';

describe('Nutrition Application Use Cases', () => {
  const user1 = '11111111-1111-4111-8111-111111111111';
  const user2 = '22222222-2222-4222-8222-222222222222';
  const food1Id = 'f1111111-1111-4111-8111-111111111111';
  const customFoodId = 'f2222222-2222-4222-8222-222222222222';
  const meal1Id = 'm1111111-1111-4111-8111-111111111111';
  const water1Id = 'w1111111-1111-4111-8111-111111111111';

  // Verified Egg: 50g per piece, 143 kcal per 100g basis -> 71.5 kcal per piece
  const verifiedEgg = new Food({
    id: food1Id,
    name: 'Egg, whole, raw',
    brand: null,
    barcode: '012345678901',
    servingSize: 1,
    servingUnit: 'piece',
    servingWeightG: 50,
    servingBasis: '100g',
    calories: 143,
    proteinG: 12.56,
    carbohydratesG: 0.72,
    fatG: 9.51,
    fiberG: 0,
    dataSource: 'usda_fdc',
    sourceId: '171287',
    isCustom: false,
    isVerified: true,
    verificationStatus: 'verified',
    createdBy: null,
  });

  // User 1's custom food
  const user1CustomFood = new Food({
    id: customFoodId,
    name: 'Grandma Secret Protein Shake',
    brand: 'Homemade',
    barcode: null,
    servingSize: 1,
    servingUnit: 'glass',
    servingWeightG: 300,
    servingBasis: '100g',
    calories: 100,
    proteinG: 10,
    carbohydratesG: 8,
    fatG: 2,
    fiberG: 1,
    dataSource: 'user_custom',
    isCustom: true,
    isVerified: false,
    verificationStatus: 'unverified',
    createdBy: user1,
  });

  let foodRepo: IFoodRepository;
  let mealRepo: IMealRepository;
  let waterRepo: IWaterRepository;
  let favoriteRepo: IFoodFavoriteRepository;
  let targetPort: IUserProfileTargetPort;
  let uow: UnitOfWork;

  beforeEach(() => {
    foodRepo = {
      findById: vi.fn(),
      findByBarcode: vi.fn(),
      search: vi.fn(),
      listRecent: vi.fn(),
      listFavorites: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      countVerified: vi.fn(),
      countCustom: vi.fn(),
    };

    mealRepo = {
      findById: vi.fn(),
      listByDate: vi.fn(),
      listDateRange: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      getMostLoggedFoods: vi.fn(),
      countLoggedDays: vi.fn(),
    };

    waterRepo = {
      findById: vi.fn(),
      create: vi.fn(),
      listByDate: vi.fn(),
      getTotalByDate: vi.fn(),
      getTotalDateRange: vi.fn(),
    };

    favoriteRepo = {
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
      isFavorite: vi.fn(),
      listFavoriteFoodIds: vi.fn(),
    };

    targetPort = {
      findTargetsByUserId: vi.fn(),
    };

    uow = {
      run: vi.fn(async (work) => work()),
    };
  });

  describe('SearchFoodsUseCase', () => {
    it('searches foods, enforces user visibility, and attaches favorite indicators', async () => {
      vi.mocked(foodRepo.search).mockResolvedValueOnce({
        foods: [verifiedEgg, user1CustomFood],
        total: 2,
      });
      vi.mocked(favoriteRepo.listFavoriteFoodIds).mockResolvedValueOnce([food1Id]);

      const useCase = new SearchFoodsUseCase(foodRepo, favoriteRepo);
      const res = await useCase.execute({
        query: 'egg',
        userId: user1,
        page: 1,
        limit: 20,
      });

      expect(res.total).toBe(2);
      expect(res.foods).toHaveLength(2);
      expect(res.foods[0]!.id).toBe(food1Id);
      expect(res.foods[0]!.isFavorite).toBe(true);
      expect(res.foods[1]!.id).toBe(customFoodId);
      expect(res.foods[1]!.isFavorite).toBe(false);

      expect(foodRepo.search).toHaveBeenCalledWith({
        query: 'egg',
        userId: user1,
        offset: 0,
        limit: 20,
        isVerifiedOnly: undefined,
      });
    });
  });

  describe('GetFoodDetailsUseCase', () => {
    it('returns verified food by ID', async () => {
      vi.mocked(foodRepo.findById).mockResolvedValueOnce(verifiedEgg);
      vi.mocked(favoriteRepo.isFavorite).mockResolvedValueOnce(true);

      const useCase = new GetFoodDetailsUseCase(foodRepo, favoriteRepo);
      const view = await useCase.execute({ id: food1Id, userId: user1 });

      expect(view.id).toBe(food1Id);
      expect(view.isFavorite).toBe(true);
      expect(view.standardServingNutrients.calories).toBe(71.5);
    });

    it('returns verified food by barcode', async () => {
      vi.mocked(foodRepo.findByBarcode).mockResolvedValueOnce(verifiedEgg);
      vi.mocked(favoriteRepo.isFavorite).mockResolvedValueOnce(false);

      const useCase = new GetFoodDetailsUseCase(foodRepo, favoriteRepo);
      const view = await useCase.execute({ barcode: '012345678901', userId: user1 });

      expect(view.barcode).toBe('012345678901');
      expect(view.isFavorite).toBe(false);
    });

    it('rejects access to another user private custom food with 403 Forbidden', async () => {
      // Find with user2 requesting returns null
      vi.mocked(foodRepo.findById)
        .mockResolvedValueOnce(null)
        // Unconstrained lookup finds user1's custom food
        .mockResolvedValueOnce(user1CustomFood);

      const useCase = new GetFoodDetailsUseCase(foodRepo, favoriteRepo);

      await expect(useCase.execute({ id: customFoodId, userId: user2 })).rejects.toMatchObject({
        kind: 'forbidden',
        code: 'FORBIDDEN',
      });
    });

    it('throws 404 when food does not exist', async () => {
      vi.mocked(foodRepo.findById).mockResolvedValue(null);

      const useCase = new GetFoodDetailsUseCase(foodRepo, favoriteRepo);
      await expect(
        useCase.execute({ id: '99999999-9999-4999-8999-999999999999', userId: user1 }),
      ).rejects.toMatchObject({
        kind: 'not_found',
        code: 'NOT_FOUND',
      });
    });
  });

  describe('CreateCustomFoodUseCase', () => {
    it('creates custom food with strict user ownership and unverified status', async () => {
      vi.mocked(foodRepo.create).mockImplementation(async (food) => food);

      const useCase = new CreateCustomFoodUseCase(foodRepo);
      const result = await useCase.execute({
        userId: user1,
        name: 'My Protein Oats',
        servingSize: 50,
        servingUnit: 'g',
        servingWeightG: 50,
        calories: 190,
        proteinG: 15,
        carbohydratesG: 25,
        fatG: 3,
        fiberG: 4,
      });

      expect(result.name).toBe('My Protein Oats');
      expect(result.isCustom).toBe(true);
      expect(result.isVerified).toBe(false);

      const [saved] = vi.mocked(foodRepo.create).mock.calls[0]!;
      expect(saved.createdBy).toBe(user1);
      expect(saved.isCustom).toBe(true);
      expect(saved.isVerified).toBe(false);
    });

    it('returns existing food view idempotently when user retries with same ID', async () => {
      vi.mocked(foodRepo.findById).mockResolvedValueOnce(user1CustomFood);

      const useCase = new CreateCustomFoodUseCase(foodRepo);
      const res = await useCase.execute({
        id: customFoodId,
        userId: user1,
        name: 'Grandma Secret Protein Shake',
        servingSize: 1,
        servingUnit: 'glass',
        servingWeightG: 300,
        calories: 100,
        proteinG: 10,
        carbohydratesG: 8,
        fatG: 2,
      });

      expect(res.id).toBe(customFoodId);
      expect(foodRepo.create).not.toHaveBeenCalled();
    });

    it('throws 409 Conflict on cross-user ID collision', async () => {
      vi.mocked(foodRepo.findById).mockResolvedValueOnce(user1CustomFood);

      const useCase = new CreateCustomFoodUseCase(foodRepo);
      await expect(
        useCase.execute({
          id: customFoodId,
          userId: user2, // user2 attempts to reuse user1's food ID
          name: 'Intruder Food',
          servingSize: 100,
          servingUnit: 'g',
          servingWeightG: 100,
          calories: 100,
          proteinG: 10,
          carbohydratesG: 10,
          fatG: 2,
        }),
      ).rejects.toMatchObject({
        kind: 'conflict',
        code: 'CONFLICT',
      });
    });
  });

  describe('LogMealUseCase', () => {
    it('calculates meal macros server-side and ignores client-provided numbers', async () => {
      vi.mocked(mealRepo.findById).mockResolvedValue(null);
      vi.mocked(foodRepo.findById).mockResolvedValue(verifiedEgg);
      vi.mocked(mealRepo.create).mockImplementation(async (meal) => ({ meal, created: true }));

      const useCase = new LogMealUseCase(mealRepo, foodRepo, uow);

      // Client submits 2 eggs (each 50g -> 100g total), but passes wrong spoofed calories (9999)
      const result = await useCase.execute({
        userId: user1,
        mealType: 'breakfast',
        date: '2026-11-05',
        items: [
          {
            foodId: food1Id,
            servingMultiplier: 2,
            calories: 9999, // spoofed! Must be ignored and overridden by server
            proteinG: 9999,
          },
        ],
      });

      expect(result.created).toBe(true);
      // 2 eggs = 100g * 143 kcal/100g = 143.0 kcal
      expect(result.meal.totalCalories).toBe(143.0);
      // 2 eggs protein = 12.56 * 1 = 12.56 g
      expect(result.meal.totalProteinG).toBe(12.56);
      expect(result.meal.items[0]!.calories).toBe(143.0);
      expect(result.meal.items[0]!.loggedWeightG).toBe(100.0);
      expect(uow.run).toHaveBeenCalledTimes(1);
    });

    it('normalizes alias "snacks" to canonical "snack"', async () => {
      vi.mocked(mealRepo.findById).mockResolvedValue(null);
      vi.mocked(foodRepo.findById).mockResolvedValue(verifiedEgg);
      vi.mocked(mealRepo.create).mockImplementation(async (meal) => ({ meal, created: true }));

      const useCase = new LogMealUseCase(mealRepo, foodRepo, uow);
      const result = await useCase.execute({
        userId: user1,
        mealType: 'snacks',
        date: '2026-11-05',
        items: [{ foodId: food1Id, servingMultiplier: 1 }],
      });

      expect(result.meal.mealType).toBe('snack');
    });

    it('handles idempotent retry safely without re-inserting or modifying records', async () => {
      const existingMeal = new Meal({
        id: meal1Id,
        userId: user1,
        mealType: 'lunch',
        date: '2026-11-05',
        items: [],
      });

      vi.mocked(mealRepo.findById).mockResolvedValueOnce(existingMeal);

      const useCase = new LogMealUseCase(mealRepo, foodRepo, uow);
      const result = await useCase.execute({
        id: meal1Id,
        userId: user1,
        mealType: 'lunch',
        date: '2026-11-05',
        items: [{ foodId: food1Id, servingMultiplier: 1 }],
      });

      expect(result.created).toBe(false);
      expect(result.meal.id).toBe(meal1Id);
      expect(mealRepo.create).not.toHaveBeenCalled();
      expect(uow.run).not.toHaveBeenCalled();
    });

    it('detects cross-user meal ID collision and throws 409 Conflict', async () => {
      const otherUserMeal = new Meal({
        id: meal1Id,
        userId: user2, // belongs to user2
        mealType: 'lunch',
        date: '2026-11-05',
        items: [],
      });

      vi.mocked(mealRepo.findById).mockResolvedValueOnce(otherUserMeal);

      const useCase = new LogMealUseCase(mealRepo, foodRepo, uow);
      await expect(
        useCase.execute({
          id: meal1Id,
          userId: user1, // user1 attempts to use user2's meal ID
          mealType: 'lunch',
          date: '2026-11-05',
          items: [{ foodId: food1Id, servingMultiplier: 1 }],
        }),
      ).rejects.toMatchObject({
        kind: 'conflict',
        code: 'CONFLICT',
      });
    });

    it('rejects logging unauthorized custom food belonging to another user', async () => {
      vi.mocked(mealRepo.findById).mockResolvedValue(null);
      vi.mocked(foodRepo.findById)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(user1CustomFood);

      const useCase = new LogMealUseCase(mealRepo, foodRepo, uow);
      await expect(
        useCase.execute({
          userId: user2,
          mealType: 'dinner',
          date: '2026-11-05',
          items: [{ foodId: customFoodId, servingMultiplier: 1 }],
        }),
      ).rejects.toMatchObject({
        kind: 'forbidden',
        code: 'FORBIDDEN',
      });
    });

    it('rolls back atomically if database operation fails inside unit of work', async () => {
      vi.mocked(mealRepo.findById).mockResolvedValue(null);
      vi.mocked(foodRepo.findById).mockResolvedValue(verifiedEgg);
      vi.mocked(mealRepo.create).mockRejectedValueOnce(new Error('DB transaction deadlocked'));

      const useCase = new LogMealUseCase(mealRepo, foodRepo, uow);

      await expect(
        useCase.execute({
          userId: user1,
          mealType: 'breakfast',
          date: '2026-11-05',
          items: [{ foodId: food1Id, servingMultiplier: 1 }],
        }),
      ).rejects.toThrow('DB transaction deadlocked');
    });
  });

  describe('UpdateMealUseCase', () => {
    it('updates meal items and recalculates totals atomically', async () => {
      const existingMeal = new Meal({
        id: meal1Id,
        userId: user1,
        mealType: 'lunch',
        date: '2026-11-05',
        items: [],
      });

      vi.mocked(mealRepo.findById).mockResolvedValueOnce(existingMeal);
      vi.mocked(foodRepo.findById).mockResolvedValue(verifiedEgg);
      vi.mocked(mealRepo.update).mockImplementation(async (_id, _uId, updated) => updated);

      const useCase = new UpdateMealUseCase(mealRepo, foodRepo, uow);
      const res = await useCase.execute({
        id: meal1Id,
        userId: user1,
        notes: 'Added extra egg',
        items: [{ foodId: food1Id, servingMultiplier: 3 }],
      });

      expect(res.notes).toBe('Added extra egg');
      // 3 eggs = 150g -> 1.5 * 143 = 214.5 kcal
      expect(res.totalCalories).toBe(214.5);
      expect(uow.run).toHaveBeenCalledTimes(1);
    });

    it('forbids updating a meal belonging to another user', async () => {
      vi.mocked(mealRepo.findById)
        .mockResolvedValueOnce(null) // Not found for user1
        .mockResolvedValueOnce(
          new Meal({
            id: meal1Id,
            userId: user2, // Exists for user2
            mealType: 'lunch',
            date: '2026-11-05',
            items: [],
          }),
        );

      const useCase = new UpdateMealUseCase(mealRepo, foodRepo, uow);
      await expect(
        useCase.execute({
          id: meal1Id,
          userId: user1,
          notes: 'Malicious update',
        }),
      ).rejects.toMatchObject({
        kind: 'forbidden',
        code: 'FORBIDDEN',
      });
    });
  });

  describe('GetDailyNutritionUseCase', () => {
    it('aggregates daily meals and hydration, and matches profile targets', async () => {
      const meal = new Meal({
        id: meal1Id,
        userId: user1,
        mealType: 'breakfast',
        date: '2026-11-05',
        totalCalories: 450,
        totalProteinG: 30,
        totalCarbsG: 40,
        totalFatG: 15,
        totalFiberG: 5,
        items: [],
      });

      vi.mocked(mealRepo.listByDate).mockResolvedValueOnce([meal]);
      vi.mocked(waterRepo.getTotalByDate).mockResolvedValueOnce(1500);
      vi.mocked(targetPort.findTargetsByUserId).mockResolvedValueOnce({
        dailyCalorieTarget: 2000,
        dailyProteinGrams: 150,
      });

      const useCase = new GetDailyNutritionUseCase(mealRepo, waterRepo, targetPort);
      const result = await useCase.execute({ userId: user1, date: '2026-11-05' });

      expect(result.date).toBe('2026-11-05');
      expect(result.consumed.calories).toBe(450);
      expect(result.consumed.proteinG).toBe(30);
      expect(result.consumed.waterMl).toBe(1500);

      expect(result.targets).toEqual({
        calories: 2000,
        proteinG: 150,
        carbsG: null,
        fatG: null,
        waterMl: null,
      });

      expect(result.remaining).toEqual({
        calories: 1550,
        proteinG: 120,
        carbsG: 0,
        fatG: 0,
        fiberG: 0,
        waterMl: 0,
      });
    });

    it('returns targets: null and remaining: null when user has no targets configured', async () => {
      vi.mocked(mealRepo.listByDate).mockResolvedValueOnce([]);
      vi.mocked(waterRepo.getTotalByDate).mockResolvedValueOnce(0);
      vi.mocked(targetPort.findTargetsByUserId).mockResolvedValueOnce({
        dailyCalorieTarget: null,
        dailyProteinGrams: null,
      });

      const useCase = new GetDailyNutritionUseCase(mealRepo, waterRepo, targetPort);
      const result = await useCase.execute({ userId: user1, date: '2026-11-05' });

      expect(result.targets).toBeNull();
      expect(result.remaining).toBeNull();
      expect(result.consumed.calories).toBe(0);
    });
  });

  describe('LogWaterUseCase', () => {
    it('logs hydration and supports safe idempotent retry', async () => {
      const waterEntry = new WaterIntake({
        id: water1Id,
        userId: user1,
        date: '2026-11-05',
        amountMl: 500,
      });

      vi.mocked(waterRepo.findById).mockResolvedValueOnce(null);
      vi.mocked(waterRepo.create).mockResolvedValueOnce({ entry: waterEntry, created: true });

      const useCase = new LogWaterUseCase(waterRepo);
      const res = await useCase.execute({
        id: water1Id,
        userId: user1,
        date: '2026-11-05',
        amountMl: 500,
      });

      expect(res.created).toBe(true);
      expect(res.entry.amountMl).toBe(500);
    });

    it('detects cross-user water ID collision and throws 409 Conflict', async () => {
      const user2Water = new WaterIntake({
        id: water1Id,
        userId: user2, // Owned by user2
        date: '2026-11-05',
        amountMl: 500,
      });

      vi.mocked(waterRepo.findById).mockResolvedValueOnce(user2Water);

      const useCase = new LogWaterUseCase(waterRepo);
      await expect(
        useCase.execute({
          id: water1Id,
          userId: user1,
          date: '2026-11-05',
          amountMl: 250,
        }),
      ).rejects.toMatchObject({
        kind: 'conflict',
        code: 'CONFLICT',
      });
    });
  });

  describe('GetNutritionAnalyticsUseCase', () => {
    it('computes accurate analytics, macro calorie percentages, and top foods across logged days only', async () => {
      const mealDay1 = new Meal({
        id: 'm1111111-1111-4111-8111-111111111111',
        userId: user1,
        mealType: 'lunch',
        date: '2026-11-04',
        totalCalories: 600,
        totalProteinG: 50, // 50 * 4 = 200 kcal
        totalCarbsG: 50,   // 50 * 4 = 200 kcal
        totalFatG: 22.2,   // 22.2 * 9 = 200 kcal
        totalFiberG: 5,
        items: [],
      });

      const mealDay2 = new Meal({
        id: 'm2222222-2222-4222-8222-222222222222',
        userId: user1,
        mealType: 'dinner',
        date: '2026-11-05',
        totalCalories: 800,
        totalProteinG: 70,
        totalCarbsG: 70,
        totalFatG: 26.7,
        totalFiberG: 8,
        items: [],
      });

      vi.mocked(mealRepo.listDateRange).mockResolvedValueOnce([mealDay1, mealDay2]);
      vi.mocked(targetPort.findTargetsByUserId).mockResolvedValueOnce({
        dailyCalorieTarget: 2200,
        dailyProteinGrams: 160,
      });
      vi.mocked(mealRepo.getMostLoggedFoods).mockResolvedValueOnce([
        { foodName: 'Chicken Breast, raw', count: 5, totalCalories: 1000 },
      ]);

      const useCase = new GetNutritionAnalyticsUseCase(mealRepo, targetPort);
      const res = await useCase.execute({
        userId: user1,
        range: 'week',
        endDate: '2026-11-05',
      });

      expect(res.range).toBe('week');
      expect(res.totalDaysInRange).toBe(7);
      expect(res.loggedDaysCount).toBe(2);
      // Average across the 2 logged days = (600 + 800) / 2 = 700 kcal
      expect(res.avgCalories).toBe(700);
      expect(res.avgProtein).toBe(60);
      expect(res.targetCalories).toBe(2200);
      expect(res.targetProtein).toBe(160);

      expect(res.topFoods).toHaveLength(1);
      expect(res.topFoods[0]!.foodName).toBe('Chicken Breast, raw');

      // Macro splits:
      // Total protein: 120g -> 480 kcal
      // Total carbs: 120g -> 480 kcal
      // Total fat: 48.9g -> ~440 kcal
      // Total macro kcal: ~1400 kcal
      expect(res.macroSplit).toHaveLength(3);
      const [proteinSplit, carbsSplit, fatSplit] = res.macroSplit;
      expect(proteinSplit!.label).toBe('Protein');
      expect(carbsSplit!.label).toBe('Carbs');
      expect(fatSplit!.label).toBe('Fat');
      expect(proteinSplit!.pct + carbsSplit!.pct + fatSplit!.pct).toBe(100);

      expect(res.caloriesTrend).toHaveLength(7);
      expect(res.proteinTrend).toHaveLength(7);
    });
  });

  describe('ManageFoodFavoritesUseCase', () => {
    it('toggles favorite on and off for accessible foods', async () => {
      vi.mocked(favoriteRepo.isFavorite)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      vi.mocked(foodRepo.findById).mockResolvedValue(verifiedEgg);

      const useCase = new ManageFoodFavoritesUseCase(favoriteRepo, foodRepo);

      const res1 = await useCase.toggleFavorite(user1, food1Id);
      expect(res1.isFavorite).toBe(true);
      expect(favoriteRepo.addFavorite).toHaveBeenCalledWith(user1, food1Id);

      const res2 = await useCase.toggleFavorite(user1, food1Id);
      expect(res2.isFavorite).toBe(false);
      expect(favoriteRepo.removeFavorite).toHaveBeenCalledWith(user1, food1Id);
    });

    it('forbids favoriting another user private custom food', async () => {
      vi.mocked(favoriteRepo.isFavorite).mockResolvedValueOnce(false);
      vi.mocked(foodRepo.findById)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(user1CustomFood);

      const useCase = new ManageFoodFavoritesUseCase(favoriteRepo, foodRepo);
      await expect(useCase.toggleFavorite(user2, customFoodId)).rejects.toMatchObject({
        kind: 'forbidden',
        code: 'FORBIDDEN',
      });
    });
  });

  describe('GetRecentFoodsUseCase', () => {
    it('returns recent foods with correct favorite flags', async () => {
      vi.mocked(foodRepo.listRecent).mockResolvedValueOnce([verifiedEgg]);
      vi.mocked(favoriteRepo.listFavoriteFoodIds).mockResolvedValueOnce([food1Id]);

      const useCase = new GetRecentFoodsUseCase(foodRepo, favoriteRepo);
      const foods = await useCase.execute({ userId: user1 });

      expect(foods).toHaveLength(1);
      expect(foods[0]!.id).toBe(food1Id);
      expect(foods[0]!.isFavorite).toBe(true);
    });
  });
});

