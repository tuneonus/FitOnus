import type { KeyedHasher } from '../../../../shared/security/keyed-hasher.js';
import { randomToken } from '../../../../shared/security/random.js';
import {
  formatRefreshToken,
  isSessionActive,
  parseRefreshToken,
  refreshExpiry,
} from '../../domain/session.js';
import { accountDisabled, invalidRefreshToken, refreshTokenReused } from '../errors.js';
import type { AccessTokenService, AuthTokens, Clock, SessionRepository, UserAccountsPort } from '../ports.js';

/**
 * Rotates the refresh token. Presenting a token that was already rotated (replay, or a
 * stolen copy racing the real client) revokes the whole session: both parties must sign in again.
 */
export class RefreshSessionUseCase {
  constructor(
    private readonly deps: {
      sessions: SessionRepository;
      tokens: AccessTokenService;
      accounts: UserAccountsPort;
      keyedHasher: KeyedHasher;
      refreshTokenTtlDays: number;
      clock: Clock;
    },
  ) {}

  async execute(refreshToken: string): Promise<AuthTokens> {
    const { sessions, keyedHasher } = this.deps;
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) throw invalidRefreshToken();

    const session = await sessions.findById(parsed.sessionId);
    if (!session || !isSessionActive(session, this.deps.clock())) throw invalidRefreshToken();

    if (!keyedHasher.matches(parsed.secret, session.refreshTokenHash)) {
      await sessions.revoke(session.id, 'token_reuse');
      throw refreshTokenReused();
    }

    const account = await this.deps.accounts.getAccountState(session.userId);
    if (!account || account.status !== 'active') {
      await sessions.revoke(session.id, 'account_disabled');
      throw accountDisabled();
    }

    const nextSecret = randomToken();
    const refreshTokenExpiresAt = refreshExpiry(this.deps.clock(), this.deps.refreshTokenTtlDays);
    const rotated = await sessions.rotate({
      id: session.id,
      currentHash: session.refreshTokenHash,
      nextHash: keyedHasher.digest(nextSecret),
      expiresAt: refreshTokenExpiresAt,
    });
    if (!rotated) {
      // Another request rotated this same token first: the token was presented twice.
      await sessions.revoke(session.id, 'token_reuse');
      throw refreshTokenReused();
    }

    const access = await this.deps.tokens.issue({ userId: session.userId, sessionId: session.id });
    return {
      sessionId: session.id,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: formatRefreshToken(session.id, nextSecret),
      refreshTokenExpiresAt,
    };
  }
}
