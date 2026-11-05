export const REVOKE_REASONS = [
  'logout',
  'logout_all',
  'token_reuse',
  'password_change',
  'user_revoked',
  'account_disabled',
] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];

/** A login session. Each session has exactly one valid refresh token at a time. */
export interface Session {
  id: string;
  userId: string;
  refreshTokenHash: string;
  rotationCount: number;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: RevokeReason | null;
  userAgent: string | null;
  ipAddress: string | null;
}

export const isSessionActive = (session: Session, now: Date): boolean =>
  session.revokedAt === null && session.expiresAt.getTime() > now.getTime();

const DAY_MS = 86_400_000;

export const refreshExpiry = (now: Date, ttlDays: number): Date => new Date(now.getTime() + ttlDays * DAY_MS);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET = /^[A-Za-z0-9_-]{43}$/;

/**
 * Refresh tokens are "<sessionId>.<secret>". The session id makes lookup O(1) and lets us
 * detect replay: a well-formed token for a live session whose secret no longer matches
 * means an old (rotated) token was reused.
 */
export const formatRefreshToken = (sessionId: string, secret: string): string => `${sessionId}.${secret}`;

export function parseRefreshToken(token: string): { sessionId: string; secret: string } | null {
  const [sessionId, secret, ...rest] = token.split('.');
  if (rest.length > 0 || !sessionId || !secret) return null;
  if (!UUID.test(sessionId) || !SECRET.test(secret)) return null;
  return { sessionId: sessionId.toLowerCase(), secret };
}
