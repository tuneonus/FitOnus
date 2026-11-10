import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
      .send({ token: 'sample-token', newPassword: 'short' });
    expect(badReset.status).toBe(400);
    expect(badReset.body.error.code).toBe('VALIDATION_FAILED');

    // Valid reset request returns 503 with truthful service unavailable error
    const goodReset = await api()
      .post('/api/v1/auth/reset-password')
      .send({ token: 'sample-token', newPassword: 'sufficiently-long-password-123' });
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
