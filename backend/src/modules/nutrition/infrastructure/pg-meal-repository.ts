import type { SqlExecutor } from '../../../database/transaction.js';
import { Meal, MealItem, type MealType } from '../domain/meal.js';
import type { IMealRepository } from '../application/ports.js';

interface MealRow {
  id: string;
  user_id: string;
  meal_type: MealType;
  date: string | Date;
  total_calories: string | number;
  total_protein_g: string | number;
  total_carbs_g: string | number;
  total_fat_g: string | number;
  total_fiber_g: string | number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface MealItemRow {
  id: string;
  meal_id: string;
  food_id: string | null;
  food_name: string;
  food_brand: string | null;
  serving_size: string | number;
  serving_unit: string;
  serving_weight_g: string | number;
  serving_multiplier: string | number;
  logged_weight_g: string | number;
  calories: string | number;
  protein_g: string | number;
  carbs_g: string | number;
  fat_g: string | number;
  fiber_g: string | number;
  created_at: Date;
}

function formatDate(dateVal: string | Date): string {
  if (typeof dateVal === 'string') {
    return dateVal.slice(0, 10);
  }
  return dateVal.toISOString().slice(0, 10);
}

function toItemDomain(row: MealItemRow): MealItem {
  return new MealItem({
    id: row.id,
    mealId: row.meal_id,
    foodId: row.food_id,
    foodName: row.food_name,
    foodBrand: row.food_brand,
    servingSize: Number(row.serving_size),
    servingUnit: row.serving_unit,
    servingWeightG: Number(row.serving_weight_g),
    servingMultiplier: Number(row.serving_multiplier),
    loggedWeightG: Number(row.logged_weight_g),
    calories: Number(row.calories),
    proteinG: Number(row.protein_g),
    carbsG: Number(row.carbs_g),
    fatG: Number(row.fat_g),
    fiberG: Number(row.fiber_g),
    createdAt: row.created_at,
  });
}

function toMealDomain(row: MealRow, items: MealItem[] = []): Meal {
  return new Meal({
    id: row.id,
    userId: row.user_id,
    mealType: row.meal_type,
    date: formatDate(row.date),
    totalCalories: Number(row.total_calories),
    totalProteinG: Number(row.total_protein_g),
    totalCarbsG: Number(row.total_carbs_g),
    totalFatG: Number(row.total_fat_g),
    totalFiberG: Number(row.total_fiber_g),
    notes: row.notes,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PgMealRepository implements IMealRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string, userId?: string): Promise<Meal | null> {
    const conditions = ['id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [id];

    if (userId) {
      conditions.push('user_id = $2');
      values.push(userId);
    }

    const mealRes = await this.db.query<MealRow>(
      `SELECT * FROM meals WHERE ${conditions.join(' AND ')} LIMIT 1`,
      values,
    );
    if (!mealRes.rows[0]) return null;

    const itemsRes = await this.db.query<MealItemRow>(
      `SELECT * FROM meal_items WHERE meal_id = $1 ORDER BY created_at ASC`,
      [id],
    );

    const items = itemsRes.rows.map(toItemDomain);
    return toMealDomain(mealRes.rows[0], items);
  }

  async listByDate(userId: string, date: string): Promise<Meal[]> {
    const mealRes = await this.db.query<MealRow>(
      `
      SELECT * FROM meals
      WHERE user_id = $1 AND date = $2 AND deleted_at IS NULL
      ORDER BY
        CASE meal_type
          WHEN 'breakfast' THEN 1
          WHEN 'lunch' THEN 2
          WHEN 'snack' THEN 3
          WHEN 'dinner' THEN 4
          ELSE 5
        END,
        created_at ASC
      `,
      [userId, date],
    );

    if (mealRes.rows.length === 0) return [];

    const mealIds = mealRes.rows.map((m) => m.id);
    const itemsRes = await this.db.query<MealItemRow>(
      `SELECT * FROM meal_items WHERE meal_id = ANY($1) ORDER BY created_at ASC`,
      [mealIds],
    );

    const itemsByMealId = new Map<string, MealItem[]>();
    for (const row of itemsRes.rows) {
      const list = itemsByMealId.get(row.meal_id) ?? [];
      list.push(toItemDomain(row));
      itemsByMealId.set(row.meal_id, list);
    }

    return mealRes.rows.map((m) => toMealDomain(m, itemsByMealId.get(m.id) ?? []));
  }

  async listDateRange(userId: string, startDate: string, endDate: string): Promise<Meal[]> {
    const mealRes = await this.db.query<MealRow>(
      `
      SELECT * FROM meals
      WHERE user_id = $1 AND date >= $2 AND date <= $3 AND deleted_at IS NULL
      ORDER BY date ASC, created_at ASC
      `,
      [userId, startDate, endDate],
    );

    if (mealRes.rows.length === 0) return [];

    const mealIds = mealRes.rows.map((m) => m.id);
    const itemsRes = await this.db.query<MealItemRow>(
      `SELECT * FROM meal_items WHERE meal_id = ANY($1) ORDER BY created_at ASC`,
      [mealIds],
    );

    const itemsByMealId = new Map<string, MealItem[]>();
    for (const row of itemsRes.rows) {
      const list = itemsByMealId.get(row.meal_id) ?? [];
      list.push(toItemDomain(row));
      itemsByMealId.set(row.meal_id, list);
    }

    return mealRes.rows.map((m) => toMealDomain(m, itemsByMealId.get(m.id) ?? []));
  }

  async create(meal: Meal): Promise<{ meal: Meal; created: boolean }> {
    // Idempotent creation: ON CONFLICT (id) DO NOTHING ensures safe retries without overwriting newer updates
    const insertMealQuery = `
      INSERT INTO meals (
        id, user_id, meal_type, date, total_calories,
        total_protein_g, total_carbs_g, total_fat_g, total_fiber_g,
        notes, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    const values = [
      meal.id,
      meal.userId,
      meal.mealType,
      meal.date,
      meal.totalCalories,
      meal.totalProteinG,
      meal.totalCarbsG,
      meal.totalFatG,
      meal.totalFiberG,
      meal.notes,
      meal.createdAt,
      meal.updatedAt,
    ];

    const res = await this.db.query<{ id: string }>(insertMealQuery, values);
    if (res.rows.length === 0) {
      // Row already existed from previous sync attempt. Fetch and return current state without touching items.
      const existing = await this.findById(meal.id, meal.userId);
      return { meal: existing ?? meal, created: false };
    }

    // Insert items only on fresh creation
    for (const item of meal.items) {
      await this.db.query(
        `
        INSERT INTO meal_items (
          id, meal_id, food_id, food_name, food_brand,
          serving_size, serving_unit, serving_weight_g, serving_multiplier,
          logged_weight_g, calories, protein_g, carbs_g, fat_g, fiber_g, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        `,
        [
          item.id,
          meal.id,
          item.foodId,
          item.foodName,
          item.foodBrand,
          item.servingSize,
          item.servingUnit,
          item.servingWeightG,
          item.servingMultiplier,
          item.loggedWeightG,
          item.calories,
          item.proteinG,
          item.carbsG,
          item.fatG,
          item.fiberG,
          item.createdAt,
        ],
      );
    }

    return { meal, created: true };
  }

  async update(id: string, userId: string, meal: Meal): Promise<Meal | null> {
    const existing = await this.findById(id, userId);
    if (!existing) return null;

    const updateQuery = `
      UPDATE meals
      SET meal_type = $3, date = $4, total_calories = $5,
          total_protein_g = $6, total_carbs_g = $7, total_fat_g = $8,
          total_fiber_g = $9, notes = $10, updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING *
    `;
    const values = [
      id,
      userId,
      meal.mealType,
      meal.date,
      meal.totalCalories,
      meal.totalProteinG,
      meal.totalCarbsG,
      meal.totalFatG,
      meal.totalFiberG,
      meal.notes,
    ];

    const mealRes = await this.db.query<MealRow>(updateQuery, values);
    if (!mealRes.rows[0]) return null;

    // Replace items atomically within the transaction
    await this.db.query(`DELETE FROM meal_items WHERE meal_id = $1`, [id]);

    for (const item of meal.items) {
      await this.db.query(
        `
        INSERT INTO meal_items (
          id, meal_id, food_id, food_name, food_brand,
          serving_size, serving_unit, serving_weight_g, serving_multiplier,
          logged_weight_g, calories, protein_g, carbs_g, fat_g, fiber_g, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        `,
        [
          item.id,
          id,
          item.foodId,
          item.foodName,
          item.foodBrand,
          item.servingSize,
          item.servingUnit,
          item.servingWeightG,
          item.servingMultiplier,
          item.loggedWeightG,
          item.calories,
          item.proteinG,
          item.carbsG,
          item.fatG,
          item.fiberG,
          item.createdAt,
        ],
      );
    }

    return this.findById(id, userId);
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE meals SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async getMostLoggedFoods(
    userId: string,
    limit: number,
    sinceDate?: string,
  ): Promise<{ foodName: string; count: number; totalCalories: number }[]> {
    const conditions = ['m.user_id = $1', 'm.deleted_at IS NULL'];
    const values: unknown[] = [userId];

    if (sinceDate) {
      conditions.push('m.date >= $2');
      values.push(sinceDate);
    }

    const query = `
      SELECT mi.food_name, COUNT(*)::text AS count, SUM(mi.calories)::text AS total_calories
      FROM meal_items mi
      JOIN meals m ON mi.meal_id = m.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY mi.food_name
      ORDER BY COUNT(*) DESC, SUM(mi.calories) DESC
      LIMIT $${values.length + 1}
    `;
    values.push(limit);

    const res = await this.db.query<{ food_name: string; count: string; total_calories: string }>(
      query,
      values,
    );
    return res.rows.map((r) => ({
      foodName: r.food_name,
      count: parseInt(r.count, 10),
      totalCalories: parseFloat(r.total_calories),
    }));
  }

  async countLoggedDays(userId: string, startDate: string, endDate: string): Promise<number> {
    const res = await this.db.query<{ count: string }>(
      `
      SELECT COUNT(DISTINCT date)::text AS count
      FROM meals
      WHERE user_id = $1 AND date >= $2 AND date <= $3 AND deleted_at IS NULL
      `,
      [userId, startDate, endDate],
    );
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }
}

