import type { Role } from '../../../shared/auth/permissions.js';
import type { PasswordResetToken } from '../domain/password-reset.js';
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

export interface NewPasswordResetToken {
  id: string;
  userId: string;
  /** Keyed digest of the OTP. The OTP itself is never handed to a repository. */
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  requestIp: string | null;
  userAgent: string | null;
}

/**
 * Storage of single-use reset tokens. Time is always passed in (`now`) so expiry is decided by the
 * application clock and tests can pin the boundary exactly.
 */
export interface PasswordResetTokenRepository {
  /** Serialises reset requests/verifications of one user until the surrounding transaction ends. */
  lockUser(userId: string): Promise<void>;
  countCreatedSince(userId: string, since: Date): Promise<number>;
  /** Marks every still-unredeemed OTP of the user as used (superseded). Returns how many changed. */
  invalidateOutstanding(userId: string, now: Date): Promise<number>;
  create(token: NewPasswordResetToken): Promise<void>;
  /** Newest OTP of the user that is unused, unexpired and still under `maxAttempts` failed guesses. */
  findActiveByUser(userId: string, now: Date, maxAttempts: number): Promise<PasswordResetToken | null>;
  /** Counts one wrong guess against the OTP (atomic increment). Returns the new count. */
  recordFailedAttempt(id: string): Promise<number>;
  /**
   * Atomic one-time redemption: succeeds only while `used_at IS NULL AND expires_at > now AND
   * failed_attempts < maxAttempts`, and for exactly one of any number of concurrent callers.
   */
  consume(id: string, now: Date, maxAttempts: number): Promise<{ userId: string } | null>;
  /** Housekeeping: deletes OTPs that expired or were used more than `retentionDays` ago. */
  purge(retentionDays: number): Promise<number>;
}

/** What a password reset message needs: the recipient and the 6-digit OTP (there is no link). */
export interface PasswordResetMessage {
  email: string;
  /** The 6-digit one-time code. Handle like a password: never log, never persist. */
  otp: string;
  expiresAt: Date;
}

/**
 * Delivers a reset message (e-mail today, possibly push/SMS later). No provider is configured in this
 * repository: composition supplies an implementation or password reset stays disabled (503).
 * Implementations must not log `otp`, and should throw on failure so it can be reported safely.
 */
export interface PasswordResetNotifier {
  send(message: PasswordResetMessage): Promise<void>;
}

/** Operational signal about the reset flow. Deliberately carries no secrets, e-mail or error message. */
export interface PasswordResetFailureEvent {
  stage: 'issue' | 'deliver';
  userId: string;
  /** Constructor/class name of the error only; messages from providers may echo the OTP. */
  errorName: string;
}
