import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';
import { seedUser, type SeededUser } from '../../helpers/test-app.js';
import { seedFoods } from '../../../scripts/seed-foods.js';
import { Database, PgUnitOfWork } from '../../../src/database/transaction.js';
import {
  PgFoodRepository,
  PgMealRepository,
  PgWaterRepository,
  PgFavoriteRepository,
  PgUserProfileTargetAdapter,
  SearchFoodsUseCase,
  GetFoodDetailsUseCase,
  CreateCustomFoodUseCase,
  LogMealUseCase,
  UpdateMealUseCase,
  GetMealUseCase,
  LogWaterUseCase,
  GetDailyNutritionUseCase,
  GetNutritionAnalyticsUseCase,
  ManageFoodFavoritesUseCase,
} from '../../../src/modules/nutrition/index.js';

describe('Nutrition Database Integration Tests (Real PostgreSQL)', () => {
  let db: TestDatabase;
  let database: Database;
  let uow: PgUnitOfWork;

  let foodRepo: PgFoodRepository;
  let mealRepo: PgMealRepository;
  let waterRepo: PgWaterRepository;
  let favoriteRepo: PgFavoriteRepository;
  let targetAdapter: PgUserProfileTargetAdapter;

  let user1: SeededUser;
  let user2: SeededUser;

  beforeAll(async () => {
    db = await createTestDatabase();
    database = new Database(db.pool);
    uow = new PgUnitOfWork(database);

    foodRepo = new PgFoodRepository(database);
    mealRepo = new PgMealRepository(database);
    waterRepo = new PgWaterRepository(database);
    favoriteRepo = new PgFavoriteRepository(database);
    targetAdapter = new PgUserProfileTargetAdapter(database);

    user1 = await seedUser(db.pool, { email: 'nutrition-user1@example.com' });
    user2 = await seedUser(db.pool, { email: 'nutrition-user2@example.com' });
  });

  afterAll(async () => {
    await db.drop();
  });

  describe('STEP 2 — Migration & Schema Verification', () => {
    it('creates all five approved nutrition tables with proper schema', async () => {
      const { rows } = await db.pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      );
      const tables = rows.map((r) => r.table_name);

      expect(tables).toContain('foods');
      expect(tables).toContain('meals');
      expect(tables).toContain('meal_items');
      expect(tables).toContain('water_intake');
      expect(tables).toContain('food_favorites');
    });

    it('enforces table constraints, ownership checks, and positive serving metadata', async () => {
      // 1. foods: check positive serving_weight_g
      await expect(
        db.pool.query(
          `INSERT INTO foods (id, name, serving_size, serving_unit, serving_weight_g, serving_basis, calories, protein_g, carbohydrates_g, fat_g, fiber_g, data_source, is_custom, is_verified, verification_status)
           VALUES (gen_random_uuid(), 'Bad Weight Food', 1, 'piece', -10, '100g', 100, 10, 10, 2, 1, 'user_custom', true, false, 'unverified')`,
        ),
      ).rejects.toThrow();

      // 2. foods: check ownership (custom food without creator must fail)
      await expect(
        db.pool.query(
          `INSERT INTO foods (id, name, serving_size, serving_unit, serving_weight_g, serving_basis, calories, protein_g, carbohydrates_g, fat_g, fiber_g, data_source, is_custom, is_verified, verification_status, created_by)
           VALUES (gen_random_uuid(), 'Orphan Custom Food', 1, 'piece', 50, '100g', 100, 10, 10, 2, 1, 'user_custom', true, false, 'unverified', NULL)`,
        ),
      ).rejects.toThrow();

      // 3. meals: check valid meal_type
      await expect(
        db.pool.query(
          `INSERT INTO meals (id, user_id, meal_type, date, total_calories, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g)
           VALUES (gen_random_uuid(), $1, 'midnight_snack', '2026-11-05', 100, 10, 10, 2, 1)`,
          [user1.id],
        ),
      ).rejects.toThrow();

      // 4. water_intake: check positive amount_ml
      await expect(
        db.pool.query(
          `INSERT INTO water_intake (id, user_id, date, amount_ml)
           VALUES (gen_random_uuid(), $1, '2026-11-05', -100)`,
          [user1.id],
        ),
      ).rejects.toThrow();

      // 5. food_favorites: unique (user_id, food_id)
      const foodId = 'f0000000-0000-4000-8000-000000000001';
      // First insert an authentic food
      await db.pool.query(
        `INSERT INTO foods (id, name, serving_size, serving_unit, serving_weight_g, serving_basis, calories, protein_g, carbohydrates_g, fat_g, fiber_g, data_source, is_custom, is_verified, verification_status)
         VALUES ($1, 'Test Chicken', 100, 'g', 100, '100g', 120, 22.5, 0, 2.6, 0, 'usda_fdc', false, true, 'verified')
         ON CONFLICT (id) DO NOTHING`,
        [foodId],
      );

      await db.pool.query(`INSERT INTO food_favorites (user_id, food_id) VALUES ($1, $2)`, [
        user1.id,
        foodId,
      ]);
      // Duplicate must fail
      await expect(
        db.pool.query(`INSERT INTO food_favorites (user_id, food_id) VALUES ($1, $2)`, [user1.id, foodId]),
      ).rejects.toThrow();
    });

    it('populates and verifies the 25 USDA verified food records repeatably', async () => {
      // First run
      await seedFoods(db.pool);
      const count1 = await foodRepo.countVerified();
      expect(count1).toBe(25);

      // Repeatable seed run (idempotent ON CONFLICT update)
      await seedFoods(db.pool);
      const count2 = await foodRepo.countVerified();
      expect(count2).toBe(25);

      // Verify specific physical densities
      const oliveOil = await foodRepo.findByBarcode('012345678901'); // Look up olive oil by source id
      expect(oliveOil).toBeDefined();
      const { rows: oliveRows } = await db.pool.query<{
        density_g_per_ml: string;
        serving_volume_ml: string;
        serving_weight_g: string;
      }>(
        `SELECT density_g_per_ml, serving_volume_ml, serving_weight_g FROM foods WHERE source_id = '171413'`,
      );
      expect(oliveRows).toHaveLength(1);
      expect(Number(oliveRows[0]!.density_g_per_ml)).toBeCloseTo(0.9184, 4);
      expect(Number(oliveRows[0]!.serving_weight_g)).toBeCloseTo(13.5, 1);
    });
  });

  describe('STEP 3 — Real Database Integration Tests', () => {
    it('1. Verified food search with trigram index', async () => {
      const searchUseCase = new SearchFoodsUseCase(foodRepo, favoriteRepo);
      const res = await searchUseCase.execute({
        userId: user1.id,
        query: 'egg',
        page: 1,
        limit: 10,
      });

      expect(res.total).toBeGreaterThanOrEqual(1);
      const eggFood = res.foods.find((f) => f.name.toLowerCase().includes('egg'));
      expect(eggFood).toBeDefined();
      expect(eggFood!.isVerified).toBe(true);
      expect(eggFood!.standardServingNutrients.calories).toBe(71.5);
    });

    it('2. Custom food privacy between two users', async () => {
      const createCustomUseCase = new CreateCustomFoodUseCase(foodRepo);
      const customFood = await createCustomUseCase.execute({
        userId: user1.id,
        name: 'User 1 Secret Protein Bar',
        servingSize: 1,
        servingUnit: 'bar',
        servingWeightG: 60,
        calories: 210,
        proteinG: 20,
        carbohydratesG: 22,
        fatG: 5,
        fiberG: 4,
      });

      expect(customFood.isCustom).toBe(true);
      expect(customFood.isVerified).toBe(false);

      // User 1 can see it
      const user1Found = await foodRepo.findById(customFood.id, user1.id);
      expect(user1Found).not.toBeNull();
      expect(user1Found!.name).toBe('User 1 Secret Protein Bar');

      // User 2 cannot see it in search
      const user2Search = await foodRepo.search({
        query: 'Secret Protein Bar',
        userId: user2.id,
        offset: 0,
        limit: 10,
      });
      const user2FoundInSearch = user2Search.foods.some((f) => f.id === customFood.id);
      expect(user2FoundInSearch).toBe(false);

      // User 2 cannot access by ID
      const getDetailsUseCase = new GetFoodDetailsUseCase(foodRepo, favoriteRepo);
      await expect(getDetailsUseCase.execute({ userId: user2.id, id: customFood.id })).rejects.toMatchObject({
        kind: 'forbidden',
        code: 'FORBIDDEN',
      });
    });

    it('3 & 4. Meal creation with multiple items & server-side nutrition calculations', async () => {
      const logMealUseCase = new LogMealUseCase(mealRepo, foodRepo, uow);
      const eggFoodId = 'f0000000-0000-4000-8000-000000000002'; // Egg (50g/piece, 143 kcal/100g)
      const chickenFoodId = 'f0000000-0000-4000-8000-000000000001'; // Chicken (100g, 120 kcal/100g)

      const mealDate = '2026-11-05';
      const result = await logMealUseCase.execute({
        userId: user1.id,
        mealType: 'lunch',
        date: mealDate,
        notes: 'High protein lunch',
        items: [
          {
            foodId: eggFoodId,
            servingMultiplier: 2, // 2 eggs = 100g -> 143.0 kcal, 12.56g protein
          },
          {
            foodId: chickenFoodId,
            servingMultiplier: 1.5, // 150g chicken -> 180.0 kcal, 33.75g protein
          },
        ],
      });

      expect(result.created).toBe(true);
      expect(result.meal.items).toHaveLength(2);

      // Verify exact calculated totals
      // 143.0 + 180.0 = 323.0 kcal
      expect(result.meal.totalCalories).toBe(323.0);
      // 12.56 + 33.75 = 46.31 g protein
      expect(result.meal.totalProteinG).toBe(46.31);

      // Verify database records directly
      const { rows: dbMeals } = await db.pool.query<{ id: string; total_calories: string }>(
        `SELECT id, total_calories FROM meals WHERE id = $1`,
        [result.meal.id],
      );
      expect(dbMeals).toHaveLength(1);
      expect(Number(dbMeals[0]!.total_calories)).toBe(323.0);

      const { rows: dbItems } = await db.pool.query<{
        food_name: string;
        logged_weight_g: string;
        calories: string;
      }>(
        `SELECT food_name, logged_weight_g, calories FROM meal_items WHERE meal_id = $1 ORDER BY calories ASC`,
        [result.meal.id],
      );
      expect(dbItems).toHaveLength(2);
      expect(Number(dbItems[0]!.calories)).toBe(143.0); // Egg
      expect(Number(dbItems[0]!.logged_weight_g)).toBe(100.0);
      expect(Number(dbItems[1]!.calories)).toBe(180.0); // Chicken
      expect(Number(dbItems[1]!.logged_weight_g)).toBe(150.0);
    });

    it('5. Meal creation transaction rollback on failure', async () => {
      const doomedMealId = crypto.randomUUID();
      const eggFoodId = 'f0000000-0000-4000-8000-000000000002';

      await expect(
        uow.run(async () => {
          // 1. Insert meal using database.query (which joins the active UoW transaction)
          await database.query(
            `INSERT INTO meals (id, user_id, meal_type, date, total_calories, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g)
             VALUES ($1, $2, 'dinner', '2026-11-05', 100, 10, 10, 2, 1)`,
            [doomedMealId, user1.id],
          );

          // 2. Insert one valid item using database.query
          await database.query(
            `INSERT INTO meal_items (id, meal_id, food_id, food_name, serving_size, serving_unit, serving_weight_g, serving_multiplier, logged_weight_g, calories, protein_g, carbs_g, fat_g, fiber_g)
             VALUES (gen_random_uuid(), $1, $2, 'Egg', 1, 'piece', 50, 1, 50, 71.5, 6.28, 0.36, 4.76, 0)`,
            [doomedMealId, eggFoodId],
          );

          // 3. Deliberately explode
          throw new Error('Simulated network/DB error inside transaction');
        }),
      ).rejects.toThrow('Simulated network/DB error inside transaction');

      // Verify rollback: neither the meal nor items exist
      const { rows: meals } = await db.pool.query(`SELECT id FROM meals WHERE id = $1`, [doomedMealId]);
      expect(meals).toHaveLength(0);

      const { rows: items } = await db.pool.query(`SELECT id FROM meal_items WHERE meal_id = $1`, [
        doomedMealId,
      ]);
      expect(items).toHaveLength(0);
    });

    it('6. Same-user offline retry idempotency', async () => {
      const logMealUseCase = new LogMealUseCase(mealRepo, foodRepo, uow);
      const syncMealId = crypto.randomUUID();
      const eggFoodId = 'f0000000-0000-4000-8000-000000000002';

      // First sync attempt
      const attempt1 = await logMealUseCase.execute({
        id: syncMealId,
        userId: user1.id,
        mealType: 'breakfast',
        date: '2026-11-05',
        items: [{ foodId: eggFoodId, servingMultiplier: 1 }],
      });
      expect(attempt1.created).toBe(true);
      expect(attempt1.meal.id).toBe(syncMealId);

      // Immediate retry with identical UUID
      const attempt2 = await logMealUseCase.execute({
        id: syncMealId,
        userId: user1.id,
        mealType: 'breakfast',
        date: '2026-11-05',
        items: [{ foodId: eggFoodId, servingMultiplier: 1 }],
      });
      expect(attempt2.created).toBe(false);
      expect(attempt2.meal.id).toBe(syncMealId);

      // Verify no duplicate items were inserted
      const { rows: items } = await db.pool.query(`SELECT id FROM meal_items WHERE meal_id = $1`, [
        syncMealId,
      ]);
      expect(items).toHaveLength(1);
    });

    it('7. Cross-user UUID collision rejection', async () => {
      const logMealUseCase = new LogMealUseCase(mealRepo, foodRepo, uow);
      const user1MealId = crypto.randomUUID();
      const eggFoodId = 'f0000000-0000-4000-8000-000000000002';

      // User 1 creates meal
      await logMealUseCase.execute({
        id: user1MealId,
        userId: user1.id,
        mealType: 'lunch',
        date: '2026-11-05',
        items: [{ foodId: eggFoodId, servingMultiplier: 1 }],
      });

      // User 2 attempts to use User 1's meal UUID
      await expect(
        logMealUseCase.execute({
          id: user1MealId,
          userId: user2.id,
          mealType: 'lunch',
          date: '2026-11-05',
          items: [{ foodId: eggFoodId, servingMultiplier: 1 }],
        }),
      ).rejects.toMatchObject({
        kind: 'conflict',
        code: 'CONFLICT',
      });
    });

    it('8. Concurrent requests with identical UUIDs', async () => {
      const logMealUseCase = new LogMealUseCase(mealRepo, foodRepo, uow);
      const sharedUuid = crypto.randomUUID();
      const eggFoodId = 'f0000000-0000-4000-8000-000000000002';

      // Dispatch 5 concurrent requests with identical UUID
      const results = await Promise.all([
        logMealUseCase.execute({
          id: sharedUuid,
          userId: user1.id,
          mealType: 'snack',
          date: '2026-11-05',
          items: [{ foodId: eggFoodId, servingMultiplier: 1 }],
        }),
        logMealUseCase.execute({
          id: sharedUuid,
          userId: user1.id,
          mealType: 'snack',
          date: '2026-11-05',
          items: [{ foodId: eggFoodId, servingMultiplier: 1 }],
        }),
        logMealUseCase.execute({
          id: sharedUuid,
          userId: user1.id,
          mealType: 'snack',
          date: '2026-11-05',
          items: [{ foodId: eggFoodId, servingMultiplier: 1 }],
        }),
        logMealUseCase.execute({
          id: sharedUuid,
          userId: user1.id,
          mealType: 'snack',
          date: '2026-11-05',
          items: [{ foodId: eggFoodId, servingMultiplier: 1 }],
        }),
        logMealUseCase.execute({
          id: sharedUuid,
          userId: user1.id,
          mealType: 'snack',
          date: '2026-11-05',
          items: [{ foodId: eggFoodId, servingMultiplier: 1 }],
        }),
      ]);

      const createdCount = results.filter((r) => r.created).length;
      const replayedCount = results.filter((r) => !r.created).length;

      expect(createdCount).toBe(1);
      expect(replayedCount).toBe(4);

      // Verify database contains exactly 1 meal row and 1 item row
      const { rows: meals } = await db.pool.query(`SELECT id FROM meals WHERE id = $1`, [sharedUuid]);
      expect(meals).toHaveLength(1);

      const { rows: items } = await db.pool.query(`SELECT id FROM meal_items WHERE meal_id = $1`, [
        sharedUuid,
      ]);
      expect(items).toHaveLength(1);
    });

    it('9. Meal update and immutable historical snapshots', async () => {
      const logMealUseCase = new LogMealUseCase(mealRepo, foodRepo, uow);
      const updateMealUseCase = new UpdateMealUseCase(mealRepo, foodRepo, uow);
      const eggFoodId = 'f0000000-0000-4000-8000-000000000002';

      const initial = await logMealUseCase.execute({
        userId: user1.id,
        mealType: 'dinner',
        date: '2026-11-05',
        items: [{ foodId: eggFoodId, servingMultiplier: 1 }],
      });

      // Update to 3 eggs
      const updated = await updateMealUseCase.execute({
        id: initial.meal.id,
        userId: user1.id,
        notes: 'Tripled the eggs',
        items: [{ foodId: eggFoodId, servingMultiplier: 3 }],
      });

      expect(updated.notes).toBe('Tripled the eggs');
      expect(updated.totalCalories).toBe(214.5); // 3 * 71.5

      // Mutate food catalog calories in foods table (simulating future USDA revision)
      await db.pool.query(`UPDATE foods SET calories = 999.0 WHERE id = $1`, [eggFoodId]);

      // Fetch meal again: historical snapshot in meal_items MUST NOT CHANGE
      const getMealUseCase = new GetMealUseCase(mealRepo);
      const fetched = await getMealUseCase.execute(user1.id, initial.meal.id);

      expect(fetched.totalCalories).toBe(214.5);
      expect(fetched.items[0]!.calories).toBe(214.5);

      // Restore food calories
      await db.pool.query(`UPDATE foods SET calories = 143.0 WHERE id = $1`, [eggFoodId]);
    });

    it('10. Water logging and retry idempotency', async () => {
      const logWaterUseCase = new LogWaterUseCase(waterRepo);
      const waterId = crypto.randomUUID();

      const res1 = await logWaterUseCase.execute({
        id: waterId,
        userId: user1.id,
        date: '2026-11-05',
        amountMl: 350,
      });
      expect(res1.created).toBe(true);

      const res2 = await logWaterUseCase.execute({
        id: waterId,
        userId: user1.id,
        date: '2026-11-05',
        amountMl: 350,
      });
      expect(res2.created).toBe(false);

      const { rows } = await db.pool.query(`SELECT id FROM water_intake WHERE id = $1`, [waterId]);
      expect(rows).toHaveLength(1);
    });

    it('11. Food favorites ownership', async () => {
      await db.pool.query(`DELETE FROM food_favorites`);
      const favoritesUseCase = new ManageFoodFavoritesUseCase(favoriteRepo, foodRepo);
      const chickenFoodId = 'f0000000-0000-4000-8000-000000000001';

      // Both users favorite chicken
      const user1Fav = await favoritesUseCase.toggleFavorite(user1.id, chickenFoodId);
      const user2Fav = await favoritesUseCase.toggleFavorite(user2.id, chickenFoodId);

      expect(user1Fav.isFavorite).toBe(true);
      expect(user2Fav.isFavorite).toBe(true);

      // User 1 removes favorite
      const user1Unfav = await favoritesUseCase.toggleFavorite(user1.id, chickenFoodId);
      expect(user1Unfav.isFavorite).toBe(false);

      // User 2 favorite still exists
      const user2List = await favoritesUseCase.listFavorites(user2.id);
      const stillFavorited = user2List.foods.some((f) => f.id === chickenFoodId);
      expect(stillFavorited).toBe(true);
    });

    it('12. Daily nutrition aggregation against real database and user profile targets', async () => {
      // Set user profile targets
      await db.pool.query(
        `INSERT INTO user_profiles (user_id, daily_calorie_target, daily_protein_grams, onboarding_completed)
         VALUES ($1, 2500, 160, true)
         ON CONFLICT (user_id) DO UPDATE SET daily_calorie_target = 2500, daily_protein_grams = 160`,
        [user1.id],
      );

      const getDailyUseCase = new GetDailyNutritionUseCase(mealRepo, waterRepo, targetAdapter);
      const daily = await getDailyUseCase.execute({ userId: user1.id, date: '2026-11-05' });

      expect(daily.date).toBe('2026-11-05');
      expect(daily.targets).toEqual({
        calories: 2500,
        proteinG: 160,
        carbsG: null,
        fatG: null,
        waterMl: null,
      });
      expect(daily.consumed.calories).toBeGreaterThan(0);
      expect(daily.consumed.waterMl).toBeGreaterThanOrEqual(350);
      expect(daily.remaining).not.toBeNull();
      expect(daily.remaining!.calories).toBe(
        Math.max(0, Math.round((2500 - daily.consumed.calories) * 10) / 10),
      );
    });

    it('13. Nutrition analytics accuracy from real logged records', async () => {
      const getAnalyticsUseCase = new GetNutritionAnalyticsUseCase(mealRepo, targetAdapter);
      const analytics = await getAnalyticsUseCase.execute({
        userId: user1.id,
        range: 'week',
        endDate: '2026-11-05',
      });

      expect(analytics.range).toBe('week');
      expect(analytics.totalDaysInRange).toBe(7);
      expect(analytics.loggedDaysCount).toBeGreaterThanOrEqual(1);
      expect(analytics.avgCalories).toBeGreaterThan(0);
      expect(analytics.macroSplit).toHaveLength(3);
      expect(analytics.macroSplit[0]!.pct + analytics.macroSplit[1]!.pct + analytics.macroSplit[2]!.pct).toBe(
        100,
      );
      expect(analytics.topFoods.length).toBeGreaterThanOrEqual(1);
    });

    it('14. Foreign key behavior after catalog soft deletion', async () => {
      const logMealUseCase = new LogMealUseCase(mealRepo, foodRepo, uow);
      const chickenFoodId = 'f0000000-0000-4000-8000-000000000001';

      const meal = await logMealUseCase.execute({
        userId: user1.id,
        mealType: 'lunch',
        date: '2026-11-06',
        items: [{ foodId: chickenFoodId, servingMultiplier: 1 }],
      });

      // Soft delete chicken
      await foodRepo.softDelete(chickenFoodId);

      // Verify meal item still references the food ID and keeps its frozen name and nutrients
      const { rows } = await db.pool.query<{ food_id: string; food_name: string; calories: string }>(
        `SELECT food_id, food_name, calories FROM meal_items WHERE meal_id = $1`,
        [meal.meal.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.food_id).toBe(chickenFoodId);
      expect(rows[0]!.food_name).toContain('Chicken Breast');

      // But searching for chicken no longer returns it
      const searchRes = await foodRepo.search({ query: 'Chicken Breast', offset: 0, limit: 10 });
      expect(searchRes.foods.some((f) => f.id === chickenFoodId)).toBe(false);

      // Un-soft-delete to restore clean state
      await db.pool.query(`UPDATE foods SET deleted_at = NULL WHERE id = $1`, [chickenFoodId]);
    });
  });
});
