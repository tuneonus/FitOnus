/**
 * PostgreSQL Analytics Workout Repository Adapter
 *
 * Implements index-optimized, parameterized queries over workout_sessions,
 * workout_session_sets, and personal_records.
 */

import type { SqlExecutor } from '../../../database/transaction.js';
import type { IAnalyticsWorkoutRepository } from '../application/ports.js';
import type {
  RawWorkoutSessionRecord,
  RawExerciseSetRecord,
  RawExercisePrRecord,
} from '../domain/workout-metrics.js';

export class PgAnalyticsWorkoutRepository implements IAnalyticsWorkoutRepository {
  constructor(private readonly db: SqlExecutor) {}

  async getCompletedSessions(
    userId: string,
    startUtc: Date,
    endUtc: Date,
  ): Promise<RawWorkoutSessionRecord[]> {
    const res = await this.db.query<{
      id: string;
      workout_name: string;
      started_at: Date;
      completed_at: Date;
      duration_seconds: number;
      total_volume_kg: string | number;
      total_sets: number;
      total_reps: number;
      is_completed: boolean;
    }>(
      `SELECT id, workout_name, started_at, completed_at, duration_seconds,
              total_volume_kg, total_sets, total_reps, is_completed
       FROM workout_sessions
       WHERE user_id = $1
         AND is_completed = true
         AND started_at >= $2
         AND started_at <= $3
       ORDER BY started_at ASC`,
      [userId, startUtc, endUtc],
    );

    return res.rows.map((r) => ({
      id: r.id,
      workoutName: r.workout_name,
      startedAt: new Date(r.started_at),
      completedAt: new Date(r.completed_at),
      durationSeconds: Number(r.duration_seconds),
      totalVolumeKg: Number(r.total_volume_kg),
      totalSets: Number(r.total_sets),
      totalReps: Number(r.total_reps),
      isCompleted: r.is_completed,
    }));
  }

  async getExerciseSetsHistory(
    userId: string,
    exerciseId: string,
    startUtc: Date,
    endUtc: Date,
  ): Promise<RawExerciseSetRecord[]> {
    const res = await this.db.query<{
      set_id: string;
      session_id: string;
      exercise_id: string;
      exercise_name: string | null;
      set_number: number;
      weight_kg: string | number;
      reps: number;
      is_warmup: boolean;
      is_pr: boolean;
      rpe: number | null;
      started_at: Date;
    }>(
      `SELECT
         wss.id AS set_id,
         wss.session_id,
         wss.exercise_id,
         COALESCE(e.name, 'Exercise') AS exercise_name,
         wss.set_number,
         wss.weight_kg,
         wss.reps,
         wss.is_warmup,
         wss.is_pr,
         wss.rpe,
         ws.started_at
       FROM workout_session_sets wss
       JOIN workout_sessions ws ON ws.id = wss.session_id
       LEFT JOIN exercises e ON e.id = wss.exercise_id
       WHERE ws.user_id = $1
         AND wss.exercise_id = $2
         AND ws.is_completed = true
         AND ws.started_at >= $3
         AND ws.started_at <= $4
       ORDER BY ws.started_at ASC, wss.set_number ASC`,
      [userId, exerciseId, startUtc, endUtc],
    );

    return res.rows.map((r) => ({
      setId: r.set_id,
      sessionId: r.session_id,
      exerciseId: r.exercise_id,
      exerciseName: r.exercise_name ?? 'Exercise',
      setNumber: Number(r.set_number),
      weightKg: Number(r.weight_kg),
      reps: Number(r.reps),
      isWarmup: r.is_warmup,
      isPr: r.is_pr,
      rpe: r.rpe !== null ? Number(r.rpe) : null,
      startedAt: new Date(r.started_at),
    }));
  }

  async getExerciseCurrentPr(userId: string, exerciseId: string): Promise<RawExercisePrRecord | null> {
    const res = await this.db.query<{
      record_type: string;
      weight_kg: string | number;
      reps: number;
      volume_kg: string | number;
      estimated_1rm_kg: string | number;
      achieved_at: Date;
    }>(
      `SELECT record_type, weight_kg, reps, volume_kg, estimated_1rm_kg, achieved_at
       FROM personal_records
       WHERE user_id = $1
         AND exercise_id = $2
       ORDER BY achieved_at DESC
       LIMIT 1`,
      [userId, exerciseId],
    );

    const row = res.rows[0];
    if (!row) return null;

    return {
      recordType: row.record_type,
      weightKg: Number(row.weight_kg),
      reps: Number(row.reps),
      volumeKg: Number(row.volume_kg),
      estimated1rmKg: Number(row.estimated_1rm_kg),
      achievedAt: new Date(row.achieved_at),
    };
  }
}
