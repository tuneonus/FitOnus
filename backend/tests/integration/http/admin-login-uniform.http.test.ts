import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, seedUser, type SeededUser, type TestContext } from '../../helpers/test-app.js';

const LOGIN_PATH = '/api/v1/admin/auth/login';

/** Response parts that must be identical across failures (request id is unique per request). */
function observable(res: request.Response) {
  const body = res.body as { error?: Record<string, unknown> };
  const { requestId, ...error } = body.error ?? {};
  expect(typeof requestId).toBe('string');
  return {
    status: res.status,
    body: { ...body, error },
    setCookie: res.headers['set-cookie'],
    contentType: res.headers['content-type'],
  };
}

describe('admin login (real router, container and PostgreSQL): uniform failures', () => {
  let ctx: TestContext;
  let admin: SeededUser;
  let disabledAdmin: SeededUser;
  let member: SeededUser;

  beforeAll(async () => {
    ctx = await createTestContext();
    admin = await seedUser(ctx.db.pool, { role: 'admin', displayName: 'Real Admin' });
    disabledAdmin = await seedUser(ctx.db.pool, { role: 'admin', status: 'disabled' });
    member = await seedUser(ctx.db.pool, { role: 'member' });
  });
  afterAll(() => ctx.close());

  const attempt = (email: string, password: string) =>
    request(ctx.app).post(LOGIN_PATH).send({ email, password });

  const countRows = async (sql: string, values: unknown[]) =>
    Number((await ctx.db.pool.query<{ n: string }>(sql, values)).rows[0]!.n);

  it('returns an identical 401 INVALID_CREDENTIALS for unknown, wrong-password, disabled and non-admin', async () => {
    const results = await Promise.all([
      attempt('nobody-here@example.test', 'some password value'),
      attempt(admin.email, 'wrong password value'),
      attempt(disabledAdmin.email, disabledAdmin.password), // correct password
      attempt(member.email, member.password), // correct password, wrong role
    ]);
    const views = results.map(observable);

    expect(views[0]).toMatchObject({
      status: 401,
      body: {
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      },
      setCookie: undefined,
    });
    for (const view of views) expect(view).toEqual(views[0]);
  });

  it('issues no session and writes no audit row for the disabled and non-admin accounts', async () => {
    await attempt(disabledAdmin.email, disabledAdmin.password);
    await attempt(member.email, member.password);

    for (const user of [disabledAdmin, member]) {
      expect(await countRows('SELECT count(*) AS n FROM auth_sessions WHERE user_id = $1', [user.id])).toBe(
        0,
      );
      expect(
        await countRows(
          'SELECT count(*) AS n FROM admin_audit_logs WHERE admin_id = $1 OR target_user_id = $1',
          [user.id],
        ),
      ).toBe(0);
    }
  });

  it('still signs a valid admin in (e-mail case/whitespace tolerated) and audits admin.login', async () => {
    const res = await attempt(`  ${admin.email.toUpperCase()} `, admin.password);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Signed in',
      data: {
        tokenType: 'Bearer',
        user: { id: admin.id, email: admin.email, displayName: 'Real Admin', role: 'admin' },
      },
    });
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toContain('fitonus_admin_token=');

    expect(
      await countRows(
        `SELECT count(*) AS n FROM admin_audit_logs WHERE admin_id = $1 AND action = 'admin.login'`,
        [admin.id],
      ),
    ).toBe(1);
    expect(await countRows('SELECT count(*) AS n FROM auth_sessions WHERE user_id = $1', [admin.id])).toBe(1);

    // The issued token really is an admin session.
    const me = await request(ctx.app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ id: admin.id, role: 'admin' });
  });

  it('records no audit row with a fabricated admin id for a failed attempt on a real admin', async () => {
    const before = await countRows('SELECT count(*) AS n FROM admin_audit_logs', []);
    await attempt(admin.email, 'definitely not the password');
    await attempt('ghost@example.test', 'definitely not the password');
    expect(await countRows('SELECT count(*) AS n FROM admin_audit_logs', [])).toBe(before);
  });
});

describe('admin login rate limiting (real container limiter)', () => {
  let ctx: TestContext;
  let admin: SeededUser;

  beforeAll(async () => {
    ctx = await createTestContext({ AUTH_RATE_LIMIT_MAX: '3' });
    admin = await seedUser(ctx.db.pool, { role: 'admin' });
  });
  afterAll(() => ctx.close());

  const attempt = (email: string, password: string) =>
    request(ctx.app).post(LOGIN_PATH).send({ email, password });

  it('limits an existing and an unknown e-mail with the very same 429 response', async () => {
    const outcomes: Record<string, { statuses: number[]; last: ReturnType<typeof observable> }> = {};
    for (const [label, email] of [
      ['existing', admin.email],
      ['unknown', 'ghost-admin@example.test'],
    ] as const) {
      const statuses: number[] = [];
      let last: request.Response | undefined;
      for (let i = 0; i < 5; i += 1) {
        last = await attempt(email, 'wrong password value');
        statuses.push(last.status);
      }
      outcomes[label] = { statuses, last: observable(last!) };
    }

    expect(outcomes.existing!.statuses).toEqual([401, 401, 401, 429, 429]);
    expect(outcomes.unknown!.statuses).toEqual(outcomes.existing!.statuses);
    expect(outcomes.unknown!.last).toEqual(outcomes.existing!.last);
    expect(outcomes.existing!.last.body.error).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
