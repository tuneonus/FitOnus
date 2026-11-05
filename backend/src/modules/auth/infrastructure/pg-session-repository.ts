import type { SqlExecutor } from '../../../database/transaction.js';
import type { RevokeReason, Session } from '../domain/session.js';
import type { NewSession, SessionRepository } from '../application/ports.js';

interface SessionRow {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  rotation_count: number;
  created_at: Date;
  last_used_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  revoke_reason: RevokeReason | null;
  user_agent: string | null;
  ip_address: string | null;
}

const COLUMNS =
  'id, user_id, refresh_token_hash, rotation_count, created_at, last_used_at, expires_at, revoked_at, revoke_reason, user_agent, ip_address';

const toSession = (row: SessionRow): Session => ({
  id: row.id,
  userId: row.user_id,
  refreshTokenHash: row.refresh_token_hash,
  rotationCount: row.rotation_count,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  revokeReason: row.revoke_reason,
  userAgent: row.user_agent,
  ipAddress: row.ip_address,
});

export class PgSessionRepository implements SessionRepository {
  constructor(private readonly db: SqlExecutor) {}

  async create(session: NewSession): Promise<Session> {
    const { rows } = await this.db.query<SessionRow>(
      `INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        session.id,
        session.userId,
        session.refreshTokenHash,
        session.expiresAt,
        session.userAgent,
        session.ipAddress,
      ],
    );
    return toSession(rows[0]!);
  }

  async findById(id: string): Promise<Session | null> {
    const { rows } = await this.db.query<SessionRow>(`SELECT ${COLUMNS} FROM auth_sessions WHERE id = $1`, [
      id,
    ]);
    return rows[0] ? toSession(rows[0]) : null;
  }

  async rotate(input: {
    id: string;
    currentHash: string;
    nextHash: string;
    expiresAt: Date;
  }): Promise<Session | null> {
    const { rows } = await this.db.query<SessionRow>(
      `UPDATE auth_sessions
          SET refresh_token_hash = $3, expires_at = $4, last_used_at = now(), rotation_count = rotation_count + 1
        WHERE id = $1 AND refresh_token_hash = $2 AND revoked_at IS NULL AND expires_at > now()
        RETURNING ${COLUMNS}`,
      [input.id, input.currentHash, input.nextHash, input.expiresAt],
    );
    return rows[0] ? toSession(rows[0]) : null;
  }

  async revoke(id: string, reason: RevokeReason): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = $2 WHERE id = $1 AND revoked_at IS NULL`,
      [id, reason],
    );
    return result.rowCount === 1;
  }

  async revokeAllForUser(
    userId: string,
    reason: RevokeReason,
    options: { exceptSessionId?: string } = {},
  ): Promise<number> {
    const result = await this.db.query(
      `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = $2
        WHERE user_id = $1 AND revoked_at IS NULL AND ($3::uuid IS NULL OR id <> $3::uuid)`,
      [userId, reason, options.exceptSessionId ?? null],
    );
    return result.rowCount ?? 0;
  }

  async listActiveForUser(userId: string): Promise<Session[]> {
    const { rows } = await this.db.query<SessionRow>(
      `SELECT ${COLUMNS} FROM auth_sessions
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
        ORDER BY last_used_at DESC`,
      [userId],
    );
    return rows.map(toSession);
  }

  /** Housekeeping: drops sessions that expired or were revoked more than `retentionDays` ago. */
  async purgeInactive(retentionDays: number): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM auth_sessions
        WHERE (expires_at < now() - make_interval(days => $1))
           OR (revoked_at IS NOT NULL AND revoked_at < now() - make_interval(days => $1))`,
      [retentionDays],
    );
    return result.rowCount ?? 0;
  }
}
