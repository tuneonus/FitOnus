import type { SqlExecutor } from '../../../database/transaction.js';
import type {
  DailyNutritionAggregate,
  IProgressTelemetryPort,
  PersonalRecordItem,
  UserProfileProgressGoals,
  WorkoutSessionSummary,
} from '../application/ports.js';

export class PgProgressTelemetryAdapter implements IProgressTelemetryPort {
  constructor(private readonly db: SqlExecutor) {}

  async getProfileGoals(userId: string): Promise<UserProfileProgressGoals | null> {
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

  async getWorkoutSessions(userId: string, startDate: Date, endDate: Date): Promise<WorkoutSessionSummary[]> {
    try {
      const res = await this.db.query<{
        id: string;
        workout_name: string;
        started_at: Date;
        completed_at: Date;
        duration_seconds: number;
        total_volume_kg: string | number;
        is_completed: boolean;
      }>(
        `SELECT id, workout_name, started_at, completed_at, duration_seconds, total_volume_kg, is_completed
         FROM workout_sessions
         WHERE user_id = $1
           AND is_completed = true
           AND started_at >= $2
           AND started_at <= $3
         ORDER BY started_at ASC`,
        [userId, startDate, endDate],
      );

      return res.rows.map((r) => ({
        id: r.id,
        name: r.workout_name,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        durationSeconds: r.duration_seconds,
        totalVolumeKg: Number(r.total_volume_kg),
        isCompleted: r.is_completed,
      }));
    } catch {
      return [];
    }
  }

  async getNutritionAggregates(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<DailyNutritionAggregate[]> {
    try {
      const res = await this.db.query<{
        date: string;
        total_calories: string | number;
        total_protein_g: string | number;
        meal_count: number;
      }>(
        `SELECT 
           date::text,
           COALESCE(SUM(total_calories), 0) AS total_calories,
           COALESCE(SUM(total_protein_g), 0) AS total_protein_g,
           COUNT(id)::int AS meal_count
         FROM meals
         WHERE user_id = $1
           AND deleted_at IS NULL
           AND date >= $2::date
           AND date <= $3::date
         GROUP BY date
         ORDER BY date ASC`,
        [userId, startDate, endDate],
      );

      return res.rows.map((r) => ({
        date: r.date.slice(0, 10),
        totalCalories: Math.round(Number(r.total_calories)),
        totalProteinG: Math.round(Number(r.total_protein_g)),
        mealCount: r.meal_count,
      }));
    } catch {
      return [];
    }
  }

  async getWaterTotals(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ date: string; totalMl: number }[]> {
    try {
      const res = await this.db.query<{
        date: string;
        total_ml: number;
      }>(
        `SELECT 
           date::text,
           COALESCE(SUM(amount_ml), 0)::int AS total_ml
         FROM water_intake
         WHERE user_id = $1
           AND date >= $2::date
           AND date <= $3::date
         GROUP BY date
         ORDER BY date ASC`,
        [userId, startDate, endDate],
      );

      return res.rows.map((r) => ({
        date: r.date.slice(0, 10),
        totalMl: r.total_ml,
      }));
    } catch {
      return [];
    }
  }

  async getPersonalRecords(userId: string): Promise<PersonalRecordItem[]> {
    try {
      const res = await this.db.query<{
        id: string;
        exercise_name: string | null;
        record_type: string;
        weight_kg: string | number;
        reps: number;
        volume_kg: string | number;
        estimated_1rm_kg: string | number;
        achieved_at: Date;
      }>(
        `SELECT 
           pr.id,
           COALESCE(e.name, 'Exercise') AS exercise_name,
           pr.record_type,
           pr.weight_kg,
           pr.reps,
           pr.volume_kg,
           pr.estimated_1rm_kg,
           pr.achieved_at
         FROM personal_records pr
         LEFT JOIN exercises e ON e.id = pr.exercise_id
         WHERE pr.user_id = $1
         ORDER BY pr.achieved_at DESC`,
        [userId],
      );

      return res.rows.map((r) => ({
        id: r.id,
        exerciseName: r.exercise_name ?? 'Exercise',
        recordType: r.record_type,
        weightKg: Number(r.weight_kg),
        reps: r.reps,
        volumeKg: Number(r.volume_kg),
        estimated1rmKg: Number(r.estimated_1rm_kg),
        achievedAt: r.achieved_at,
      }));
    } catch {
      return [];
    }
  }
}
