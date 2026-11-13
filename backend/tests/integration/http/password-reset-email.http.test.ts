import { Writable } from 'node:stream';
import { pino } from 'pino';
import request from 'supertest';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/app.js';
import { loadConfig } from '../../../src/config/env.js';
import { createContainer } from '../../../src/container.js';
import { REDACT_PATHS } from '../../../src/shared/logging/logger.js';
import { createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';
import { seedUser, TEST_ENV } from '../../helpers/test-app.js';

// Obviously fake key; global fetch is stubbed, so nothing ever leaves the process.
const API_KEY = 're_integration_test_not_a_real_key';
const FROM = 'OnusFit <noreply@tuneonus.com>';
const NEW_PASSWORD = 'a brand new passphrase';
const OTP = /^\d{6}$/;

interface Mail {
  to: string[];
  text: string;
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('password reset e-mail (container wiring + PostgreSQL)', () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  });
  afterAll(() => db.drop());
  afterEach(() => vi.unstubAllGlobals());

  const build = (env: Record<string, string>, fetchImpl: typeof fetch) => {
    vi.stubGlobal('fetch', fetchImpl);
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, sink);
    const config = loadConfig({ ...TEST_ENV, DATABASE_URL: db.url, ...env });
    const app = createApp({ config, logger, container: createContainer(config, db.pool, logger) });
    return { app, lines };
  };
  const resendEnv = {
    EMAIL_PROVIDER: 'resend',
    EMAIL_API_KEY: API_KEY,
    EMAIL_FROM: FROM,
    EMAIL_TIMEOUT_MS: '500',
  };
  const recorder = (status = 200) => {
    const sent: Mail[] = [];
    const fn = ((_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(init?.body as string) as Mail);
      return Promise.resolve(new Response('{}', { status }));
    }) as unknown as typeof fetch;
    return { sent, fn };
  };
  const codeOf = (mail: Mail) => mail.text.split('\n').find((line) => OTP.test(line))!;

  it('without EMAIL_PROVIDER the endpoints stay disabled (503) and nothing is sent or stored', async () => {
    const { sent, fn } = recorder();
    const { app } = build({}, fn);
    const user = await seedUser(db.pool);
    const response = await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });
    expect(response.status).toBe(503);
    expect(sent).toEqual([]);
    expect(
      (await db.pool.query('SELECT 1 FROM password_reset_tokens WHERE user_id = $1', [user.id])).rowCount,
    ).toBe(0);
  });

  it('e-mails a code, resets once, revokes sessions, and honours the 5-minute expiry', async () => {
    const { sent, fn } = recorder();
    const { app } = build(resendEnv, fn);
    const user = await seedUser(db.pool);
    const session = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password });
    expect(session.status).toBe(200);

    expect((await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email })).status).toBe(
      200,
    );
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual([user.email]);
    const code = codeOf(sent[0]!);
    expect(code).toMatch(/^\d{6}$/);
    expect(sent[0]!.text).toMatch(/expires in 5 minutes/);

    const { rows } = await db.pool.query<{ token_hash: string; minutes: number }>(
      `SELECT token_hash, extract(epoch FROM expires_at - created_at) / 60 AS minutes
         FROM password_reset_tokens WHERE user_id = $1`,
      [user.id],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.minutes)).toBe(5);
    expect(rows[0]!.token_hash).not.toContain(code); // digest only

    // The app trims pasted input; the API tolerates surrounding whitespace too.
    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: user.email, otp: ` ${code}\n`, newPassword: NEW_PASSWORD });
    expect(reset.status).toBe(200);
    expect(
      (await request(app).post('/api/v1/auth/login').send({ email: user.email, password: NEW_PASSWORD }))
        .status,
    ).toBe(200);
    expect(
      (await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password }))
        .status,
    ).toBe(401);
    expect(
      (await request(app).post('/api/v1/auth/refresh').send({ refreshToken: session.body.data.refreshToken }))
        .status,
    ).toBe(401); // sessions revoked
    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ email: user.email, otp: code, newPassword: NEW_PASSWORD })
      ).status,
    ).toBe(400);

    // Move the used row out of the 60 second resend cooldown, then ask again.
    await db.pool.query(
      `UPDATE password_reset_tokens SET created_at = created_at - interval '2 minutes',
              expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`,
      [user.id],
    );
    // Expired OTP (6 minutes old) is rejected with the same generic 400.
    await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });
    await flush();
    const expired = codeOf(sent[1]!);
    await db.pool.query(
      `UPDATE password_reset_tokens SET created_at = now() - interval '6 minutes',
              expires_at = now() - interval '1 minute' WHERE used_at IS NULL AND user_id = $1`,
      [user.id],
    );
    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ email: user.email, otp: expired, newPassword: NEW_PASSWORD })
      ).status,
    ).toBe(400);
  });

  it.each([
    ['Resend answers 500', 500],
    ['Resend hangs past the timeout', 0],
  ])('%s: same 200 for the caller, one secret-free error log line', async (_name, status) => {
    const hanging = ((_u: string, init?: RequestInit) =>
      new Promise((_res, rej) =>
        init?.signal?.addEventListener('abort', () => rej(init.signal?.reason as Error)),
      )) as unknown as typeof fetch;
    const { fn } = recorder(status);
    const { app, lines } = build(resendEnv, status === 0 ? hanging : fn);
    const user = await seedUser(db.pool);

    const started = performance.now();
    const real = await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });
    expect(performance.now() - started).toBeLessThan(400); // delivery never delays the response
    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.test' });
    expect({ s: real.status, b: real.body.data }).toEqual({ s: unknown.status, b: unknown.body.data });

    await new Promise((resolve) => setTimeout(resolve, 900)); // > EMAIL_TIMEOUT_MS
    const failure = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((l) => l.stage === 'deliver');
    expect(failure).toHaveLength(1);
    expect(failure[0]).toMatchObject({
      userId: user.id,
      errorName: status === 0 ? 'ResendTimeoutError' : 'ResendServerError',
    });
    const all = lines.join('');
    for (const secret of [API_KEY, user.email]) expect(all).not.toContain(secret);
    const { rows } = await db.pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM password_reset_tokens WHERE user_id = $1',
      [user.id],
    );
    expect(rows).toHaveLength(1); // stored; only the delivery failed
    expect(all).not.toContain(rows[0]!.token_hash);
  });
});
