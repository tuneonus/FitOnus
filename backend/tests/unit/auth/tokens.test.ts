import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { formatRefreshToken, parseRefreshToken } from '../../../src/modules/auth/domain/session.js';
import { JoseAccessTokenService } from '../../../src/modules/auth/infrastructure/jose-access-token-service.js';
import { randomToken } from '../../../src/shared/security/random.js';

const secret = 'unit-test-signing-secret-unit-test-signing-secret';
const options = { secret, issuer: 'iss', audience: 'aud', ttlSeconds: 900 };
const claims = { userId: randomUUID(), sessionId: randomUUID() };

describe('JoseAccessTokenService', () => {
  it('round-trips claims', async () => {
    const service = new JoseAccessTokenService({ ...options, clock: () => new Date() });
    const { token, expiresAt } = await service.issue(claims);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(service.verify(token)).resolves.toEqual(claims);
  });

  it('reports expired tokens distinctly', async () => {
    const past = new JoseAccessTokenService({ ...options, clock: () => new Date(Date.now() - 3_600_000) });
    const { token } = await past.issue(claims);
    const now = new JoseAccessTokenService({ ...options, clock: () => new Date() });
    await expect(now.verify(token)).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('rejects the wrong audience, issuer, key or algorithm', async () => {
    const service = new JoseAccessTokenService({ ...options, clock: () => new Date() });
    const variants = [
      new JoseAccessTokenService({ ...options, audience: 'other', clock: () => new Date() }),
      new JoseAccessTokenService({ ...options, issuer: 'other', clock: () => new Date() }),
      new JoseAccessTokenService({ ...options, secret: `${secret}-different`, clock: () => new Date() }),
    ];
    for (const variant of variants) {
      const { token } = await variant.issue(claims);
      await expect(service.verify(token)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    }

    const hs512 = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS512', typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer('iss')
      .setAudience('aud')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));
    await expect(service.verify(hs512)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });

    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: claims.userId, sid: claims.sessionId, iss: 'iss', aud: 'aud' }),
    ).toString('base64url')}.`;
    await expect(service.verify(unsigned)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });
});

describe('refresh token format', () => {
  it('round-trips and rejects malformed tokens', () => {
    const sessionId = randomUUID();
    const secretPart = randomToken();
    expect(parseRefreshToken(formatRefreshToken(sessionId, secretPart))).toEqual({
      sessionId,
      secret: secretPart,
    });
    for (const bad of [
      '',
      'abc',
      `${sessionId}`,
      `${sessionId}.short`,
      `not-a-uuid.${secretPart}`,
      `${sessionId}.${secretPart}.x`,
    ]) {
      expect(parseRefreshToken(bad)).toBeNull();
    }
  });
});
