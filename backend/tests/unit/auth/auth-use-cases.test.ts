import { beforeEach, describe, expect, it } from 'vitest';
import { SessionIssuer } from '../../../src/modules/auth/application/session-issuer.js';
import { AuthenticateAccessTokenUseCase } from '../../../src/modules/auth/application/use-cases/authenticate-access-token.js';
import { ChangePasswordUseCase } from '../../../src/modules/auth/application/use-cases/change-password.js';
import { LoginUseCase } from '../../../src/modules/auth/application/use-cases/login.js';
import { RefreshSessionUseCase } from '../../../src/modules/auth/application/use-cases/refresh-session.js';
import { RegisterUseCase } from '../../../src/modules/auth/application/use-cases/register.js';
import { SessionsUseCases } from '../../../src/modules/auth/application/use-cases/sessions.js';
import { parseRefreshToken } from '../../../src/modules/auth/domain/session.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import {
  FakeAccessTokenService,
  fakeAccounts,
  FakeKeyedHasher,
  FakePasswordHasher,
  FakeUnitOfWork,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from '../../helpers/fakes.js';

const PASSWORD = 'the right password';
const meta = { ip: '127.0.0.1', userAgent: 'vitest' };

let users: InMemoryUserRepository;
let sessions: InMemorySessionRepository;
let deps: ReturnType<typeof build>;

function build() {
  const tokens = new FakeAccessTokenService();
  const keyedHasher = new FakeKeyedHasher();
  const passwordHasher = new FakePasswordHasher();
  const accounts = fakeAccounts(users);
  const clock = () => new Date();
  const issuer = new SessionIssuer({ sessions, tokens, keyedHasher, refreshTokenTtlDays: 30, clock });
  return {
    login: new LoginUseCase({
      accounts,
      passwordHasher,
      issuer,
      dummyPasswordHash: () => Promise.resolve('hashed:dummy'),
    }),
    refresh: new RefreshSessionUseCase({
      sessions,
      tokens,
      accounts,
      keyedHasher,
      refreshTokenTtlDays: 30,
      clock,
    }),
    authenticate: new AuthenticateAccessTokenUseCase({ tokens, sessions, accounts, clock }),
    sessionsUseCases: new SessionsUseCases({ sessions }),
    changePassword: new ChangePasswordUseCase({
      accounts,
      sessions,
      passwordHasher,
      uow: new FakeUnitOfWork(),
    }),
    register: (enabled: boolean) =>
      new RegisterUseCase({
        accounts,
        passwordHasher,
        issuer,
        uow: new FakeUnitOfWork(),
        publicRegistrationEnabled: enabled,
      }),
  };
}

beforeEach(() => {
  users = new InMemoryUserRepository();
  sessions = new InMemorySessionRepository();
  deps = build();
  users.add({ email: 'alice@example.org', passwordHash: `hashed:${PASSWORD}` });
});

