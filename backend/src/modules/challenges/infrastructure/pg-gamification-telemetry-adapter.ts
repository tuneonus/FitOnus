import type { SqlExecutor } from '../../../database/transaction.js';
import type { IGamificationTelemetryPort } from '../application/ports.js';

export class PgGamificationTelemetryAdapter implements IGamificationTelemetryPort {
  constructor(private readonly db: SqlExecutor) {}

  async getWorkoutCount(userId: string, fromDate: Date, toDate: Date): Promise<number> {
    try {
      const res = await this.db.query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count
         FROM workout_sessions
         WHERE user_id = $1
           AND is_completed = true
           AND started_at >= $2
           AND started_at <= $3`,
        [userId, fromDate, toDate],
      );
      return Number(res.rows[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }

  async getWorkoutDurationMinutes(userId: string, fromDate: Date, toDate: Date): Promise<number> {
    try {
      const res = await this.db.query<{ total_sec: string | number }>(
        `SELECT COALESCE(SUM(duration_seconds), 0)::int AS total_sec
         FROM workout_sessions
         WHERE user_id = $1
           AND is_completed = true
           AND started_at >= $2
           AND started_at <= $3`,
        [userId, fromDate, toDate],
      );
      const seconds = Number(res.rows[0]?.total_sec ?? 0);
      return Math.round(seconds / 60);
    } catch {
      return 0;
    }
  }

  async getWorkoutVolumeKg(userId: string, fromDate: Date, toDate: Date): Promise<number> {
    try {
      const res = await this.db.query<{ total_volume: string | number }>(
        `SELECT COALESCE(SUM(ss.weight_kg * ss.reps), 0) AS total_volume
         FROM session_sets ss
         JOIN workout_sessions ws ON ws.id = ss.session_id
         WHERE ws.user_id = $1
           AND ws.is_completed = true
           AND ss.is_completed = true
           AND ws.started_at >= $2
           AND ws.started_at <= $3`,
        [userId, fromDate, toDate],
      );
      return Math.round(Number(res.rows[0]?.total_volume ?? 0));
    } catch {
      return 0;
    }
  }

  async getHabitCompletionsCount(userId: string, fromDate: Date, toDate: Date): Promise<number> {
    try {
      const res = await this.db.query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count
         FROM habit_completions
         WHERE user_id = $1
           AND date >= $2::date
           AND date <= $3::date`,
        [userId, fromDate, toDate],
      );
      return Number(res.rows[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }

  async getMaxHabitStreak(userId: string): Promise<number> {
    try {
      const res = await this.db.query<{ max_streak: string | number }>(
        `SELECT COALESCE(MAX(current_streak), 0)::int AS max_streak
         FROM habits
         WHERE user_id = $1
           AND deleted_at IS NULL
           AND is_archived = false`,
        [userId],
      );
      return Number(res.rows[0]?.max_streak ?? 0);
    } catch {
      return 0;
    }
  }

  async getWaterLiters(userId: string, fromDate: Date, toDate: Date): Promise<number> {
    try {
      const res = await this.db.query<{ total_ml: string | number }>(
        `SELECT COALESCE(SUM(amount_ml), 0)::int AS total_ml
         FROM water_intake
         WHERE user_id = $1
           AND date >= $2::date
           AND date <= $3::date`,
        [userId, fromDate, toDate],
      );
      const ml = Number(res.rows[0]?.total_ml ?? 0);
      return Number((ml / 1000).toFixed(2));
    } catch {
      return 0;
    }
  }

  async getCalorieTargetHitDays(userId: string, fromDate: Date, toDate: Date): Promise<number> {
    try {
      const res = await this.db.query<{ hit_days: string | number }>(
        `WITH daily_cals AS (
           SELECT m.date, SUM(m.total_calories) AS total_cal
           FROM meals m
           WHERE m.user_id = $1
             AND m.deleted_at IS NULL
             AND m.date >= $2::date
             AND m.date <= $3::date
           GROUP BY m.date
         )
         SELECT COUNT(*)::int AS hit_days
         FROM daily_cals dc
         JOIN user_profiles up ON up.user_id = $1
         WHERE up.daily_calorie_target IS NOT NULL
           AND dc.total_cal >= (up.daily_calorie_target * 0.85)
           AND dc.total_cal <= (up.daily_calorie_target * 1.15)`,
        [userId, fromDate, toDate],
      );
      return Number(res.rows[0]?.hit_days ?? 0);
    } catch {
      return 0;
    }
  }

  async getProteinTargetHitDays(userId: string, fromDate: Date, toDate: Date): Promise<number> {
    try {
      const res = await this.db.query<{ hit_days: string | number }>(
        `WITH daily_protein AS (
           SELECT m.date, SUM(m.total_protein_g) AS total_p
           FROM meals m
           WHERE m.user_id = $1
             AND m.deleted_at IS NULL
             AND m.date >= $2::date
             AND m.date <= $3::date
           GROUP BY m.date
         )
         SELECT COUNT(*)::int AS hit_days
         FROM daily_protein dp
         JOIN user_profiles up ON up.user_id = $1
         WHERE up.daily_protein_grams IS NOT NULL
           AND dp.total_p >= up.daily_protein_grams`,
        [userId, fromDate, toDate],
      );
      return Number(res.rows[0]?.hit_days ?? 0);
    } catch {
      return 0;
    }
  }

  async getPersonalRecordsCount(userId: string): Promise<number> {
    try {
      const res = await this.db.query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count
         FROM personal_records
         WHERE user_id = $1`,
        [userId],
      );
      return Number(res.rows[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }

  async getWeightLossKg(userId: string): Promise<number> {
    try {
      const res = await this.db.query<{
        starting_weight_kg: string | number | null;
        current_weight_kg: string | number | null;
      }>(
        `SELECT starting_weight_kg, current_weight_kg
         FROM user_profiles
         WHERE user_id = $1
         LIMIT 1`,
        [userId],
      );
      const row = res.rows[0];
      if (!row || row.starting_weight_kg === null || row.current_weight_kg === null) {
        return 0;
      }
      const starting = Number(row.starting_weight_kg);
      const current = Number(row.current_weight_kg);
      const diff = starting - current;
      return diff > 0 ? Math.round(diff * 10) / 10 : 0;
    } catch {
      return 0;
    }
  }

  async getTotalWorkoutCount(userId: string): Promise<number> {
    try {
      const res = await this.db.query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count
         FROM workout_sessions
         WHERE user_id = $1 AND is_completed = true`,
        [userId],
      );
      return Number(res.rows[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }
}
