import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { PgUnitOfWork } from '../../../src/database/transaction.js';
import { createAuthenticate } from '../../../src/middleware/authenticate.js';
import { createAuthModule } from '../../../src/modules/auth/index.js';
import { createUserAccountsApi } from '../../../src/modules/users/application/accounts.js';
import { PgUserRepository } from '../../../src/modules/users/infrastructure/pg-user-repository.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import { Argon2PasswordHasher } from '../../../src/shared/security/argon2-password-hasher.js';
import { HmacKeyedHasher } from '../../../src/shared/security/hmac-keyed-hasher.js';
import { flush, RecordingNotifier } from '../../unit/auth/support/password-reset-fakes.js';
import { ensurePasswordResetSchema } from '../../unit/auth/support/password-reset-schema.js';
import { createTestContext, login, seedUser, type TestContext } from '../../helpers/test-app.js';

describe('auth API', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext({ AUTH_PUBLIC_REGISTRATION: 'true' });
  });
  afterAll(() => ctx.close());

  const api = () => request(ctx.app);

  it('registers a member, returns no-store tokens, and the access token works', async () => {
    const response = await api().post('/api/v1/auth/register').send({
      email: 'New.Person@Example.org',
      displayName: 'New Person',
      password: 'a sufficiently long password',
    });
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      success: true,
      message: 'Registered',
      data: { tokenType: 'Bearer' },
    });

    const me = await api()
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${response.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ email: 'new.person@example.org', role: 'member' });
    expect(JSON.stringify(me.body)).not.toMatch(/password/i);
  });

  it('rejects duplicate registration and weak passwords', async () => {
    const duplicate = await api().post('/api/v1/auth/register').send({
      email: 'new.person@example.org',
      displayName: 'Again',
      password: 'a sufficiently long password',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_ALREADY_EXISTS');

    const weak = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'w@example.org', displayName: 'W', password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('uses one generic error for unknown users and wrong passwords', async () => {
    const user = await seedUser(ctx.db.pool);
    const wrong = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'wrong password!' });
    const unknown = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@example.org', password: 'whatever pw' });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('rotates refresh tokens and revokes the session on replay', async () => {
    const user = await seedUser(ctx.db.pool);
    const first = await login(ctx.app, user);

    const rotated = await api().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.refreshToken).not.toBe(first.refreshToken);

    const replay = await api().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // The whole session is gone: the newer refresh token and the access token are dead too.
    const afterReplay = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.body.data.refreshToken });
    expect(afterReplay.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    const access = await api().get('/api/v1/users/me').set(first.auth);
    expect(access.body.error.code).toBe('SESSION_REVOKED');
  });

  it('only one of two concurrent refreshes with the same token succeeds', async () => {
    const user = await seedUser(ctx.db.pool);
    const session = await login(ctx.app, user);
    const results = await Promise.all([
      api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }),
      api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }),
    ]);
    expect(results.filter((response) => response.status === 200).length).toBeLessThanOrEqual(1);
    expect(results.some((response) => response.body.error?.code === 'REFRESH_TOKEN_REUSED')).toBe(true);
  });

  it('logout revokes the current session immediately; logout-all revokes every session', async () => {
    const user = await seedUser(ctx.db.pool);
    const a = await login(ctx.app, user);
    const b = await login(ctx.app, user);
    const c = await login(ctx.app, user);

    const sessions = await api().get('/api/v1/auth/sessions').set(a.auth);
    expect(sessions.body.data).toHaveLength(3);
    expect(sessions.body.data.filter((session: { current: boolean }) => session.current)).toHaveLength(1);

    expect((await api().post('/api/v1/auth/logout').set(a.auth)).body.data).toEqual({ revokedSessions: 1 });
    expect((await api().get('/api/v1/users/me').set(a.auth)).status).toBe(401);
    expect((await api().get('/api/v1/users/me').set(b.auth)).status).toBe(200);

    expect((await api().post('/api/v1/auth/logout-all').set(b.auth)).body.data).toEqual({
      revokedSessions: 2,
    });
    expect((await api().get('/api/v1/users/me').set(c.auth)).body.error.code).toBe('SESSION_REVOKED');
  });

  it('cannot revoke another user’s session', async () => {
    const alice = await login(ctx.app, await seedUser(ctx.db.pool));
    const bob = await login(ctx.app, await seedUser(ctx.db.pool));
    const bobSessions = await api().get('/api/v1/auth/sessions').set(bob.auth);
    const bobSessionId = bobSessions.body.data[0].id as string;

    const attempt = await api().delete(`/api/v1/auth/sessions/${bobSessionId}`).set(alice.auth);
    expect(attempt.status).toBe(404);
    expect((await api().get('/api/v1/users/me').set(bob.auth)).status).toBe(200);
  });

  it('changing the password revokes other sessions and requires the current password', async () => {
    const user = await seedUser(ctx.db.pool);
    const current = await login(ctx.app, user);
    const other = await login(ctx.app, user);

    const wrong = await api()
      .post('/api/v1/auth/change-password')
      .set(current.auth)
      .send({ currentPassword: 'not it at all', newPassword: 'a completely new password' });
    expect(wrong.status).toBe(422);

    const changed = await api()
      .post('/api/v1/auth/change-password')
      .set(current.auth)
      .send({ currentPassword: user.password, newPassword: 'a completely new password' });
    expect(changed.body.data).toEqual({ revokedSessions: 1 });
    expect((await api().get('/api/v1/users/me').set(other.auth)).status).toBe(401);
    expect((await api().get('/api/v1/users/me').set(current.auth)).status).toBe(200);
    await expect(
      login(ctx.app, { email: user.email, password: 'a completely new password' }),
    ).resolves.toBeDefined();
  });

  it('rejects missing, malformed and tampered access tokens', async () => {
    expect((await api().get('/api/v1/users/me')).body.error.code).toBe('UNAUTHENTICATED');
    expect((await api().get('/api/v1/users/me').set('Authorization', 'Basic abc')).body.error.code).toBe(
      'UNAUTHENTICATED',
    );
    const session = await login(ctx.app, await seedUser(ctx.db.pool));
    const tampered = `${session.accessToken.slice(0, -2)}xx`;
    const response = await api().get('/api/v1/users/me').set('Authorization', `Bearer ${tampered}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });

  it('denies a disabled account immediately, even with a still-valid access token', async () => {
    const user = await seedUser(ctx.db.pool);
    const session = await login(ctx.app, user);
    await ctx.db.pool.query(`UPDATE users SET status = 'disabled', disabled_at = now() WHERE id = $1`, [
      user.id,
    ]);
    const response = await api().get('/api/v1/users/me').set(session.auth);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('validates and safely handles password reset endpoints without fake delivery', async () => {
    // Malformed email fails validation
    const badForgot = await api().post('/api/v1/auth/forgot-password').send({ email: 'not-an-email' });
    expect(badForgot.status).toBe(400);
    expect(badForgot.body.error.code).toBe('VALIDATION_FAILED');

    // Valid email returns 503 with truthful service unavailable error
    const goodForgot = await api().post('/api/v1/auth/forgot-password').send({ email: 'valid@example.org' });
    expect(goodForgot.status).toBe(503);
    expect(goodForgot.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(goodForgot.body.error.message).toMatch(/not configured/i);

    // Malformed reset request (short password) fails validation
    const badReset = await api()
      .post('/api/v1/auth/reset-password')
      .send({ email: 'valid@example.org', otp: '123456', newPassword: 'short' });
    expect(badReset.status).toBe(400);
    expect(badReset.body.error.code).toBe('VALIDATION_FAILED');

    // Valid reset request returns 503 with truthful service unavailable error
    const goodReset = await api()
      .post('/api/v1/auth/reset-password')
      .send({ email: 'valid@example.org', otp: '123456', newPassword: 'sufficiently-long-password-123' });
    expect(goodReset.status).toBe(503);
    expect(goodReset.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(goodReset.body.error.message).toMatch(/unavailable/i);
  });
});

describe('auth API defaults', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext({ AUTH_RATE_LIMIT_MAX: '3' });
  });
  afterAll(() => ctx.close());

  it('keeps self-registration disabled by default', async () => {
    const response = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ email: 'x@example.org', displayName: 'X', password: 'a sufficiently long password' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('REGISTRATION_DISABLED');
  });

  it('rate limits repeated login attempts for the same account', async () => {
    const attempt = () =>
      request(ctx.app)
        .post('/api/v1/auth/login')
        .send({ email: 'target@example.org', password: 'guess guess' });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) statuses.push((await attempt()).status);
    expect(statuses).toEqual([401, 401, 401, 429]);
    const limited = await attempt();
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['ratelimit-policy']).toBeDefined();
  });
});

/**
 * The real flow end to end against PostgreSQL (migrations 0016 + 0017), with an in-memory notifier that
 * records the OTP the Resend adapter would have e-mailed.
 */
describe('password reset OTP flow over HTTP (test notifier, real PostgreSQL)', () => {
  let ctx: TestContext;
  let app: Express;
  let notifier: RecordingNotifier;

  beforeAll(async () => {
    ctx = await createTestContext();
    await ensurePasswordResetSchema(ctx.db.pool);
    notifier = new RecordingNotifier();

    const database = ctx.container.database;
    const auth = createAuthModule({
      basePath: '/api/v1/auth',
      db: database,
      uow: new PgUnitOfWork(database),
      passwordHasher: new Argon2PasswordHasher(),
      keyedHasher: new HmacKeyedHasher(ctx.config.security.hmacSecret),
      accounts: createUserAccountsApi(new PgUserRepository(database)),
      config: ctx.config.auth,
      limiters: ctx.container.rateLimiters,
      passwordReset: { notifier, minResponseMs: 0 },
    });
    app = createApp({
      config: ctx.config,
      logger: createLogger({ level: 'silent', pretty: false }),
      container: {
        ...ctx.container,
        routeGroups: ctx.container.routeGroups.map((group) =>
          group.basePath === '/api/v1/auth' ? auth.routes : group,
        ),
        authenticate: createAuthenticate(auth.authenticateAccessToken),
      },
    });
  });
  afterAll(() => ctx.close());

  const api = () => request(app);
  const NEW_PASSWORD = 'a completely new passphrase';
  const forgot = (email: string) => api().post('/api/v1/auth/forgot-password').send({ email });
  const reset = (email: string, otp: string, newPassword = NEW_PASSWORD) =>
    api().post('/api/v1/auth/reset-password').send({ email, otp, newPassword });
  const wrongOtp = (otp: string) => (otp === '000000' ? '000001' : '000000');
  const withoutRequestId = (response: request.Response) => {
    const body = response.body as { error?: { requestId?: string } };
    if (body.error) delete body.error.requestId;
    return { status: response.status, body };
  };
  /** Requests a reset and returns the OTP the notifier "e-mailed". */
  const issueOtp = async (email: string): Promise<string> => {
    const before = notifier.sent.length;
    expect((await forgot(email)).status).toBe(200);
    await flush();
    expect(notifier.sent.length).toBe(before + 1);
    return notifier.last.otp;
  };

  it('resets the password, revokes every session, and does not sign the caller in', async () => {
    const user = await seedUser(ctx.db.pool);
    const first = await login(app, user);
    const second = await login(app, user);
    const otp = await issueOtp(user.email);

    const done = await reset(user.email, otp);
    expect(done.status).toBe(200);
    expect(done.headers['cache-control']).toBe('no-store');
    expect(done.body.data).toEqual({ message: expect.any(String) }); // no tokens, no session

    for (const session of [first, second]) {
      const me = await api().get('/api/v1/users/me').set(session.auth);
      expect(me.status).toBe(401);
      expect(me.body.error.code).toBe('SESSION_REVOKED');
      const refreshed = await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken });
      expect(refreshed.status).toBe(401);
      expect(refreshed.body.error.code).toBe('REFRESH_TOKEN_INVALID'); // revoked, not "reuse"
    }

    const oldPassword = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password });
    expect(oldPassword.status).toBe(401);
    await expect(login(app, { email: user.email, password: NEW_PASSWORD })).resolves.toBeDefined();
  });

  it('a used OTP stops working and answers exactly like a wrong one', async () => {
    const user = await seedUser(ctx.db.pool);
    const otp = await issueOtp(user.email);
    expect((await reset(user.email, otp)).status).toBe(200);

    const replay = withoutRequestId(await reset(user.email, otp, 'yet another long passphrase'));
    const unknown = withoutRequestId(await reset(user.email, wrongOtp(otp), 'yet another long passphrase'));
    expect(replay.status).toBe(400);
    expect(replay.body).toMatchObject({ success: false, error: { code: 'BAD_REQUEST' } });
    expect(replay).toEqual(unknown);
    // The replay did not change the password.
    await expect(login(app, { email: user.email, password: NEW_PASSWORD })).resolves.toBeDefined();
  });

  it('only one of two concurrent submissions of the same OTP succeeds', async () => {
    const user = await seedUser(ctx.db.pool);
    const otp = await issueOtp(user.email);

    const responses = await Promise.all([
      reset(user.email, otp, 'first concurrent passphrase'),
      reset(user.email, otp, 'second concurrent passphrase'),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);

    const winner =
      responses[0]!.status === 200 ? 'first concurrent passphrase' : 'second concurrent passphrase';
    await expect(login(app, { email: user.email, password: winner })).resolves.toBeDefined();
  });

  it('answers forgot-password identically for existing, admin, disabled and unknown accounts', async () => {
    const member = await seedUser(ctx.db.pool);
    const admin = await seedUser(ctx.db.pool, { role: 'admin' });
    const disabled = await seedUser(ctx.db.pool, { status: 'disabled' });
    const before = notifier.sent.length;

    const responses = [];
    for (const email of [member.email, admin.email, disabled.email, 'ghost@example.test']) {
      responses.push(withoutRequestId(await forgot(email)));
    }
    await flush();

    expect(responses[0]!.status).toBe(200);
    expect(new Set(responses.map((response) => JSON.stringify(response))).size).toBe(1);
    expect(
      notifier.sent
        .slice(before)
        .map((message) => message.email)
        .sort(),
    ).toEqual([member.email, admin.email].sort());
    const disabledTokens = await ctx.db.pool.query('SELECT 1 FROM password_reset_tokens WHERE user_id = $1', [
      disabled.id,
    ]);
    expect(disabledTokens.rowCount).toBe(0);
  });

  it('never stores the raw OTP and never echoes it back', async () => {
    const user = await seedUser(ctx.db.pool);
    const otp = await issueOtp(user.email);

    const rows = await ctx.db.pool.query('SELECT * FROM password_reset_tokens WHERE user_id = $1', [user.id]);
    expect(JSON.stringify(rows.rows)).not.toContain(otp);
    const response = await forgot(user.email);
    expect(JSON.stringify(response.body)).not.toContain(otp);
    expect(JSON.stringify(response.headers)).not.toContain(otp);
  });

  it('rejects a weak new password without consuming the OTP or an attempt', async () => {
    const user = await seedUser(ctx.db.pool);
    const otp = await issueOtp(user.email);

    const weak = await reset(user.email, otp, ' '.repeat(14));
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('PASSWORD_POLICY_VIOLATION');
    expect((await reset(user.email, otp, 'short')).body.error.code).toBe('VALIDATION_FAILED');
    expect((await reset(user.email, otp)).status).toBe(200);
  });

  it('applies the 60 second resend cooldown silently and keeps the first OTP usable', async () => {
    const user = await seedUser(ctx.db.pool);
    const before = notifier.sent.length;
    const statuses = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await forgot(user.email)).status);
    await flush();

    expect(statuses).toEqual([200, 200, 200, 200, 200, 200]);
    expect(notifier.sent.length - before).toBe(1); // the other five fall inside the cooldown
    expect((await reset(user.email, notifier.last.otp)).status).toBe(200);
  });

  it('hides delivery failures behind the same 200', async () => {
    const user = await seedUser(ctx.db.pool);
    notifier.mode = 'reject';
    try {
      const failing = withoutRequestId(await forgot(user.email));
      const unknown = withoutRequestId(await forgot('ghost2@example.test'));
      await flush();
      expect(failing.status).toBe(200);
      expect(failing).toEqual(unknown);
    } finally {
      notifier.mode = 'ok';
    }
  });

  it('locks the OTP after 5 wrong attempts; the correct one then fails too and a new request recovers', async () => {
    const user = await seedUser(ctx.db.pool);
    const otp = await issueOtp(user.email);
    for (let i = 0; i < 5; i += 1) {
      expect((await reset(user.email, wrongOtp(otp))).status).toBe(400);
    }
    expect((await reset(user.email, otp)).status).toBe(400); // locked
    const { rows } = await ctx.db.pool.query<{ failed_attempts: number }>(
      'SELECT failed_attempts FROM password_reset_tokens WHERE user_id = $1',
      [user.id],
    );
    expect(rows.map((row) => row.failed_attempts)).toEqual([5]);
    await expect(login(app, { email: user.email, password: user.password })).resolves.toBeDefined();
  });

  it('rejects malformed OTPs with a validation error and gives an unknown e-mail the generic 400', async () => {
    const user = await seedUser(ctx.db.pool);
    for (const bad of ['12345', '1234567', 'abcdef', '12 456']) {
      const response = await reset(user.email, bad);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
    const unknown = withoutRequestId(await reset('ghost3@example.test', '123456'));
    expect(unknown).toMatchObject({ status: 400, body: { error: { code: 'BAD_REQUEST' } } });
  });

  it('keeps validating input: malformed e-mail is a 400 for everyone', async () => {
    const response = await forgot('not-an-email');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });
});
