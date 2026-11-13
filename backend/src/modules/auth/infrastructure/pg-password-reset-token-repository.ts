import type { SqlExecutor } from '../../../database/transaction.js';
import type { NewPasswordResetToken, PasswordResetTokenRepository } from '../application/ports.js';
import type { PasswordResetToken } from '../domain/password-reset.js';

interface TokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  used_at: Date | null;
  failed_attempts: number;
}

const toToken = (row: TokenRow): PasswordResetToken => ({
  id: row.id,
  userId: row.user_id,
  tokenHash: row.token_hash,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  usedAt: row.used_at,
  failedAttempts: row.failed_attempts,
});

/** Table: password_reset_tokens (migrations 0016 + 0017). Stores keyed OTP digests only, never an OTP. */
export class PgPasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly db: SqlExecutor) {}

  async lockUser(userId: string): Promise<void> {
    // Transaction-scoped: released at COMMIT/ROLLBACK. Callers must run inside a UnitOfWork.
    await this.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [
      `auth.password-reset:${userId}`,
    ]);
  }

  async countCreatedSince(userId: string, since: Date): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id = $1 AND created_at > $2`,
      [userId, since],
    );
    return rows[0]?.n ?? 0;
  }

  async invalidateOutstanding(userId: string, now: Date): Promise<number> {
    const result = await this.db.query(
      `UPDATE password_reset_tokens SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL`,
      [userId, now],
    );
    return result.rowCount ?? 0;
  }

  async create(token: NewPasswordResetToken): Promise<void> {
    await this.db.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at, request_ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        token.id,
        token.userId,
        token.tokenHash,
        token.createdAt,
        token.expiresAt,
        token.requestIp,
        token.userAgent,
      ],
    );
  }

  async findActiveByUser(userId: string, now: Date, maxAttempts: number): Promise<PasswordResetToken | null> {
    const { rows } = await this.db.query<TokenRow>(
      `SELECT id, user_id, token_hash, created_at, expires_at, used_at, failed_attempts
         FROM password_reset_tokens
        WHERE user_id = $1 AND used_at IS NULL AND expires_at > $2 AND failed_attempts < $3
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, now, maxAttempts],
    );
    return rows[0] ? toToken(rows[0]) : null;
  }

  async recordFailedAttempt(id: string): Promise<number> {
    const { rows } = await this.db.query<{ failed_attempts: number }>(
      `UPDATE password_reset_tokens SET failed_attempts = failed_attempts + 1
        WHERE id = $1 RETURNING failed_attempts`,
      [id],
    );
    return rows[0]?.failed_attempts ?? 0;
  }

  async consume(id: string, now: Date, maxAttempts: number): Promise<{ userId: string } | null> {
    // One statement = one winner: a concurrent redeemer blocks on the row lock, then re-evaluates
    // `used_at IS NULL` against the committed row and matches nothing.
    const { rows } = await this.db.query<{ user_id: string }>(
      `UPDATE password_reset_tokens SET used_at = $2
        WHERE id = $1 AND used_at IS NULL AND expires_at > $2 AND failed_attempts < $3
        RETURNING user_id`,
      [id, now, maxAttempts],
    );
    return rows[0] ? { userId: rows[0].user_id } : null;
  }

  async purge(retentionDays: number): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM password_reset_tokens
        WHERE expires_at < now() - make_interval(days => $1)
           OR (used_at IS NOT NULL AND used_at < now() - make_interval(days => $1))`,
      [retentionDays],
    );
    return result.rowCount ?? 0;
  }
}
