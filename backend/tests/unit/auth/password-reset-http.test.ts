import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  flush,
  InMemoryPasswordResetTokenRepository,
  RecordingNotifier,
} from './support/password-reset-fakes.js';
import { buildAuthHttpApp } from './support/password-reset-harness.js';

/** Response body minus the per-request correlation id. */
const comparable = (response: request.Response) => {
  const body = response.body as { error?: { requestId?: string } };
  if (body.error) delete body.error.requestId;
  return { status: response.status, body, cacheControl: response.headers['cache-control'] };
};

describe('password reset endpoints without a configured notifier', () => {
  it('answers a uniform 503 for every e-mail and touches neither the database nor the accounts', async () => {
    const { app, users, dbQueries, accountLookups } = buildAuthHttpApp();
    users.add({ email: 'alice@example.org' });
    users.add({ email: 'root@example.org', role: 'admin' });
    users.add({ email: 'off@example.org', status: 'disabled' });

    const responses = [];
    for (const email of ['alice@example.org', 'root@example.org', 'off@example.org', 'nobody@example.org']) {
      responses.push(comparable(await request(app).post('/api/v1/auth/forgot-password').send({ email })));
    }

    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    }
    expect(new Set(responses.map((response) => JSON.stringify(response))).size).toBe(1);
    expect((responses[0]!.body as { error: { message: string } }).error.message).toMatch(/not configured/i);

    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: 'alice@example.org', otp: '123456', newPassword: 'sufficiently-long-password-123' });
    expect(reset.status).toBe(503);
    expect(reset.body.error.code).toBe('SERVICE_UNAVAILABLE');

    expect(dbQueries).toEqual([]); // no code created, no lookup, nothing stored
    expect(accountLookups).toEqual([]);
  });

  it('still validates input first (400 does not depend on any account)', async () => {
    const { app } = buildAuthHttpApp();
    const bad = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'not-an-email' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    const extra = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'a@example.org', admin: true });
    expect(extra.status).toBe(400);
  });
});

describe('password reset endpoints with a notifier', () => {
  const setup = (options: { minResponseMs?: number } = {}) => {
    const notifier = new RecordingNotifier();
    const repository = new InMemoryPasswordResetTokenRepository();
    const harness = buildAuthHttpApp({
      passwordReset: { notifier, repository, minResponseMs: 0, ...options },
    });
    harness.users.add({ email: 'alice@example.org' });
    harness.users.add({ email: 'root@example.org', role: 'admin' });
    harness.users.add({ email: 'off@example.org', status: 'disabled' });
    return { ...harness, notifier, repository };
  };

  it('returns an identical 200 for existing, admin, disabled and unknown accounts', async () => {
    const { app, notifier, repository } = setup();

    const responses = [];
    for (const email of ['alice@example.org', 'root@example.org', 'off@example.org', 'nobody@example.org']) {
      responses.push(comparable(await request(app).post('/api/v1/auth/forgot-password').send({ email })));
    }
    await flush();

    expect(responses[0]!.status).toBe(200);
    expect(responses[0]!.body).toMatchObject({ success: true, data: { message: expect.any(String) } });
    expect(responses[0]!.cacheControl).toBe('no-store');
    expect(new Set(responses.map((response) => JSON.stringify(response))).size).toBe(1);

    // The same response hid different realities: only active accounts got a code and a message.
    expect(notifier.sent.map((message) => message.email).sort()).toEqual([
      'alice@example.org',
      'root@example.org',
    ]);
    expect(repository.rows.size).toBe(2);
  });

  it('keeps answering 200 when delivery fails or the throttle is hit', async () => {
    const { app, notifier } = setup();
    notifier.mode = 'reject';
    const failing = comparable(
      await request(app).post('/api/v1/auth/forgot-password').send({ email: 'alice@example.org' }),
    );
    notifier.mode = 'ok';
    const unknown = comparable(
      await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@example.org' }),
    );
    expect(failing).toEqual(unknown);

    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push(
        (await request(app).post('/api/v1/auth/forgot-password').send({ email: 'alice@example.org' })).status,
      );
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200]);
    await flush();
    expect(notifier.sent.length).toBeLessThanOrEqual(3); // default per-user budget, invisible to the caller
  });

  it('enforces the timing floor on every outcome', async () => {
    const { app } = setup({ minResponseMs: 80 });
    for (const email of ['alice@example.org', 'nobody@example.org', 'off@example.org', 'root@example.org']) {
      const started = performance.now();
      const response = await request(app).post('/api/v1/auth/forgot-password').send({ email });
      expect(response.status).toBe(200);
      expect(performance.now() - started).toBeGreaterThanOrEqual(75);
    }
  });

  it('answers a generic 400 for every unusable e-mail/OTP combination and never reveals why', async () => {
    const { app, notifier } = setup();
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'alice@example.org' });
    await flush();
    const realOtp = notifier.last.otp;
    const wrong = realOtp === '000000' ? '000001' : '000000';
    // A weak-but-valid-looking password is a policy error, not a code error, and does not use up an attempt.
    const weak = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: 'alice@example.org', otp: realOtp, newPassword: ' '.repeat(14) });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('PASSWORD_POLICY_VIOLATION');

    const responses = [];
    for (const [email, otp] of [
      ['alice@example.org', wrong],
      ['nobody@example.org', realOtp],
      ['off@example.org', realOtp],
    ] as const) {
      responses.push(
        comparable(
          await request(app)
            .post('/api/v1/auth/reset-password')
            .send({ email, otp, newPassword: 'sufficiently-long-password-123' }),
        ),
      );
    }
    expect(responses[0]!.status).toBe(400);
    expect(responses[0]!.body).toMatchObject({ success: false, error: { code: 'BAD_REQUEST' } });
    expect(new Set(responses.map((response) => JSON.stringify(response))).size).toBe(1);

    for (const bad of [{ otp: 'garbage' }, { otp: '12345' }, { newPassword: 'short' }, { email: 'nope' }]) {
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          email: 'alice@example.org',
          otp: '123456',
          newPassword: 'sufficiently-long-password-123',
          ...bad,
        });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
    const legacy = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'x'.repeat(43), newPassword: 'sufficiently-long-password-123' });
    expect(legacy.status).toBe(400); // the old body shape is rejected (strict schema)
  });
});

describe('createAuthModule configuration', () => {
  it('fails fast on nonsensical password reset settings', () => {
    const notifier = new RecordingNotifier();
    expect(() => buildAuthHttpApp({ passwordReset: { notifier, tokenTtlMinutes: 0 } })).toThrow(
      /Invalid password reset settings/,
    );
    expect(() => buildAuthHttpApp({ passwordReset: { notifier, maxRequestsPerWindow: -1 } })).toThrow(
      /Invalid password reset settings/,
    );
  });
});