describe('login', () => {
  it('issues a session and tokens for valid credentials', async () => {
    const tokens = await deps.login.execute({ email: 'ALICE@example.org', password: PASSWORD }, meta);
    expect(sessions.sessions.size).toBe(1);
    expect(parseRefreshToken(tokens.refreshToken)?.sessionId).toBe(tokens.sessionId);
    // Only a keyed hash of the refresh secret is stored.
    const stored = sessions.sessions.get(tokens.sessionId)!;
    expect(stored.refreshTokenHash).toBe(`digest(${parseRefreshToken(tokens.refreshToken)!.secret})`);
    expect(stored.refreshTokenHash).not.toBe(tokens.refreshToken);
  });

  it('returns the same error for unknown e-mail and wrong password', async () => {
    await expect(
      deps.login.execute({ email: 'nobody@example.org', password: PASSWORD }, meta),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    await expect(
      deps.login.execute({ email: 'alice@example.org', password: 'nope' }, meta),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rejects disabled accounts', async () => {
    users.add({ email: 'off@example.org', passwordHash: `hashed:${PASSWORD}`, status: 'disabled' });
    await expect(
      deps.login.execute({ email: 'off@example.org', password: PASSWORD }, meta),
    ).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
  });
});

describe('refresh rotation', () => {
  it('rotates tokens and revokes the session when an old token is replayed', async () => {
    const first = await deps.login.execute({ email: 'alice@example.org', password: PASSWORD }, meta);
    const second = await deps.refresh.execute(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    await expect(deps.refresh.execute(first.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED',
    });
    expect(sessions.sessions.get(first.sessionId)!.revokeReason).toBe('token_reuse');
    // The legitimate (latest) token is now useless too.
    await expect(deps.refresh.execute(second.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
  });

  it('rejects malformed tokens without touching storage', async () => {
    await expect(deps.refresh.execute('garbage')).rejects.toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
  });

  it('refuses refresh for disabled accounts and revokes the session', async () => {
    const tokens = await deps.login.execute({ email: 'alice@example.org', password: PASSWORD }, meta);
    const alice = (await users.findByEmail('alice@example.org'))!;
    await users.changeStatus(alice.id, alice.version, 'disabled');
    await expect(deps.refresh.execute(tokens.refreshToken)).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
    expect(sessions.sessions.get(tokens.sessionId)!.revokeReason).toBe('account_disabled');
  });
});

describe('access token authentication', () => {
  it('fails closed once the session is revoked or the account is disabled', async () => {
    const tokens = await deps.login.execute({ email: 'alice@example.org', password: PASSWORD }, meta);
    const actor = await deps.authenticate.execute(tokens.accessToken);
    expect(actor.role).toBe('member');

    await deps.sessionsUseCases.logout(actor);
    await expect(deps.authenticate.execute(tokens.accessToken)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });

    const again = await deps.login.execute({ email: 'alice@example.org', password: PASSWORD }, meta);
    const alice = (await users.findByEmail('alice@example.org'))!;
    await users.changeStatus(alice.id, alice.version, 'disabled');
    await expect(deps.authenticate.execute(again.accessToken)).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
  });

  it('rejects tokens whose session belongs to another user', async () => {
    const tokens = await deps.login.execute({ email: 'alice@example.org', password: PASSWORD }, meta);
    const forged = `token:00000000-0000-4000-8000-000000000000:${tokens.sessionId}`;
    await expect(deps.authenticate.execute(forged)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });
});

describe('session management and password change', () => {
  it('only revokes sessions the caller owns', async () => {
    const alice = await deps.login.execute({ email: 'alice@example.org', password: PASSWORD }, meta);
    users.add({ email: 'bob@example.org', passwordHash: `hashed:${PASSWORD}` });
    const bob = await deps.login.execute({ email: 'bob@example.org', password: PASSWORD }, meta);
    const aliceActor = await deps.authenticate.execute(alice.accessToken);

    await expect(deps.sessionsUseCases.revoke(aliceActor, bob.sessionId)).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
    expect(sessions.sessions.get(bob.sessionId)!.revokedAt).toBeNull();
  });

  it('changes the password and revokes every other session', async () => {
    const current = await deps.login.execute({ email: 'alice@example.org', password: PASSWORD }, meta);
    const other = await deps.login.execute({ email: 'alice@example.org', password: PASSWORD }, meta);
    const actor = await deps.authenticate.execute(current.accessToken);

    await expect(
      deps.changePassword.execute(actor, {
        currentPassword: 'wrong one',
        newPassword: 'a brand new password',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    const result = await deps.changePassword.execute(actor, {
      currentPassword: PASSWORD,
      newPassword: 'a brand new password',
    });
    expect(result.revokedSessions).toBe(1);
    expect(sessions.sessions.get(other.sessionId)!.revokeReason).toBe('password_change');
    expect(sessions.sessions.get(current.sessionId)!.revokedAt).toBeNull();
  });
});

describe('registration policy', () => {
  it('is disabled unless explicitly enabled and always creates members', async () => {
    const input = { email: 'new@example.org', displayName: 'New', password: 'a long enough password' };
    await expect(deps.register(false).execute(input, meta)).rejects.toMatchObject({
      code: 'REGISTRATION_DISABLED',
    });

    const tokens = await deps.register(true).execute(input, meta);
    const actor = await deps.authenticate.execute(tokens.accessToken);
    expect(actor).toEqual(createActor({ userId: actor.userId, sessionId: tokens.sessionId, role: 'member' }));
  });
});
