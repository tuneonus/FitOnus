import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  login,
  seedUser,
  type LoggedIn,
  type TestContext,
} from '../../helpers/test-app.js';

describe('users API', () => {
  let ctx: TestContext;
  let admin: LoggedIn;
  let adminId: string;
  let member: LoggedIn;
  let memberId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const adminUser = await seedUser(ctx.db.pool, { role: 'admin', email: 'admin@example.org' });
    const memberUser = await seedUser(ctx.db.pool, { email: 'member@example.org' });
    adminId = adminUser.id;
    memberId = memberUser.id;
    admin = await login(ctx.app, adminUser);
    member = await login(ctx.app, memberUser);
  });
  afterAll(() => ctx.close());

  const api = () => request(ctx.app);
  const newUser = (email: string) => ({
    email,
    displayName: 'Created User',
    password: 'a sufficiently long password',
  });

  it('creates users only with users:create and returns the standard envelope', async () => {
    const forbidden = await api().post('/api/v1/users').set(member.auth).send(newUser('nope@example.org'));
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN', requestId: expect.any(String) },
    });

    const created = await api().post('/api/v1/users').set(admin.auth).send(newUser('Created@Example.org'));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      success: true,
      message: 'User created',
      data: { email: 'created@example.org', role: 'member', status: 'active', version: 1 },
    });
    expect(created.body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects unknown body fields and invalid input with field-level details', async () => {
    const response = await api()
      .post('/api/v1/users')
      .set(admin.auth)
      .send({ ...newUser('bad'), status: 'disabled' });
    expect(response.status).toBe(400);
    const paths = (response.body.error.details as { path: string }[]).map((detail) => detail.path);
    expect(paths).toEqual(expect.arrayContaining(['email', '']));
  });

  it('replays an idempotent create and never creates a duplicate', async () => {
    const body = newUser('idempotent@example.org');
    const headers = { ...admin.auth, 'Idempotency-Key': 'create-user-0001' };
    const results = await Promise.all(
      [1, 2, 3].map(() => api().post('/api/v1/users').set(headers).send(body)),
    );
    const created = results.filter((r) => r.status === 201 && r.headers['idempotent-replayed'] === undefined);
    expect(created).toHaveLength(1);
    for (const response of results.filter((r) => r !== created[0])) {
      expect([201, 409]).toContain(response.status);
      if (response.status === 409) expect(response.body.error.code).toBe('IDEMPOTENCY_REQUEST_IN_PROGRESS');
    }
    const retry = await api().post('/api/v1/users').set(headers).send(body);
    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.data.id).toBe(created[0]!.body.data.id);

    const conflict = await api().post('/api/v1/users').set(headers).send(newUser('different@example.org'));
    expect(conflict.status).toBe(422);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const { rows } = await ctx.db.pool.query(`SELECT 1 FROM users WHERE email = 'idempotent@example.org'`);
    expect(rows).toHaveLength(1);
  });

  it('requires users:assign-role to create admins and validates the idempotency header', async () => {
    const badKey = await api()
      .post('/api/v1/users')
      .set({ ...admin.auth, 'Idempotency-Key': 'short' })
      .send(newUser('k@example.org'));
    expect(badKey.status).toBe(400);

    const asAdmin = await api()
      .post('/api/v1/users')
      .set(admin.auth)
      .send({ ...newUser('second-admin@example.org'), role: 'admin' });
    expect(asAdmin.status).toBe(201);
    expect(asAdmin.body.data.role).toBe('admin');
  });

  it('lists with pagination, filters and search for users:read only', async () => {
    expect((await api().get('/api/v1/users').set(member.auth)).status).toBe(403);

    const page = await api().get('/api/v1/users?limit=2&page=1&sort=email&order=asc').set(admin.auth);
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta).toMatchObject({ page: 1, limit: 2, total: expect.any(Number) });
    expect(page.body.meta.totalPages).toBe(Math.ceil(page.body.meta.total / 2));

    const search = await api().get('/api/v1/users?search=member@').set(admin.auth);
    expect(search.body.data.map((user: { email: string }) => user.email)).toEqual(['member@example.org']);

    const invalid = await api().get('/api/v1/users?limit=1000&sort=password_hash').set(admin.auth);
    expect(invalid.status).toBe(400);
  });

  it('enforces ownership: members read and edit themselves only', async () => {
    expect((await api().get(`/api/v1/users/${memberId}`).set(member.auth)).status).toBe(200);
    expect((await api().get(`/api/v1/users/${adminId}`).set(member.auth)).status).toBe(403);
    expect((await api().get(`/api/v1/users/${memberId}`).set(admin.auth)).status).toBe(200);
    expect((await api().get('/api/v1/users/not-a-uuid').set(admin.auth)).status).toBe(400);
    expect(
      (await api().get('/api/v1/users/00000000-0000-4000-8000-000000000000').set(admin.auth)).body.error.code,
    ).toBe('USER_NOT_FOUND');

    const otherEdit = await api()
      .patch(`/api/v1/users/${adminId}`)
      .set(member.auth)
      .send({ displayName: 'Hacked', version: 1 });
    expect(otherEdit.status).toBe(403);
  });

  it('uses optimistic concurrency for profile updates', async () => {
    const me = await api().get('/api/v1/users/me').set(member.auth);
    const version = me.body.data.version as number;

    const first = await api()
      .patch('/api/v1/users/me')
      .set(member.auth)
      .send({ displayName: 'First Edit', version });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ displayName: 'First Edit', version: version + 1 });

    const stale = await api()
      .patch('/api/v1/users/me')
      .set(member.auth)
      .send({ displayName: 'Stale Edit', version });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: version + 1 },
    });
  });

  it('disables and re-enables accounts with permission, never one’s own', async () => {
    const target = await seedUser(ctx.db.pool);
    const targetSession = await login(ctx.app, target);

    expect((await api().post(`/api/v1/users/${target.id}/disable`).set(member.auth)).status).toBe(403);
    expect((await api().post(`/api/v1/users/${adminId}/disable`).set(admin.auth)).body.error.code).toBe(
      'CANNOT_CHANGE_OWN_STATUS',
    );

    const disabled = await api().post(`/api/v1/users/${target.id}/disable`).set(admin.auth);
    expect(disabled.body.data).toMatchObject({ status: 'disabled', disabledAt: expect.any(String) });
    expect((await api().get('/api/v1/users/me').set(targetSession.auth)).body.error.code).toBe(
      'ACCOUNT_DISABLED',
    );
    expect((await api().post(`/api/v1/users/${target.id}/disable`).set(admin.auth)).status).toBe(409);

    const enabled = await api().post(`/api/v1/users/${target.id}/enable`).set(admin.auth);
    expect(enabled.body.data).toMatchObject({ status: 'active', disabledAt: null });
    expect((await api().get('/api/v1/users/me').set(targetSession.auth)).status).toBe(200);
  });
});
