import type { KeyedHasher } from '../../../shared/security/keyed-hasher.js';
import { randomId, randomToken } from '../../../shared/security/random.js';
import { formatRefreshToken, refreshExpiry } from '../domain/session.js';
import type { AccessTokenService, AuthTokens, ClientMeta, Clock, SessionRepository } from './ports.js';

const truncate = (value: string | null, max: number): string | null =>
  value === null ? null : value.slice(0, max);

/** Creates a session and its first token pair. Shared by login and registration. */
export class SessionIssuer {
  constructor(
    private readonly deps: {
      sessions: SessionRepository;
      tokens: AccessTokenService;
      keyedHasher: KeyedHasher;
      refreshTokenTtlDays: number;
      clock: Clock;
    },
  ) {}

  async issue(userId: string, meta: ClientMeta): Promise<AuthTokens> {
    const sessionId = randomId();
    const secret = randomToken();
    const refreshTokenExpiresAt = refreshExpiry(this.deps.clock(), this.deps.refreshTokenTtlDays);

    await this.deps.sessions.create({
      id: sessionId,
      userId,
      refreshTokenHash: this.deps.keyedHasher.digest(secret),
      expiresAt: refreshTokenExpiresAt,
      userAgent: truncate(meta.userAgent, 512),
      ipAddress: truncate(meta.ip, 64),
    });
    const access = await this.deps.tokens.issue({ userId, sessionId });

    return {
      sessionId,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: formatRefreshToken(sessionId, secret),
      refreshTokenExpiresAt,
    };
  }
}
