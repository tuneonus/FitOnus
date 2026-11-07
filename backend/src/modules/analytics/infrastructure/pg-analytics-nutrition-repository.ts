/**
 * PostgreSQL Analytics Nutrition Repository Adapter
 *
 * Implements index-optimized, parameterized queries over meals and water_intake.
 */

import type { SqlExecutor } from '../../../database/transaction.js';
import type { IAnalyticsNutritionRepository } from '../application/ports.js';
import type { RawMealAggregateRecord } from '../domain/nutrition-metrics.js';
import type { RawWaterAggregateRecord } from '../domain/hydration-metrics.js';

export class PgAnalyticsNutritionRepository implements IAnalyticsNutritionRepository {
  constructor(private readonly db: SqlExecutor) {}

  async getDailyMealAggregates(
    userId: string,
    startDateStr: string,
    endDateStr: string,
  ): Promise<RawMealAggregateRecord[]> {
    const res = await this.db.query<{
      date: string;
      total_calories: string | number;
      total_protein_g: string | number;
      total_carbs_g: string | number;
      total_fat_g: string | number;
      total_fiber_g: string | number;
      meal_count: number;
    }>(
      `SELECT
         date::text AS date,
         COALESCE(SUM(total_calories), 0) AS total_calories,
         COALESCE(SUM(total_protein_g), 0) AS total_protein_g,
         COALESCE(SUM(total_carbs_g), 0) AS total_carbs_g,
         COALESCE(SUM(total_fat_g), 0) AS total_fat_g,
         COALESCE(SUM(total_fiber_g), 0) AS total_fiber_g,
         COUNT(id)::int AS meal_count
       FROM meals
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND date >= $2::date
         AND date <= $3::date
       GROUP BY date
       ORDER BY date ASC`,
      [userId, startDateStr, endDateStr],
    );

    return res.rows.map((r) => ({
      date: r.date.slice(0, 10),
      totalCalories: Number(r.total_calories),
      totalProteinG: Number(r.total_protein_g),
      totalCarbsG: Number(r.total_carbs_g),
      totalFatG: Number(r.total_fat_g),
      totalFiberG: Number(r.total_fiber_g),
      mealCount: Number(r.meal_count),
    }));
  }

  async getDailyWaterAggregates(
    userId: string,
    startDateStr: string,
    endDateStr: string,
  ): Promise<RawWaterAggregateRecord[]> {
    const res = await this.db.query<{
      date: string;
      total_ml: number;
    }>(
      `SELECT
         date::text AS date,
         COALESCE(SUM(amount_ml), 0)::int AS total_ml
       FROM water_intake
       WHERE user_id = $1
         AND date >= $2::date
         AND date <= $3::date
       GROUP BY date
       ORDER BY date ASC`,
      [userId, startDateStr, endDateStr],
    );

    return res.rows.map((r) => ({
      date: r.date.slice(0, 10),
      totalMl: Number(r.total_ml),
    }));
  }
}

