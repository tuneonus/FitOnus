import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database } from '../../../src/database/transaction.js';
import { SessionIssuer } from '../../../src/modules/auth/application/session-issuer.js';
import { RefreshSessionUseCase } from '../../../src/modules/auth/application/use-cases/refresh-session.js';
import { JoseAccessTokenService } from '../../../src/modules/auth/infrastructure/jose-access-token-service.js';
import { PgSessionRepository } from '../../../src/modules/auth/infrastructure/pg-session-repository.js';
import { createUserAccountsApi } from '../../../src/modules/users/application/accounts.js';
import { PgUserRepository } from '../../../src/modules/users/infrastructure/pg-user-repository.js';
import { HmacKeyedHasher } from '../../../src/shared/security/hmac-keyed-hasher.js';
import { seedUser } from '../../helpers/test-app.js';
import { createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';

/**
 * Compare-and-set rotation and reuse detection against real PostgreSQL. The "KNOWN LIMITATION" test
 * pins the current (strict) behaviour for a legitimate client retrying after a lost response.
 */
describe('refresh token rotation (PostgreSQL)', () => {
  let db: TestDatabase;
  let sessions: PgSessionRepository;
  let issuer: SessionIssuer;
  let refresh: RefreshSessionUseCase;
  const keyedHasher = new HmacKeyedHasher('integration-test-hmac-secret-0123456789-abcdef');

  beforeAll(async () => {
    db = await createTestDatabase();
    const database = new Database(db.pool);
    sessions = new PgSessionRepository(database);
    const accounts = createUserAccountsApi(new PgUserRepository(database));
    const clock = () => new Date();
    const tokens = new JoseAccessTokenService({
      secret: 'integration-test-access-secret-0123456789-abcdef',
      issuer: 'refresh-test',
      audience: 'refresh-test-clients',
      ttlSeconds: 900,
      clock,
    });
    issuer = new SessionIssuer({ sessions, tokens, keyedHasher, refreshTokenTtlDays: 30, clock });
    refresh = new RefreshSessionUseCase({
      sessions,
      tokens,
      accounts,
      keyedHasher,
      refreshTokenTtlDays: 30,
      clock,
    });
  });
  afterAll(() => db.drop());

  const startSession = async () => {
    const user = await seedUser(db.pool);
    return { user, tokens: await issuer.issue(user.id, { ip: '127.0.0.1', userAgent: 'vitest' }) };
  };
  const stored = async (sessionId: string) => (await sessions.findById(sessionId))!;

  it('the SQL compare-and-set lets exactly one concurrent rotation win', async () => {
    const { tokens } = await startSession();
    const session = await stored(tokens.sessionId);

    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        sessions.rotate({
          id: session.id,
          currentHash: session.refreshTokenHash,
          nextHash: keyedHasher.digest(randomUUID()),
          expiresAt: new Date(Date.now() + 86_400_000),
        }),
      ),
    );
    expect(attempts.filter((attempt) => attempt !== null)).toHaveLength(1);
    expect((await stored(session.id)).rotationCount).toBe(1);
  });

  it('refuses to rotate revoked sessions', async () => {
    const { tokens } = await startSession();
    const session = await stored(tokens.sessionId);
    await sessions.revoke(session.id, 'logout');
    await expect(
      sessions.rotate({
        id: session.id,
        currentHash: session.refreshTokenHash,
        nextHash: keyedHasher.digest(randomUUID()),
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
    ).resolves.toBeNull();
  });

  it('rotates a chain of tokens; only the latest one is ever valid', async () => {
    const { tokens } = await startSession();
    const second = await refresh.execute(tokens.refreshToken);
    const third = await refresh.execute(second.refreshToken);
    expect(new Set([tokens.refreshToken, second.refreshToken, third.refreshToken]).size).toBe(3);
    expect(await stored(tokens.sessionId)).toMatchObject({ rotationCount: 2, revokedAt: null });
  });

  it('five concurrent refreshes with one token: one wins, the rest see reuse, the session is revoked', async () => {
    const { tokens } = await startSession();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => refresh.execute(tokens.refreshToken)),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(rejected).toHaveLength(4);
    // Some losers fail the hash comparison, some lose the CAS; all are classified as reuse (or, once the
    // session is already revoked by a sibling, as an invalid token). None may succeed.
    for (const outcome of rejected) {
      expect(['REFRESH_TOKEN_REUSED', 'REFRESH_TOKEN_INVALID']).toContain(
        (outcome.reason as { code: string }).code,
      );
    }
    expect(await stored(tokens.sessionId)).toMatchObject({ revokeReason: 'token_reuse' });
  });

  it('stolen-token replay revokes the session for both parties', async () => {
    const { tokens } = await startSession();
    const victimNext = await refresh.execute(tokens.refreshToken);

    await expect(refresh.execute(tokens.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED',
    });
    expect(await stored(tokens.sessionId)).toMatchObject({ revokeReason: 'token_reuse' });
    await expect(refresh.execute(victimNext.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
  });

  it('KNOWN LIMITATION: retrying an already-rotated token after a lost response logs the user out', async () => {
    const { tokens } = await startSession();
    await refresh.execute(tokens.refreshToken); // server rotated; pretend the response never arrived

    await expect(refresh.execute(tokens.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED',
    });
    expect((await stored(tokens.sessionId)).revokedAt).not.toBeNull();
  });

  it('a revoked session (e.g. after a password reset) cannot refresh, and that is not reported as reuse', async () => {
    const { user, tokens } = await startSession();
    await sessions.revokeAllForUser(user.id, 'password_change');
    await expect(refresh.execute(tokens.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
    expect((await stored(tokens.sessionId)).revokeReason).toBe('password_change');
  });
});
