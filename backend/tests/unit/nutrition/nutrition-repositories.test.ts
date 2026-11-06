import { describe, expect, it, vi } from 'vitest';
import type { SqlExecutor } from '../../../src/database/transaction.js';
import { Food } from '../../../src/modules/nutrition/domain/food.js';
import { Meal, MealItem } from '../../../src/modules/nutrition/domain/meal.js';
import { WaterIntake } from '../../../src/modules/nutrition/domain/water.js';
import { PgFoodRepository } from '../../../src/modules/nutrition/infrastructure/pg-food-repository.js';
import { PgMealRepository } from '../../../src/modules/nutrition/infrastructure/pg-meal-repository.js';
import { PgWaterRepository } from '../../../src/modules/nutrition/infrastructure/pg-water-repository.js';
import { PgFavoriteRepository } from '../../../src/modules/nutrition/infrastructure/pg-favorite-repository.js';

function createMockDb(): SqlExecutor & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(),
  };
}

describe('Nutrition Repositories', () => {
  const sampleFoodRow = {
    id: 'f0000000-0000-4000-8000-000000000001',
    name: 'Chicken Breast, boneless, skinless, raw',
    brand: null,
    barcode: '123456789012',
    serving_size: '100',
    serving_unit: 'g',
    serving_weight_g: '100',
    serving_volume_ml: null,
    density_g_per_ml: null,
    serving_basis: '100g',
    calories: '120.0',
    protein_g: '22.5',
    carbohydrates_g: '0.0',
    fat_g: '2.62',
    fiber_g: '0.0',
    sugar_g: '0.0',
    sodium_mg: '45.0',
    cholesterol_mg: '73.0',
    data_source: 'usda_fdc',
    source_id: '171077',
    is_custom: false,
    is_verified: true,
    verification_status: 'verified',
    created_by: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    deleted_at: null,
  };

  describe('PgFoodRepository', () => {
    it('findById queries with proper visibility constraint', async () => {
      const db = createMockDb();
      db.query.mockResolvedValueOnce({ rows: [sampleFoodRow], rowCount: 1 });
      const repo = new PgFoodRepository(db);

      const food = await repo.findById(sampleFoodRow.id, 'user-123');

      expect(food).not.toBeNull();
      expect(food?.id).toBe(sampleFoodRow.id);
      expect(db.query).toHaveBeenCalledTimes(1);

      const [sql, params] = db.query.mock.calls[0]!;
      expect(sql).toContain('WHERE id = $1 AND deleted_at IS NULL AND (is_verified = true OR created_by = $2)');
      expect(params).toEqual([sampleFoodRow.id, 'user-123']);
    });

    it('findByBarcode prioritizes verified catalog records', async () => {
      const db = createMockDb();
      db.query.mockResolvedValueOnce({ rows: [sampleFoodRow], rowCount: 1 });
      const repo = new PgFoodRepository(db);

      const food = await repo.findByBarcode('123456789012', 'user-123');

      expect(food).not.toBeNull();
      const [sql, params] = db.query.mock.calls[0]!;
      expect(sql).toContain('ORDER BY is_verified DESC LIMIT 1');
      expect(params).toEqual(['123456789012', 'user-123']);
    });

    it('search filters by search query and user visibility', async () => {
      const db = createMockDb();
      db.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 }) // count query
        .mockResolvedValueOnce({ rows: [sampleFoodRow], rowCount: 1 }); // rows query
      const repo = new PgFoodRepository(db);

      const res = await repo.search({
        query: 'chicken',
        userId: 'user-123',
        offset: 0,
        limit: 10,
      });

      expect(res.total).toBe(1);
      expect(res.foods.length).toBe(1);

      const [countSql, countParams] = db.query.mock.calls[0]!;
      expect(countSql).toContain('(is_verified = true OR created_by = $1)');
      expect(countSql).toContain('(name ILIKE $2 OR (brand IS NOT NULL AND brand ILIKE $2))');
      expect(countParams).toEqual(['user-123', '%chicken%']);
    });

    it('update rejects modifying verified foods or foods of other users', async () => {
      const db = createMockDb();
      // First findById call returns a verified food
      db.query.mockResolvedValueOnce({ rows: [sampleFoodRow], rowCount: 1 });
      const repo = new PgFoodRepository(db);

      await expect(
        repo.update(sampleFoodRow.id, { name: 'Hacked Chicken' }, 'user-malicious'),
      ).rejects.toThrow(/Unauthorized: cannot edit foods/);
    });

    it('softDelete enforces ownership for custom food deletion', async () => {
      const db = createMockDb();
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const repo = new PgFoodRepository(db);

      const deleted = await repo.softDelete('custom-food-1', 'user-owner');

      expect(deleted).toBe(true);
      const [sql, params] = db.query.mock.calls[0]!;
      expect(sql).toContain('created_by = $2 AND is_verified = false');
      expect(params).toEqual(['custom-food-1', 'user-owner']);
    });
  });

  describe('PgMealRepository (Idempotency & Snapshots)', () => {
    const mealItem = new MealItem({
      id: 'i1111111-1111-4111-8111-111111111111',
      mealId: 'm1111111-1111-4111-8111-111111111111',
      foodId: sampleFoodRow.id,
      foodName: sampleFoodRow.name,
      foodBrand: null,
      servingSize: 100,
      servingUnit: 'g',
      servingWeightG: 100,
      servingMultiplier: 1.0,
      loggedWeightG: 100,
      calories: 120.0,
      proteinG: 22.5,
      carbsG: 0.0,
      fatG: 2.62,
      fiberG: 0.0,
    });

    const meal = new Meal({
      id: 'm1111111-1111-4111-8111-111111111111',
      userId: 'u1111111-1111-4111-8111-111111111111',
      mealType: 'lunch',
      date: '2026-11-05',
      items: [mealItem],
    });

    it('create executes ON CONFLICT (id) DO NOTHING and inserts items on fresh create', async () => {
      const db = createMockDb();
      // 1. insert meal returns id (fresh insert)
      db.query.mockResolvedValueOnce({ rows: [{ id: meal.id }], rowCount: 1 });
      // 2. insert item
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const repo = new PgMealRepository(db);
      const result = await repo.create(meal);

      expect(result.created).toBe(true);
      expect(result.meal.id).toBe(meal.id);

      const [mealSql] = db.query.mock.calls[0]!;
      expect(mealSql).toContain('ON CONFLICT (id) DO NOTHING');
      expect(mealSql).toContain('RETURNING id');

      const [itemSql, itemParams] = db.query.mock.calls[1]!;
      expect(itemSql).toContain('INSERT INTO meal_items');
      expect(itemParams[0]).toBe(mealItem.id);
      expect(itemParams[10]).toBe(120.0); // snapshot calories
    });

    it('create safely handles retries without overwriting newer updates', async () => {
      const db = createMockDb();
      // 1. insert meal returns empty rows (conflict, already existed!)
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // 2. findById fetch of existing meal
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: meal.id,
            user_id: meal.userId,
            meal_type: 'lunch',
            date: '2026-11-05',
            total_calories: '120.0',
            total_protein_g: '22.5',
            total_carbs_g: '0.0',
            total_fat_g: '2.62',
            total_fiber_g: '0.0',
            notes: 'Existing note',
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          },
        ],
        rowCount: 1,
      });
      // 3. findById fetch of existing items
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const repo = new PgMealRepository(db);
      const result = await repo.create(meal);

      expect(result.created).toBe(false);
      expect(result.meal.id).toBe(meal.id);
      // Items were NOT re-inserted
      expect(db.query).toHaveBeenCalledTimes(3);
    });

    it('update updates meal row and replaces items atomically', async () => {
      const db = createMockDb();
      // 1. findById check
      db.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: meal.id,
              user_id: meal.userId,
              meal_type: 'lunch',
              date: '2026-11-05',
              total_calories: '120.0',
              total_protein_g: '22.5',
              total_carbs_g: '0.0',
              total_fat_g: '2.62',
              total_fiber_g: '0.0',
              notes: null,
              created_at: new Date(),
              updated_at: new Date(),
              deleted_at: null,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // items for initial findById
      // 2. update meal query
      db.query.mockResolvedValueOnce({ rows: [{ id: meal.id }], rowCount: 1 });
      // 3. delete old items
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // 4. insert new items
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // 5. final findById fetch
      db.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: meal.id,
              user_id: meal.userId,
              meal_type: 'lunch',
              date: '2026-11-05',
              total_calories: '120.0',
              total_protein_g: '22.5',
              total_carbs_g: '0.0',
              total_fat_g: '2.62',
              total_fiber_g: '0.0',
              notes: 'Updated note',
              created_at: new Date(),
              updated_at: new Date(),
              deleted_at: null,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const repo = new PgMealRepository(db);
      const updated = await repo.update(meal.id, meal.userId, meal);

      expect(updated).not.toBeNull();
      const deleteCall = db.query.mock.calls.find((c) => c[0].includes('DELETE FROM meal_items'));
      expect(deleteCall).toBeDefined();
    });
  });

  describe('PgWaterRepository (Idempotency & Aggregation)', () => {
    const waterEntry = new WaterIntake({
      id: 'w1111111-1111-4111-8111-111111111111',
      userId: 'u1111111-1111-4111-8111-111111111111',
      date: '2026-11-05',
      amountMl: 250,
    });

    it('create executes ON CONFLICT (id) DO NOTHING', async () => {
      const db = createMockDb();
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: waterEntry.id,
            user_id: waterEntry.userId,
            date: waterEntry.date,
            amount_ml: 250,
            logged_at: new Date(),
            created_at: new Date(),
          },
        ],
        rowCount: 1,
      });

      const repo = new PgWaterRepository(db);
      const result = await repo.create(waterEntry);

      expect(result.created).toBe(true);
      expect(result.entry.amountMl).toBe(250);

      const [sql] = db.query.mock.calls[0]!;
      expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    });

    it('create returns created = false on duplicate offline sync retry', async () => {
      const db = createMockDb();
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // conflict ignored

      const repo = new PgWaterRepository(db);
      const result = await repo.create(waterEntry);

      expect(result.created).toBe(false);
      expect(result.entry.id).toBe(waterEntry.id);
    });

    it('getTotalByDate sums amount_ml accurately', async () => {
      const db = createMockDb();
      db.query.mockResolvedValueOnce({ rows: [{ total: '1750' }], rowCount: 1 });

      const repo = new PgWaterRepository(db);
      const total = await repo.getTotalByDate(waterEntry.userId, '2026-11-05');

      expect(total).toBe(1750);
      const [sql, params] = db.query.mock.calls[0]!;
      expect(sql).toContain('SELECT COALESCE(SUM(amount_ml), 0)::text AS total FROM water_intake');
      expect(params).toEqual([waterEntry.userId, '2026-11-05']);
    });
  });

  describe('PgFavoriteRepository', () => {
    it('addFavorite executes ON CONFLICT (user_id, food_id) DO NOTHING', async () => {
      const db = createMockDb();
      db.query.mockResolvedValueOnce({ rows: [{ id: 'fav-1' }], rowCount: 1 });

      const repo = new PgFavoriteRepository(db);
      const added = await repo.addFavorite('user-1', 'food-1');

      expect(added).toBe(true);
      const [sql, params] = db.query.mock.calls[0]!;
      expect(sql).toContain('ON CONFLICT (user_id, food_id) DO NOTHING');
      expect(params).toEqual(['user-1', 'food-1']);
    });

    it('removeFavorite deletes by composite keys', async () => {
      const db = createMockDb();
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const repo = new PgFavoriteRepository(db);
      const removed = await repo.removeFavorite('user-1', 'food-1');

      expect(removed).toBe(true);
      const [sql, params] = db.query.mock.calls[0]!;
      expect(sql).toContain('DELETE FROM food_favorites WHERE user_id = $1 AND food_id = $2');
      expect(params).toEqual(['user-1', 'food-1']);
    });
  });
});

