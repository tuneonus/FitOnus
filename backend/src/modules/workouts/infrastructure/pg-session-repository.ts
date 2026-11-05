import type { SqlExecutor } from '../../../database/transaction.js';
import type { CalorieSource } from '../domain/workout-session.js';
import { WorkoutSession, WorkoutSessionSet } from '../domain/workout-session.js';
import type { IWorkoutSessionRepository, SessionFilter } from '../application/ports.js';

interface SessionRow {
  id: string;
  user_id: string;
  workout_id: string | null;
  workout_name: string;
  started_at: Date;
  completed_at: Date;
  duration_seconds: number;
  total_volume_kg: string | number;
  total_sets: number;
  total_reps: number;
  calories_burned: number | null;
  calories_source: CalorieSource;
  difficulty_rating: number | null;
  notes: string | null;
  is_completed: boolean;
  created_at: Date;
  updated_at: Date;
}

interface SessionSetRow {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name?: string;
  set_number: number;
  weight_kg: string | number;
  reps: number;
  duration_seconds: number | null;
  is_warmup: boolean;
  is_dropset: boolean;
  is_failure: boolean;
  is_pr: boolean;
  rpe: number | null;
  notes: string | null;
  created_at: Date;
}

function toSetDomain(row: SessionSetRow): WorkoutSessionSet {
  return new WorkoutSessionSet({
    id: row.id,
    sessionId: row.session_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    setNumber: row.set_number,
    weightKg: Number(row.weight_kg),
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    isWarmup: row.is_warmup,
    isDropset: row.is_dropset,
    isFailure: row.is_failure,
    isPr: row.is_pr,
    rpe: row.rpe,
    notes: row.notes,
    createdAt: row.created_at,
  });
}

function toSessionDomain(row: SessionRow, sets: WorkoutSessionSet[] = []): WorkoutSession {
  return new WorkoutSession({
    id: row.id,
    userId: row.user_id,
    workoutId: row.workout_id,
    workoutName: row.workout_name,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationSeconds: row.duration_seconds,
    totalVolumeKg: Number(row.total_volume_kg),
    totalSets: row.total_sets,
    totalReps: row.total_reps,
    caloriesBurned: row.calories_burned,
    caloriesSource: row.calories_source,
    difficultyRating: row.difficulty_rating,
    notes: row.notes,
    isCompleted: row.is_completed,
    sets,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PgWorkoutSessionRepository implements IWorkoutSessionRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string): Promise<WorkoutSession | null> {
    const sRes = await this.db.query<SessionRow>(`SELECT * FROM workout_sessions WHERE id = $1 LIMIT 1`, [
      id,
    ]);
    if (!sRes.rows[0]) return null;

    const setsRes = await this.db.query<SessionSetRow>(
      `
      SELECT s.*, e.name AS exercise_name
      FROM workout_session_sets s
      LEFT JOIN exercises e ON s.exercise_id = e.id
      WHERE s.session_id = $1
      ORDER BY s.set_number ASC
      `,
      [id],
    );

    return toSessionDomain(sRes.rows[0], setsRes.rows.map(toSetDomain));
  }

  async listForUser(
    userId: string,
    filter: SessionFilter,
  ): Promise<{ sessions: WorkoutSession[]; total: number }> {
    const conditions: string[] = ['user_id = $1'];
    const values: unknown[] = [userId];
    let idx = 2;

    if (filter.workoutId) {
      conditions.push(`workout_id = $${idx}`);
      values.push(filter.workoutId);
      idx++;
    }

    if (filter.startDate) {
      conditions.push(`started_at >= $${idx}`);
      values.push(filter.startDate);
      idx++;
    }

    if (filter.endDate) {
      conditions.push(`started_at <= $${idx}`);
      values.push(filter.endDate);
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM workout_sessions WHERE ${whereClause}`,
      values,
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const listQuery = `
      SELECT *
      FROM workout_sessions
      WHERE ${whereClause}
      ORDER BY started_at DESC
      OFFSET $${idx}
      LIMIT $${idx + 1}
    `;
    values.push(filter.offset, filter.limit);

    const sRes = await this.db.query<SessionRow>(listQuery, values);
    if (sRes.rows.length === 0) {
      return { sessions: [], total };
    }

    const sessionIds = sRes.rows.map((r) => r.id);
    const setsRes = await this.db.query<SessionSetRow>(
      `
      SELECT s.*, e.name AS exercise_name
      FROM workout_session_sets s
      LEFT JOIN exercises e ON s.exercise_id = e.id
      WHERE s.session_id = ANY($1)
      ORDER BY s.set_number ASC
      `,
      [sessionIds],
    );

    const setsBySession = new Map<string, WorkoutSessionSet[]>();
    for (const setRow of setsRes.rows) {
      const list = setsBySession.get(setRow.session_id) ?? [];
      list.push(toSetDomain(setRow));
      setsBySession.set(setRow.session_id, list);
    }

    const sessions = sRes.rows.map((r) => toSessionDomain(r, setsBySession.get(r.id) ?? []));
    return { sessions, total };
  }

  async saveCompletedSession(session: WorkoutSession): Promise<WorkoutSession> {
    await this.db.query(
      `
      INSERT INTO workout_sessions (
        id, user_id, workout_id, workout_name, started_at, completed_at,
        duration_seconds, total_volume_kg, total_sets, total_reps,
        calories_burned, calories_source, difficulty_rating, notes,
        is_completed, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `,
      [
        session.id,
        session.userId,
        session.workoutId,
        session.workoutName,
        session.startedAt,
        session.completedAt,
        session.durationSeconds,
        session.totalVolumeKg,
        session.totalSets,
        session.totalReps,
        session.caloriesBurned,
        session.caloriesSource,
        session.difficultyRating,
        session.notes,
        session.isCompleted,
        session.createdAt,
        session.updatedAt,
      ],
    );

    for (const s of session.sets) {
      await this.db.query(
        `
        INSERT INTO workout_session_sets (
          id, session_id, exercise_id, set_number, weight_kg,
          reps, duration_seconds, is_warmup, is_dropset, is_failure,
          is_pr, rpe, notes, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `,
        [
          s.id,
          s.sessionId,
          s.exerciseId,
          s.setNumber,
          s.weightKg,
          s.reps,
          s.durationSeconds,
          s.isWarmup,
          s.isDropset,
          s.isFailure,
          s.isPr,
          s.rpe,
          s.notes,
          s.createdAt,
        ],
      );
    }

    return session;
  }

  async countCompletedSessions(): Promise<number> {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM workout_sessions WHERE is_completed = true`,
    );
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }

  async getTotalVolumeLifted(): Promise<number> {
    const res = await this.db.query<{ total: string }>(
      `SELECT COALESCE(SUM(total_volume_kg), 0)::text AS total FROM workout_sessions WHERE is_completed = true`,
    );
    return parseFloat(res.rows[0]?.total ?? '0');
  }

  async getDistinctLiftersCount(): Promise<number> {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS count FROM workout_sessions WHERE is_completed = true`,
    );
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }
}
