import type { Role } from '../../../shared/auth/permissions.js';
import type { RevokeReason, Session } from '../domain/session.js';

export interface NewSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface SessionRepository {
  create(session: NewSession): Promise<Session>;
  findById(id: string): Promise<Session | null>;
  /** Compare-and-set rotation: succeeds only if `currentHash` is still the session's live hash. */
  rotate(input: {
    id: string;
    currentHash: string;
    nextHash: string;
    expiresAt: Date;
  }): Promise<Session | null>;
  revoke(id: string, reason: RevokeReason): Promise<boolean>;
  revokeAllForUser(
    userId: string,
    reason: RevokeReason,
    options?: { exceptSessionId?: string },
  ): Promise<number>;
  listActiveForUser(userId: string): Promise<Session[]>;
}

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

export interface AccessTokenService {
  issue(claims: AccessTokenClaims): Promise<{ token: string; expiresAt: Date }>;
  /** Throws INVALID_TOKEN or TOKEN_EXPIRED. */
  verify(token: string): Promise<AccessTokenClaims>;
}

export interface AccountState {
  id: string;
  role: Role;
  status: 'active' | 'disabled';
}

export interface AccountCredentials extends AccountState {
  email: string;
  passwordHash: string;
}

/**
 * What auth needs from whoever owns accounts. The users module's public API satisfies it;
 * auth never touches the users table directly.
 */
export interface UserAccountsPort {
  findCredentialsByEmail(email: string): Promise<AccountCredentials | null>;
  findCredentialsById(id: string): Promise<AccountCredentials | null>;
  getAccountState(id: string): Promise<AccountState | null>;
  registerAccount(input: { email: string; displayName: string; passwordHash: string }): Promise<AccountState>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
}

export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface AuthTokens {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export type Clock = () => Date;
