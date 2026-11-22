import type { Database } from '../../../database/transaction.js';
import type { MemoryExtractionJobQueue } from '../application/ports.js';
import type {
  ExtractionJobStatus,
  MemoryExtractionJob,
} from '../domain/extraction-job.types.js';

interface JobRow {
  id: string;
  user_id: string;
  conversation_id: string;
  message_id: string;
  status: ExtractionJobStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: Date;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export class PgMemoryExtractionJobQueue implements MemoryExtractionJobQueue {
  constructor(private readonly db: Database) {}

  async enqueue(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO ai_memory_extraction_jobs (user_id, conversation_id, message_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (conversation_id, message_id) DO NOTHING`,
      [userId, conversationId, messageId],
    );
  }

  async claimDue(
    limit: number,
    leaseSeconds: number,
  ): Promise<MemoryExtractionJob[]> {
    const res = await this.db.query<JobRow>(
      `WITH due AS (
         SELECT id
         FROM ai_memory_extraction_jobs
         WHERE (
           status = 'pending'
           OR (status = 'failed' AND attempts < max_attempts)
           OR (status = 'processing' AND next_attempt_at <= now())
         )
         AND next_attempt_at <= now()
         ORDER BY next_attempt_at ASC, created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE ai_memory_extraction_jobs j
       SET status = 'processing',
           next_attempt_at = now() + make_interval(secs => $2::double precision),
           updated_at = now()
       FROM due
       WHERE j.id = due.id
       RETURNING j.id, j.user_id, j.conversation_id, j.message_id, j.status,
                 j.attempts, j.max_attempts, j.next_attempt_at, j.last_error,
                 j.created_at, j.updated_at`,
      [limit, leaseSeconds],
    );

    return res.rows.map((r) => this.mapJob(r));
  }

  async complete(jobId: string): Promise<void> {
    await this.db.query(
      `UPDATE ai_memory_extraction_jobs
       SET status = 'completed', updated_at = now()
       WHERE id = $1`,
      [jobId],
    );
  }

  async fail(jobId: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE ai_memory_extraction_jobs
       SET attempts = attempts + 1,
           last_error = left($2, 200),
           status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END,
           next_attempt_at = now() + make_interval(
             secs => LEAST(3600, 30 * power(2, LEAST(attempts, 6)))::double precision
           ),
           updated_at = now()
       WHERE id = $1`,
      [jobId, error],
    );
  }

  async cancelForUser(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE ai_memory_extraction_jobs
       SET status = 'cancelled', updated_at = now()
       WHERE user_id = $1 AND status IN ('pending', 'processing', 'failed')`,
      [userId],
    );
  }

  async isJobCancelled(jobId: string): Promise<boolean> {
    const res = await this.db.query<{ status: string }>(
      `SELECT status FROM ai_memory_extraction_jobs WHERE id = $1`,
      [jobId],
    );
    const row = res.rows[0];
    if (!row) return true;
    return row.status === 'cancelled';
  }

  async pruneOldJobs(olderThanDays = 7): Promise<number> {
    const res = await this.db.query(
      `DELETE FROM ai_memory_extraction_jobs
       WHERE status IN ('completed', 'cancelled')
         AND updated_at < now() - make_interval(days => $1::integer)`,
      [olderThanDays],
    );
    return res.rowCount ?? 0;
  }

  private mapJob(row: JobRow): MemoryExtractionJob {
    return {
      id: row.id,
      userId: row.user_id,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      nextAttemptAt: row.next_attempt_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
