import { beforeEach, describe, expect, it } from 'vitest';
import { SessionIssuer } from '../../../src/modules/auth/application/session-issuer.js';
import { LoginUseCase } from '../../../src/modules/auth/application/use-cases/login.js';
import { RefreshSessionUseCase } from '../../../src/modules/auth/application/use-cases/refresh-session.js';
import { SessionsUseCases } from '../../../src/modules/auth/application/use-cases/sessions.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import {
  FakeAccessTokenService,
  fakeAccounts,
  FakeKeyedHasher,
  FakePasswordHasher,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from '../../helpers/fakes.js';
import { MutableClock } from './support/password-reset-fakes.js';

/**
 * Refresh-token rotation + reuse detection. These tests PIN the current contract so that any future
 * "grace window" / idempotent-retry change is a deliberate, reviewed decision (see report section on
 * the refresh retry review). Behaviour that looks harsh for flaky networks is asserted on purpose.
 */
const PASSWORD = 'the right password';
const meta = { ip: '127.0.0.1', userAgent: 'vitest' };

let users: InMemoryUserRepository;
let sessions: InMemorySessionRepository;
let clock: MutableClock;
let login: LoginUseCase;
let refresh: RefreshSessionUseCase;

beforeEach(() => {
  users = new InMemoryUserRepository();
  sessions = new InMemorySessionRepository();
  clock = new MutableClock();
  const tokens = new FakeAccessTokenService();
  const keyedHasher = new FakeKeyedHasher();
  const accounts = fakeAccounts(users);
  const issuer = new SessionIssuer({
    sessions,
    tokens,
    keyedHasher,
    refreshTokenTtlDays: 30,
    clock: clock.now,
  });
  login = new LoginUseCase({
    accounts,
    passwordHasher: new FakePasswordHasher(),
    issuer,
    dummyPasswordHash: () => Promise.resolve('hashed:dummy'),
  });
  refresh = new RefreshSessionUseCase({
    sessions,
    tokens,
    accounts,
    keyedHasher,
    refreshTokenTtlDays: 30,
    clock: clock.now,
  });
  users.add({ email: 'alice@example.org', passwordHash: `hashed:${PASSWORD}` });
});

const signIn = () => login.execute({ email: 'alice@example.org', password: PASSWORD }, meta);

describe('rotation', () => {
  it('hands out a fresh single-use token on every refresh and counts rotations', async () => {
    const first = await signIn();
    const second = await refresh.execute(first.refreshToken);
    const third = await refresh.execute(second.refreshToken);

    expect(new Set([first.refreshToken, second.refreshToken, third.refreshToken]).size).toBe(3);
    expect(second.sessionId).toBe(first.sessionId); // one session, rotating secret
    expect(sessions.sessions.get(first.sessionId)).toMatchObject({ rotationCount: 2, revokedAt: null });
  });

  it('rejects expired and revoked sessions as invalid (not as reuse)', async () => {
    const expired = await signIn();
    clock.advance(31 * 86_400_000);
    await expect(refresh.execute(expired.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });

    clock.advance(-31 * 86_400_000);
    const revoked = await signIn();
    await sessions.revoke(revoked.sessionId, 'logout');
    await expect(refresh.execute(revoked.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
    expect(sessions.sessions.get(revoked.sessionId)!.revokeReason).toBe('logout');
  });

  it('never accepts another session’s secret', async () => {
    const mine = await signIn();
    const other = await signIn();
    const forged = `${mine.sessionId}.${other.refreshToken.split('.')[1]}`;
    await expect(refresh.execute(forged)).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
    expect(sessions.sessions.get(mine.sessionId)!.revokeReason).toBe('token_reuse');
    expect(sessions.sessions.get(other.sessionId)!.revokedAt).toBeNull();
  });
});

describe('reuse detection (stolen token)', () => {
  it('thief replays the old token after the victim rotated: session revoked, both sides logged out', async () => {
    const stolen = await signIn();
    const victimNext = await refresh.execute(stolen.refreshToken); // victim rotates first

    await expect(refresh.execute(stolen.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED',
    });
    expect(sessions.sessions.get(stolen.sessionId)).toMatchObject({ revokeReason: 'token_reuse' });
    await expect(refresh.execute(victimNext.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
  });

  it('thief rotates first: the victim’s now-stale token revokes the session and the thief’s token dies', async () => {
    const original = await signIn();
    const thiefNext = await refresh.execute(original.refreshToken); // thief wins the race

    await expect(refresh.execute(original.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED',
    });
    await expect(refresh.execute(thiefNext.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
  });

  it('only one of several concurrent refreshes with one token wins, and the session is then revoked', async () => {
    const tokens = await signIn();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => refresh.execute(tokens.refreshToken)),
    );
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    for (const outcome of outcomes.filter((item) => item.status === 'rejected')) {
      expect(outcome.reason).toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
    }
    expect(sessions.sessions.get(tokens.sessionId)!.revokeReason).toBe('token_reuse');
  });
});

describe('KNOWN LIMITATION: a legitimate retry after a lost response is treated as reuse', () => {
  it('server rotated, client never received the new token, client retries the old one: logged out', async () => {
    const stored = await signIn(); // what the app has in secure storage

    // Request 1 reaches the server and rotates; the response is lost (timeout / app suspended / dropped).
    const lostResponse = await refresh.execute(stored.refreshToken);
    expect(lostResponse.refreshToken).not.toBe(stored.refreshToken);

    // The app still holds `stored` and retries. Server cannot tell this from a replayed stolen token.
    await expect(refresh.execute(stored.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED',
    });

    // ...so the session, including the token the client never saw, is gone.
    expect(sessions.sessions.get(stored.sessionId)).toMatchObject({ revokeReason: 'token_reuse' });
    await expect(refresh.execute(lostResponse.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
  });

  it('a retry does not strand the user once they sign in again (new session, old one stays dead)', async () => {
    const stored = await signIn();
    await refresh.execute(stored.refreshToken);
    await expect(refresh.execute(stored.refreshToken)).rejects.toBeDefined();

    const again = await signIn();
    expect(again.sessionId).not.toBe(stored.sessionId);
    await expect(refresh.execute(again.refreshToken)).resolves.toMatchObject({ sessionId: again.sessionId });
  });
});

describe('interaction with password reset and logout', () => {
  it('refresh tokens do not survive revoking every session', async () => {
    const tokens = await signIn();
    const actor = createActor({
      userId: users.users.keys().next().value!,
      sessionId: tokens.sessionId,
      role: 'member',
    });
    await new SessionsUseCases({ sessions }).logoutAll(actor);
    await expect(refresh.execute(tokens.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
  });
});
