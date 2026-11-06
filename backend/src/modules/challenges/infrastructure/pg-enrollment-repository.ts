import type { SqlExecutor } from '../../../database/transaction.js';
import { ChallengeEnrollment, type EnrollmentStatus } from '../domain/challenge-enrollment.js';
import type { IChallengeEnrollmentRepository } from '../application/ports.js';

interface EnrollmentRow {
  id: string;
  user_id: string;
  occurrence_id: string;
  challenge_id: string;
  status: string;
  current_progress: string | number;
  target_value: string | number;
  completed_at: Date | null;
  claimed_at: Date | null;
  last_evaluated_at: Date;
  created_at: Date;
  updated_at: Date;
}

function toDomainEnrollment(row: EnrollmentRow): ChallengeEnrollment {
  return new ChallengeEnrollment({
    id: row.id,
    userId: row.user_id,
    occurrenceId: row.occurrence_id,
    challengeId: row.challenge_id,
    status: row.status as EnrollmentStatus,
    currentProgress: Number(row.current_progress),
    targetValue: Number(row.target_value),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
    lastEvaluatedAt: new Date(row.last_evaluated_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}

export class PgChallengeEnrollmentRepository implements IChallengeEnrollmentRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string): Promise<ChallengeEnrollment | null> {
    const res = await this.db.query<EnrollmentRow>(
      `SELECT * FROM challenge_enrollments WHERE id = $1 LIMIT 1`,
      [id],
    );
    const row = res.rows[0];
    return row ? toDomainEnrollment(row) : null;
  }

  async findByUserAndOccurrence(userId: string, occurrenceId: string): Promise<ChallengeEnrollment | null> {
    const res = await this.db.query<EnrollmentRow>(
      `SELECT * FROM challenge_enrollments 
       WHERE user_id = $1 AND occurrence_id = $2 
       LIMIT 1`,
      [userId, occurrenceId],
    );
    const row = res.rows[0];
    return row ? toDomainEnrollment(row) : null;
  }

  async listByUser(userId: string, status?: EnrollmentStatus): Promise<ChallengeEnrollment[]> {
    if (status) {
      const res = await this.db.query<EnrollmentRow>(
        `SELECT * FROM challenge_enrollments 
         WHERE user_id = $1 AND status = $2 
         ORDER BY created_at DESC`,
        [userId, status],
      );
      return res.rows.map(toDomainEnrollment);
    }

    const res = await this.db.query<EnrollmentRow>(
      `SELECT * FROM challenge_enrollments 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId],
    );
    return res.rows.map(toDomainEnrollment);
  }

  async listByOccurrence(occurrenceId: string): Promise<ChallengeEnrollment[]> {
    const res = await this.db.query<EnrollmentRow>(
      `SELECT * FROM challenge_enrollments 
       WHERE occurrence_id = $1 
       ORDER BY created_at ASC`,
      [occurrenceId],
    );
    return res.rows.map(toDomainEnrollment);
  }

  async enroll(enrollment: ChallengeEnrollment): Promise<ChallengeEnrollment> {
    const res = await this.db.query<EnrollmentRow>(
      `INSERT INTO challenge_enrollments (
         id, user_id, occurrence_id, challenge_id, status, current_progress,
         target_value, completed_at, claimed_at, last_evaluated_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id, occurrence_id) DO UPDATE
         SET updated_at = challenge_enrollments.updated_at
       RETURNING *`,
      [
        enrollment.id,
        enrollment.userId,
        enrollment.occurrenceId,
        enrollment.challengeId,
        enrollment.status,
        enrollment.currentProgress,
        enrollment.targetValue,
        enrollment.completedAt,
        enrollment.claimedAt,
        enrollment.lastEvaluatedAt,
        enrollment.createdAt,
        enrollment.updatedAt,
      ],
    );
    return toDomainEnrollment(res.rows[0]!);
  }

  async save(enrollment: ChallengeEnrollment): Promise<void> {
    await this.db.query(
      `UPDATE challenge_enrollments SET
         status = $1,
         current_progress = $2,
         completed_at = $3,
         claimed_at = $4,
         last_evaluated_at = $5,
         updated_at = $6
       WHERE id = $7`,
      [
        enrollment.status,
        enrollment.currentProgress,
        enrollment.completedAt,
        enrollment.claimedAt,
        enrollment.lastEvaluatedAt,
        enrollment.updatedAt,
        enrollment.id,
      ],
    );
  }
}

