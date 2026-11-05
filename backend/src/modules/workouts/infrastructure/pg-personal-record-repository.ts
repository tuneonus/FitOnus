import type { SqlExecutor } from '../../../database/transaction.js';
import type { PrRecordType } from '../domain/personal-record.js';
import { PersonalRecord } from '../domain/personal-record.js';
import type { IPersonalRecordRepository } from '../application/ports.js';

interface PrRow {
  id: string;
  user_id: string;
  exercise_id: string;
  exercise_name?: string;
  record_type: PrRecordType;
  weight_kg: string | number;
  reps: number;
  volume_kg: string | number;
  estimated_1rm_kg: string | number;
  session_id: string | null;
  achieved_at: Date;
  created_at: Date;
}

function toDomain(row: PrRow): PersonalRecord {
  return new PersonalRecord({
    id: row.id,
    userId: row.user_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    recordType: row.record_type,
    weightKg: Number(row.weight_kg),
    reps: row.reps,
    volumeKg: Number(row.volume_kg),
    estimated1rmKg: Number(row.estimated_1rm_kg),
    sessionId: row.session_id,
    achievedAt: row.achieved_at,
    createdAt: row.created_at,
  });
}

export class PgPersonalRecordRepository implements IPersonalRecordRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findCurrentBestsForExercise(userId: string, exerciseId: string): Promise<PersonalRecord[]> {
    const res = await this.db.query<PrRow>(
      `
      SELECT DISTINCT ON (pr.record_type) pr.*, e.name AS exercise_name
      FROM personal_records pr
      LEFT JOIN exercises e ON pr.exercise_id = e.id
      WHERE pr.user_id = $1 AND pr.exercise_id = $2
      ORDER BY pr.record_type, pr.achieved_at DESC
      `,
      [userId, exerciseId],
    );
    return res.rows.map(toDomain);
  }

  async listCurrentBests(userId: string, exerciseId?: string): Promise<PersonalRecord[]> {
    const conditions = ['pr.user_id = $1'];
    const values: unknown[] = [userId];

    if (exerciseId) {
      conditions.push('pr.exercise_id = $2');
      values.push(exerciseId);
    }

    const whereClause = conditions.join(' AND ');
    const res = await this.db.query<PrRow>(
      `
      SELECT DISTINCT ON (pr.exercise_id, pr.record_type) pr.*, e.name AS exercise_name
      FROM personal_records pr
      LEFT JOIN exercises e ON pr.exercise_id = e.id
      WHERE ${whereClause}
      ORDER BY pr.exercise_id, pr.record_type, pr.achieved_at DESC
      `,
      values,
    );
    return res.rows.map(toDomain);
  }

  async listProgressionHistory(userId: string, exerciseId: string): Promise<PersonalRecord[]> {
    const res = await this.db.query<PrRow>(
      `
      SELECT pr.*, e.name AS exercise_name
      FROM personal_records pr
      LEFT JOIN exercises e ON pr.exercise_id = e.id
      WHERE pr.user_id = $1 AND pr.exercise_id = $2
      ORDER BY pr.achieved_at ASC
      `,
      [userId, exerciseId],
    );
    return res.rows.map(toDomain);
  }

  async insertMilestones(records: PersonalRecord[]): Promise<PersonalRecord[]> {
    for (const r of records) {
      await this.db.query(
        `
        INSERT INTO personal_records (
          id, user_id, exercise_id, record_type, weight_kg,
          reps, volume_kg, estimated_1rm_kg, session_id,
          achieved_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          r.id,
          r.userId,
          r.exerciseId,
          r.recordType,
          r.weightKg,
          r.reps,
          r.volumeKg,
          r.estimated1rmKg,
          r.sessionId,
          r.achievedAt,
          r.createdAt,
        ],
      );
    }
    return records;
  }
}
