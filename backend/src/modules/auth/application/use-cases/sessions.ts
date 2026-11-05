import type { Actor } from '../../../../shared/auth/actor.js';
import { notFound } from '../../../../shared/errors/app-error.js';
import type { Session } from '../../domain/session.js';
import type { SessionRepository } from '../ports.js';

export interface SessionView {
  id: string;
  current: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
}

const toSessionView = (session: Session, currentSessionId: string): SessionView => ({
  id: session.id,
  current: session.id === currentSessionId,
  createdAt: session.createdAt.toISOString(),
  lastUsedAt: session.lastUsedAt.toISOString(),
  expiresAt: session.expiresAt.toISOString(),
  userAgent: session.userAgent,
  ipAddress: session.ipAddress,
});

/** Session management for the caller's own sessions only. */
export class SessionsUseCases {
  constructor(private readonly deps: { sessions: SessionRepository }) {}

  async list(actor: Actor): Promise<SessionView[]> {
    const sessions = await this.deps.sessions.listActiveForUser(actor.userId);
    return sessions.map((session) => toSessionView(session, actor.sessionId));
  }

  async logout(actor: Actor): Promise<{ revokedSessions: number }> {
    const revoked = await this.deps.sessions.revoke(actor.sessionId, 'logout');
    return { revokedSessions: revoked ? 1 : 0 };
  }

  async logoutAll(actor: Actor): Promise<{ revokedSessions: number }> {
    return { revokedSessions: await this.deps.sessions.revokeAllForUser(actor.userId, 'logout_all') };
  }

  /** Ownership check: another user's session id is reported as not found, not forbidden. */
  async revoke(actor: Actor, sessionId: string): Promise<{ revokedSessions: number }> {
    const session = await this.deps.sessions.findById(sessionId);
    if (!session || session.userId !== actor.userId || session.revokedAt !== null) {
      throw notFound('SESSION_NOT_FOUND', 'Session not found.');
    }
    const revoked = await this.deps.sessions.revoke(sessionId, 'user_revoked');
    return { revokedSessions: revoked ? 1 : 0 };
  }
}
