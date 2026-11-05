import { errors, jwtVerify, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { unauthorized } from '../../../shared/errors/app-error.js';
import type { AccessTokenClaims, AccessTokenService, Clock } from '../application/ports.js';

const ALGORITHM = 'HS256';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Short-lived HS256 access tokens. Only this process signs and verifies, so a shared
 * secret is sufficient; switch to EdDSA/RS256 + JWKS when other services must verify.
 */
export class JoseAccessTokenService implements AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    private readonly options: {
      secret: string;
      issuer: string;
      audience: string;
      ttlSeconds: number;
      clock: Clock;
    },
  ) {
    this.key = new TextEncoder().encode(options.secret);
  }

  async issue(claims: AccessTokenClaims): Promise<{ token: string; expiresAt: Date }> {
    const issuedAt = Math.floor(this.options.clock().getTime() / 1000);
    const expiresAt = issuedAt + this.options.ttlSeconds;
    const token = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .setJti(randomUUID())
      .sign(this.key);
    return { token, expiresAt: new Date(expiresAt * 1000) };
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer: this.options.issuer,
        audience: this.options.audience,
        typ: 'JWT',
        requiredClaims: ['sub', 'sid', 'exp', 'iat'],
        currentDate: this.options.clock(),
      });
      const { sub, sid } = payload;
      if (typeof sub !== 'string' || typeof sid !== 'string' || !UUID.test(sub) || !UUID.test(sid)) {
        throw unauthorized('INVALID_TOKEN', 'The access token is invalid.');
      }
      return { userId: sub, sessionId: sid };
    } catch (error) {
      if (error instanceof errors.JWTExpired) {
        throw unauthorized('TOKEN_EXPIRED', 'The access token has expired.');
      }
      throw unauthorized('INVALID_TOKEN', 'The access token is invalid.');
    }
  }
}
