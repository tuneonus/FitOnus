import type { SqlExecutor } from '../../../database/transaction.js';
import { ChallengeOccurrence, type OccurrenceStatus } from '../domain/challenge-occurrence.js';
import type { IChallengeOccurrenceRepository } from '../application/ports.js';

interface OccurrenceRow {
  id: string;
  challenge_id: string;
  occurrence_key: string;
  period_start: Date;
  period_end: Date;
  status: string;
  created_at: Date;
  updated_at: Date;
}

function toDomainOccurrence(row: OccurrenceRow): ChallengeOccurrence {
  return new ChallengeOccurrence({
    id: row.id,
    challengeId: row.challenge_id,
    occurrenceKey: row.occurrence_key,
    periodStart: new Date(row.period_start),
    periodEnd: new Date(row.period_end),
    status: row.status as OccurrenceStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}

export class PgChallengeOccurrenceRepository implements IChallengeOccurrenceRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string): Promise<ChallengeOccurrence | null> {
    const res = await this.db.query<OccurrenceRow>(
      `SELECT * FROM challenge_occurrences WHERE id = $1 LIMIT 1`,
      [id],
    );
    const row = res.rows[0];
    return row ? toDomainOccurrence(row) : null;
  }

  async findByChallengeAndStart(challengeId: string, periodStart: Date): Promise<ChallengeOccurrence | null> {
    const res = await this.db.query<OccurrenceRow>(
      `SELECT * FROM challenge_occurrences 
       WHERE challenge_id = $1 AND period_start = $2 
       LIMIT 1`,
      [challengeId, periodStart],
    );
    const row = res.rows[0];
    return row ? toDomainOccurrence(row) : null;
  }

  async findByChallengeAndKey(
    challengeId: string,
    occurrenceKey: string,
  ): Promise<ChallengeOccurrence | null> {
    const res = await this.db.query<OccurrenceRow>(
      `SELECT * FROM challenge_occurrences 
       WHERE challenge_id = $1 AND occurrence_key = $2 
       LIMIT 1`,
      [challengeId, occurrenceKey],
    );
    const row = res.rows[0];
    return row ? toDomainOccurrence(row) : null;
  }

  async listActiveForPeriod(fromDate: Date, toDate: Date): Promise<ChallengeOccurrence[]> {
    const res = await this.db.query<OccurrenceRow>(
      `SELECT * FROM challenge_occurrences 
       WHERE status = 'active'
         AND period_end >= $1
         AND period_start <= $2
       ORDER BY period_start ASC`,
      [fromDate, toDate],
    );
    return res.rows.map(toDomainOccurrence);
  }

  async listByChallenge(challengeId: string, limit = 20): Promise<ChallengeOccurrence[]> {
    const res = await this.db.query<OccurrenceRow>(
      `SELECT * FROM challenge_occurrences 
       WHERE challenge_id = $1 
       ORDER BY period_start DESC 
       LIMIT $2`,
      [challengeId, limit],
    );
    return res.rows.map(toDomainOccurrence);
  }

  async findOrCreate(occurrence: ChallengeOccurrence): Promise<ChallengeOccurrence> {
    const res = await this.db.query<OccurrenceRow>(
      `INSERT INTO challenge_occurrences (
         id, challenge_id, occurrence_key, period_start, period_end, status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (challenge_id, period_start) DO UPDATE
         SET updated_at = challenge_occurrences.updated_at
       RETURNING *`,
      [
        occurrence.id,
        occurrence.challengeId,
        occurrence.occurrenceKey,
        occurrence.periodStart,
        occurrence.periodEnd,
        occurrence.status,
        occurrence.createdAt,
        occurrence.updatedAt,
      ],
    );
    return toDomainOccurrence(res.rows[0]!);
  }

  async updateStatus(id: string, status: OccurrenceStatus): Promise<void> {
    await this.db.query(`UPDATE challenge_occurrences SET status = $1, updated_at = now() WHERE id = $2`, [
      status,
      id,
    ]);
  }
}
