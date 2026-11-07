/**
 * PostgreSQL Analytics Body Composition Repository Adapter
 *
 * Implements index-optimized, parameterized queries over weight_logs,
 * body_measurements, and user_profiles.
 */

import type { SqlExecutor } from '../../../database/transaction.js';
import type { IAnalyticsBodyRepository, UserProfileAnalyticsGoals } from '../application/ports.js';
import type { RawWeightLogRecord, RawMeasurementRecord } from '../domain/body-analytics-metrics.js';

export class PgAnalyticsBodyRepository implements IAnalyticsBodyRepository {
  constructor(private readonly db: SqlExecutor) {}

  async getWeightLogs(userId: string, startUtc: Date, endUtc: Date): Promise<RawWeightLogRecord[]> {
    const res = await this.db.query<{
      id: string;
      weight_kg: string | number;
      logged_at: Date;
    }>(
      `SELECT id, weight_kg, logged_at
       FROM weight_logs
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND logged_at >= $2
         AND logged_at <= $3
       ORDER BY logged_at ASC`,
      [userId, startUtc, endUtc],
    );

    return res.rows.map((r) => ({
      id: r.id,
      weightKg: Number(r.weight_kg),
      loggedAt: new Date(r.logged_at),
    }));
  }

  async getMeasurements(userId: string, startUtc: Date, endUtc: Date): Promise<RawMeasurementRecord[]> {
    const res = await this.db.query<{
      id: string;
      logged_at: Date;
      waist_cm: string | number | null;
      chest_cm: string | number | null;
      hip_cm: string | number | null;
      arm_cm: string | number | null;
      neck_cm: string | number | null;
      body_fat_pct: string | number | null;
      muscle_mass_kg: string | number | null;
    }>(
      `SELECT id, logged_at, waist_cm, chest_cm, hip_cm, arm_cm, neck_cm,
              body_fat_pct, muscle_mass_kg
       FROM body_measurements
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND logged_at >= $2
         AND logged_at <= $3
       ORDER BY logged_at ASC`,
      [userId, startUtc, endUtc],
    );

    return res.rows.map((r) => ({
      id: r.id,
      loggedAt: new Date(r.logged_at),
      waistCm: r.waist_cm !== null ? Number(r.waist_cm) : null,
      chestCm: r.chest_cm !== null ? Number(r.chest_cm) : null,
      hipCm: r.hip_cm !== null ? Number(r.hip_cm) : null,
      armCm: r.arm_cm !== null ? Number(r.arm_cm) : null,
      neckCm: r.neck_cm !== null ? Number(r.neck_cm) : null,
      bodyFatPct: r.body_fat_pct !== null ? Number(r.body_fat_pct) : null,
      muscleMassKg: r.muscle_mass_kg !== null ? Number(r.muscle_mass_kg) : null,
    }));
  }

  async getUserProfileGoals(userId: string): Promise<UserProfileAnalyticsGoals | null> {
    const res = await this.db.query<{
      primary_goal: string | null;
      starting_weight_kg: string | number | null;
      current_weight_kg: string | number | null;
      target_weight_kg: string | number | null;
      daily_calorie_target: number | null;
      daily_protein_grams: number | null;
      workout_days_per_week: number | null;
    }>(
      `SELECT primary_goal, starting_weight_kg, current_weight_kg, target_weight_kg,
              daily_calorie_target, daily_protein_grams, workout_days_per_week
       FROM user_profiles
       WHERE user_id = $1
       LIMIT 1`,
      [userId],
    );

    const row = res.rows[0];
    if (!row) return null;

    return {
      primaryGoal: row.primary_goal,
      startingWeightKg: row.starting_weight_kg !== null ? Number(row.starting_weight_kg) : null,
      currentWeightKg: row.current_weight_kg !== null ? Number(row.current_weight_kg) : null,
      targetWeightKg: row.target_weight_kg !== null ? Number(row.target_weight_kg) : null,
      dailyCalorieTarget: row.daily_calorie_target !== null ? Number(row.daily_calorie_target) : null,
      dailyProteinGrams: row.daily_protein_grams !== null ? Number(row.daily_protein_grams) : null,
      workoutDaysPerWeek: row.workout_days_per_week !== null ? Number(row.workout_days_per_week) : null,
    };
  }
}
