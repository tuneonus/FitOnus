import type { SqlExecutor } from '../../database/transaction.js';
import type { PrivateMediaDeletionQueue } from './deletion-queue.js';
import { isPrivateObjectKey } from './private-image-policy.js';

/** Longest wait between two attempts on the same object: six hours. */
const MAX_BACKOFF_SECONDS = 21_600;
const BASE_BACKOFF_SECONDS = 30;
const MAX_REASON_LENGTH = 200;

/** PostgreSQL implementation of the queue over `private_media_deletions` (migration 0025). */
export class PgPrivateMediaDeletionQueue implements PrivateMediaDeletionQueue {
  constructor(private readonly db: SqlExecutor) {}

  async enqueue(keys: readonly string[]): Promise<void> {
    const valid = [...new Set(keys)].filter(isPrivateObjectKey);
    if (valid.length !== new Set(keys).size)
      throw new Error('Refusing to queue a key that is not a private key');
    if (valid.length === 0) return;
    await this.db.query(
      `INSERT INTO private_media_deletions (object_key)
       SELECT unnest($1::text[])
       ON CONFLICT (object_key) DO NOTHING`,
      [valid],
    );
  }

  async claimDue(limit: number, leaseSeconds: number): Promise<string[]> {
    const { rows } = await this.db.query<{ object_key: string }>(
      `WITH due AS (
         SELECT object_key
           FROM private_media_deletions
          WHERE next_attempt_at <= now()
          ORDER BY next_attempt_at, object_key
          LIMIT $1
            FOR UPDATE SKIP LOCKED
       )
       UPDATE private_media_deletions q
          SET next_attempt_at = now() + make_interval(secs => $2::double precision)
         FROM due
        WHERE q.object_key = due.object_key
    RETURNING q.object_key`,
      [limit, leaseSeconds],
    );
    return rows.map((row) => row.object_key);
  }

  async complete(key: string): Promise<void> {
    await this.db.query('DELETE FROM private_media_deletions WHERE object_key = $1', [key]);
  }

  async fail(key: string, reason: string): Promise<void> {
    await this.db.query(
      `UPDATE private_media_deletions
          SET attempts = attempts + 1,
              last_error = left($2, ${MAX_REASON_LENGTH}),
              next_attempt_at = now() + make_interval(
                secs => LEAST(${MAX_BACKOFF_SECONDS}, ${BASE_BACKOFF_SECONDS} * power(2, LEAST(attempts, 12)))::double precision)
        WHERE object_key = $1`,
      [key, reason],
    );
  }

  async pendingCount(): Promise<number> {
    const { rows } = await this.db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM private_media_deletions',
    );
    return Number(rows[0]?.count ?? 0);
  }
}
