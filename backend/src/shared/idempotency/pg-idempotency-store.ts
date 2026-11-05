import type { SqlExecutor } from '../../database/transaction.js';
import type { IdempotencyKeyRef, IdempotencyRecord, IdempotencyStore } from './idempotency.js';

/**
 * The primary key makes the claim atomic: concurrent INSERTs for the same key
 * serialise, and the conditional DO UPDATE only takes over expired records or
 * abandoned (lease-expired) claims for the same payload.
 */
const CLAIM_SQL = `
  INSERT INTO idempotency_keys
    (scope, operation, idempotency_key, fingerprint, status, lock_token, locked_until, expires_at)
  VALUES
    ($1, $2, $3, $4, 'in_progress', $5, now() + make_interval(secs => $6), now() + make_interval(secs => $7))
  ON CONFLICT (scope, operation, idempotency_key) DO UPDATE SET
    fingerprint  = EXCLUDED.fingerprint,
    status       = 'in_progress',
    lock_token   = EXCLUDED.lock_token,
    locked_until = EXCLUDED.locked_until,
    expires_at   = EXCLUDED.expires_at,
    response     = NULL,
    completed_at = NULL,
    created_at   = now()
  WHERE idempotency_keys.expires_at <= now()
     OR (idempotency_keys.status = 'in_progress'
         AND idempotency_keys.locked_until <= now()
         AND idempotency_keys.fingerprint = EXCLUDED.fingerprint)
  RETURNING lock_token`;

export class PgIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: SqlExecutor) {}

  async claim(
    ref: IdempotencyKeyRef,
    claim: { fingerprint: string; lockToken: string; leaseSeconds: number; ttlSeconds: number },
  ): Promise<boolean> {
    const { rows } = await this.db.query<{ lock_token: string }>(CLAIM_SQL, [
      ref.scope,
      ref.operation,
      ref.key,
      claim.fingerprint,
      claim.lockToken,
      claim.leaseSeconds,
      claim.ttlSeconds,
    ]);
    return rows[0]?.lock_token === claim.lockToken;
  }

  async find(ref: IdempotencyKeyRef): Promise<IdempotencyRecord | null> {
    const { rows } = await this.db.query<{
      fingerprint: string;
      status: 'in_progress' | 'completed';
      response: unknown;
    }>(
      `SELECT fingerprint, status, response
         FROM idempotency_keys
        WHERE scope = $1 AND operation = $2 AND idempotency_key = $3 AND expires_at > now()`,
      [ref.scope, ref.operation, ref.key],
    );
    return rows[0] ?? null;
  }

  async complete(ref: IdempotencyKeyRef, lockToken: string, response: unknown): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE idempotency_keys
          SET status = 'completed', response = $5::jsonb, completed_at = now()
        WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
          AND lock_token = $4 AND status = 'in_progress'`,
      [ref.scope, ref.operation, ref.key, lockToken, JSON.stringify(response)],
    );
    return result.rowCount === 1;
  }

  async release(ref: IdempotencyKeyRef, lockToken: string): Promise<void> {
    await this.db.query(
      `DELETE FROM idempotency_keys
        WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
          AND lock_token = $4 AND status = 'in_progress'`,
      [ref.scope, ref.operation, ref.key, lockToken],
    );
  }

  async deleteExpired(): Promise<number> {
    const result = await this.db.query('DELETE FROM idempotency_keys WHERE expires_at <= now()');
    return result.rowCount ?? 0;
  }
}
