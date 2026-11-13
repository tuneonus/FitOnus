import type { SqlExecutor } from '../../../database/transaction.js';
import { calculateDailyStreak } from '../domain/streak-calculator.js';
import { localDateString, resolveTimeZone, systemClock, type Clock } from '../domain/local-date.js';
import type { IGoalsTelemetryPort, ProfileGoalsSummary } from '../application/ports.js';

/** Upper bound on workout rows scanned for a streak; a streak longer than this many sessions is not shown. */
const WORKOUT_STREAK_SCAN_LIMIT = 5000;

export class PgGoalsTelemetryAdapter implements IGoalsTelemetryPort {
  constructor(
    private readonly db: SqlExecutor,
    private readonly clock: Clock = systemClock,
  ) {}

  async getProfileGoals(userId: string): Promise<ProfileGoalsSummary | null> {
    try {
      const res = await this.db.query<{
        primary_goal: string | null;
        target_weight_kg: string | number | null;
        starting_weight_kg: string | number | null;
        current_weight_kg: string | number | null;
        daily_calorie_target: number | null;
        daily_protein_grams: number | null;
        workout_days_per_week: number | null;
      }>(
        `SELECT primary_goal, target_weight_kg, starting_weight_kg, current_weight_kg,
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
        targetWeightKg: row.target_weight_kg !== null ? Number(row.target_weight_kg) : null,
        startingWeightKg: row.starting_weight_kg !== null ? Number(row.starting_weight_kg) : null,
        currentWeightKg: row.current_weight_kg !== null ? Number(row.current_weight_kg) : null,
        dailyCalorieTarget: row.daily_calorie_target,
        dailyProteinGrams: row.daily_protein_grams,
        workoutDaysPerWeek: row.workout_days_per_week,
      };
    } catch {
      return null;
    }
  }

  async getLatestWeight(userId: string): Promise<number | null> {
    try {
      // 1. Check weight_logs table first
      const weightLogRes = await this.db.query<{ weight_kg: string | number }>(
        `SELECT weight_kg
         FROM weight_logs
         WHERE user_id = $1 AND deleted_at IS NULL
         ORDER BY logged_at DESC, created_at DESC
         LIMIT 1`,
        [userId],
      );

      if (weightLogRes.rows[0]) {
        return Number(weightLogRes.rows[0].weight_kg);
      }

      // 2. Fall back to user_profiles.current_weight_kg
      const profileRes = await this.db.query<{ current_weight_kg: string | number | null }>(
        `SELECT current_weight_kg FROM user_profiles WHERE user_id = $1 LIMIT 1`,
        [userId],
      );

      if (
        profileRes.rows[0]?.current_weight_kg !== null &&
        profileRes.rows[0]?.current_weight_kg !== undefined
      ) {
        return Number(profileRes.rows[0].current_weight_kg);
      }

      return null;
    } catch {
      return null;
    }
  }

  async getDailyWaterIntakeLiters(userId: string, date: string): Promise<number> {
    try {
      const res = await this.db.query<{ total_ml: number }>(
        `SELECT COALESCE(SUM(amount_ml), 0)::int AS total_ml
         FROM water_intake
         WHERE user_id = $1 AND date = $2::date`,
        [userId, date],
      );

      const ml = res.rows[0]?.total_ml ?? 0;
      return Number((ml / 1000).toFixed(2));
    } catch {
      return 0;
    }
  }

  async getDailyNutrition(userId: string, date: string): Promise<{ calories: number; proteinG: number }> {
    try {
      const res = await this.db.query<{ calories: string | number; protein_g: string | number }>(
        `SELECT 
           COALESCE(SUM(total_calories), 0) AS calories,
           COALESCE(SUM(total_protein_g), 0) AS protein_g
         FROM meals
         WHERE user_id = $1 AND date = $2::date AND deleted_at IS NULL`,
        [userId, date],
      );

      const row = res.rows[0];
      return {
        calories: Math.round(Number(row?.calories ?? 0)),
        proteinG: Math.round(Number(row?.protein_g ?? 0)),
      };
    } catch {
      return { calories: 0, proteinG: 0 };
    }
  }

  async getWeeklyWorkoutCount(userId: string, weekStart: Date, weekEnd: Date): Promise<number> {
    try {
      const res = await this.db.query<{ count: number }>(
        `SELECT COUNT(id)::int AS count
         FROM workout_sessions
         WHERE user_id = $1 AND is_completed = true
           AND started_at >= $2 AND started_at <= $3`,
        [userId, weekStart, weekEnd],
      );

      return res.rows[0]?.count ?? 0;
    } catch {
      return 0;
    }
  }

  async getWorkoutStreak(userId: string, referenceDateStr?: string, timeZone?: string): Promise<number> {
    try {
      const tz = resolveTimeZone(timeZone);
      const res = await this.db.query<{ started_at: Date }>(
        `SELECT started_at
         FROM workout_sessions
         WHERE user_id = $1 AND is_completed = true
         ORDER BY started_at DESC
         LIMIT $2`,
        [userId, WORKOUT_STREAK_SCAN_LIMIT],
      );

      // Bucket each workout into the user's local calendar day (a late-night session belongs to that day).
      const dates = res.rows.map((r) => localDateString(new Date(r.started_at), tz));
      const reference = referenceDateStr ?? localDateString(this.clock(), tz);
      return calculateDailyStreak(dates, reference).currentStreak;
    } catch {
      return 0;
    }
  }

  async getRecentDailyWaterLiters(
    userId: string,
    days: number = 7,
    referenceDate?: string,
  ): Promise<number[]> {
    try {
      const res = await this.db.query<{ date: string; total_ml: number }>(
        `SELECT 
           date::text,
           COALESCE(SUM(amount_ml), 0)::int AS total_ml
         FROM water_intake
         WHERE user_id = $1 AND date >= COALESCE($3::date, CURRENT_DATE) - $2::int
         GROUP BY date
         ORDER BY date ASC`,
        [userId, days, referenceDate ?? null],
      );

      return res.rows.map((r) => Number((r.total_ml / 1000).toFixed(2)));
    } catch {
      return [];
    }
  }

  async getRecentDailyProteinGrams(
    userId: string,
    days: number = 7,
    referenceDate?: string,
  ): Promise<number[]> {
    try {
      const res = await this.db.query<{ date: string; protein_g: string | number }>(
        `SELECT 
           date::text,
           COALESCE(SUM(total_protein_g), 0) AS protein_g
         FROM meals
         WHERE user_id = $1 AND deleted_at IS NULL
           AND date >= COALESCE($3::date, CURRENT_DATE) - $2::int
         GROUP BY date
         ORDER BY date ASC`,
        [userId, days, referenceDate ?? null],
      );

      return res.rows.map((r) => Math.round(Number(r.protein_g)));
    } catch {
      return [];
    }
  }
}
