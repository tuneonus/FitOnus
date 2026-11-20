/**
 * PostgreSQL Analytics Body Composition Repository Adapter
 *
 * Implements index-optimized, parameterized queries over weight_logs,
 * body_measurements, and user_profiles.
 */

import type { SqlExecutor } from '../../../database/transaction.js';
import { ageFromDateOfBirth, personalFoodTargets, resolveDailyTargets } from '../../profile/index.js';
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
    // Starts from users, not user_profiles: a member can set a water target before a profile row exists.
    const res = await this.db.query<{
      primary_goal: string | null;
      sex: string | null;
      date_of_birth: Date | string | null;
      height_cm: string | number | null;
      starting_weight_kg: string | number | null;
      current_weight_kg: string | number | null;
      target_weight_kg: string | number | null;
      daily_calorie_target: number | null;
      daily_protein_grams: number | null;
      workout_days_per_week: number | null;
      water_target_ml: number | null;
    }>(
      `SELECT p.primary_goal, p.sex, p.date_of_birth, p.height_cm, p.starting_weight_kg, p.current_weight_kg,
              p.target_weight_kg, p.daily_calorie_target, p.daily_protein_grams, p.workout_days_per_week,
              s.water_target_ml
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN user_nutrition_settings s ON s.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [userId],
    );

    const row = res.rows[0];
    if (!row) return null;

    const num = (value: string | number | null): number | null => (value !== null ? Number(value) : null);

    // The calorie, protein and water goals come from the same resolver as the nutrition diary and the dashboard, so
    // analytics compares what a member ate against the goal they see everywhere else.
    const resolved = resolveDailyTargets({
      savedCalorieTarget: num(row.daily_calorie_target),
      savedProteinGrams: num(row.daily_protein_grams),
      savedWaterTargetMl: num(row.water_target_ml),
      weightKg: num(row.current_weight_kg),
      heightCm: num(row.height_cm),
      age: ageFromDateOfBirth(row.date_of_birth),
      sex: row.sex,
      primaryGoal: row.primary_goal,
      workoutDaysPerWeek: num(row.workout_days_per_week),
    });
    const food = personalFoodTargets(resolved);

    return {
      primaryGoal: row.primary_goal,
      startingWeightKg: num(row.starting_weight_kg),
      currentWeightKg: num(row.current_weight_kg),
      targetWeightKg: num(row.target_weight_kg),
      dailyCalorieTarget: food?.caloriesGoal ?? null,
      dailyProteinGrams: food?.proteinGoal ?? null,
      dailyWaterTargetMl: resolved.water?.targetMl ?? null,
      workoutDaysPerWeek: num(row.workout_days_per_week),
    };
  }
}
