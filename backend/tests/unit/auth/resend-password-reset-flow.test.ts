import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { PasswordResetFailureEvent } from '../../../src/modules/auth/application/ports.js';
import { RequestPasswordResetUseCase } from '../../../src/modules/auth/application/use-cases/request-password-reset.js';
import { ResetPasswordUseCase } from '../../../src/modules/auth/application/use-cases/reset-password.js';
import {
  isWellFormedOtp,
  resolvePasswordResetSettings,
} from '../../../src/modules/auth/domain/password-reset.js';
import { ResendPasswordResetNotifier } from '../../../src/modules/auth/infrastructure/resend-password-reset-notifier.js';
import { HmacKeyedHasher } from '../../../src/shared/security/hmac-keyed-hasher.js';
import {
  fakeAccounts,
  FakePasswordHasher,
  FakeUnitOfWork,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from '../../helpers/fakes.js';
import {
  flush,
  InMemoryPasswordResetTokenRepository,
  MINUTE,
  MutableClock,
} from './support/password-reset-fakes.js';
import { buildAuthHttpApp, HMAC_SECRET } from './support/password-reset-harness.js';

// Obviously fake: nothing here can authenticate against anything.
const API_KEY = 're_unit_test_not_a_real_key_0000';
const FROM = 'OnusFit <noreply@tuneonus.com>';
const OLD_PASSWORD = 'the old correct password';
const NEW_PASSWORD = 'a brand new passphrase';
const META = { ip: '203.0.113.7', userAgent: 'vitest' };

interface SentMail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

/** Records what would have gone to api.resend.com; the real notifier runs on top of it. */
function resendWithFakeFetch(status = 200, now?: () => Date) {
  const sent: SentMail[] = [];
  const fakeFetch = ((_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(init?.body as string) as SentMail);
    return Promise.resolve(new Response('{}', { status }));
  }) as unknown as typeof fetch;
  const notifier = new ResendPasswordResetNotifier({
    apiKey: API_KEY,
    from: FROM,
    timeoutMs: 1_000,
    fetch: fakeFetch,
    now,
  });
  return { sent, notifier };
}

const codeFrom = (mail: SentMail): string => {
  const code = mail.text.split('\n').find((line) => isWellFormedOtp(line));
  if (!code) throw new Error('no 6-digit OTP found in the e-mail text');
  return code;
};

/** The two real use cases wired to in-memory storage, with the real Resend notifier on top. */
function useCaseFlow() {
  const clock = new MutableClock(); // the use cases AND the notifier's wording must share one notion of "now"
  const { sent, notifier } = resendWithFakeFetch(200, clock.now);
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const tokens = new InMemoryPasswordResetTokenRepository();
  const keyedHasher = new HmacKeyedHasher(HMAC_SECRET);
  const accounts = fakeAccounts(users);
  const uow = new FakeUnitOfWork();
  const settings = resolvePasswordResetSettings({ minResponseMs: 0 });
  const alice = users.add({ email: 'alice@example.org', passwordHash: `hashed:${OLD_PASSWORD}` });

  const request_ = new RequestPasswordResetUseCase({
    accounts,
    tokens,
    keyedHasher,
    notifier,
    uow,
    clock: clock.now,
    settings,
  });
  const reset = new ResetPasswordUseCase({
    accounts,
    sessions,
    tokens,
    keyedHasher,
    passwordHasher: new FakePasswordHasher(),
    uow,
    clock: clock.now,
    settings,
  });
  const ask = async () => {
    await request_.execute({ email: 'alice@example.org' }, META);
    await flush();
  };
  return { sent, clock, alice, users, tokens, ask, reset };
}

describe('password reset code delivered through the Resend notifier (use cases)', () => {
  it('e-mails a 6-digit OTP that sets the new password exactly once', async () => {
    const { sent, alice, users, ask, reset } = useCaseFlow();
    await ask();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: FROM, to: ['alice@example.org'] });
    const code = codeFrom(sent[0]!);
    expect(sent[0]!.html).toContain(code); // same code in both parts
    expect(sent[0]!.text).toMatch(/expires in 5 minutes/); // the 5-minute lifetime

    expect(users.users.get(alice.id)!.passwordHash).toBe(`hashed:${OLD_PASSWORD}`); // asking changes nothing
    await reset.execute({ email: 'alice@example.org', otp: code, newPassword: NEW_PASSWORD });
    expect(users.users.get(alice.id)!.passwordHash).toBe(`hashed:${NEW_PASSWORD}`);

    await expect(
      reset.execute({ email: 'alice@example.org', otp: code, newPassword: 'yet another passphrase' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST', // single use
    });
  });

  it('keeps the 5-minute lifetime: valid just before expiry, dead at the boundary', async () => {
    const early = useCaseFlow();
    await early.ask();
    early.clock.advance(5 * MINUTE - 1);
    await early.reset.execute({
      email: 'alice@example.org',
      otp: codeFrom(early.sent[0]!),
      newPassword: NEW_PASSWORD,
    });

    const late = useCaseFlow();
    await late.ask();
    late.clock.advance(5 * MINUTE);
    await expect(
      late.reset.execute({
        email: 'alice@example.org',
        otp: codeFrom(late.sent[0]!),
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('only the newest code works after a second request', async () => {
    const { sent, ask, reset, clock } = useCaseFlow();
    await ask();
    clock.advance(61_000); // past the 60 second resend cooldown
    await ask();
    expect(sent).toHaveLength(2);
    const [first, second] = sent.map(codeFrom) as [string, string];
    expect(first).not.toBe(second);

    await expect(
      reset.execute({ email: 'alice@example.org', otp: first, newPassword: NEW_PASSWORD }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await reset.execute({ email: 'alice@example.org', otp: second, newPassword: NEW_PASSWORD });
  });

  it('stores only a digest: the e-mailed OTP is not recoverable from storage', async () => {
    const { sent, tokens, ask } = useCaseFlow();
    await ask();
    const code = codeFrom(sent[0]!);
    expect(JSON.stringify([...tokens.rows.values()])).not.toContain(code);
  });
});

describe('password reset endpoints with the Resend notifier (HTTP)', () => {
  function httpSetup(resendStatus = 200) {
    const { sent, notifier } = resendWithFakeFetch(resendStatus);
    const failures: PasswordResetFailureEvent[] = [];
    const harness = buildAuthHttpApp({
      passwordReset: {
        notifier,
        repository: new InMemoryPasswordResetTokenRepository(),
        minResponseMs: 0,
        onFailure: (event) => failures.push(event),
      },
    });
    harness.users.add({ email: 'alice@example.org', passwordHash: `hashed:${OLD_PASSWORD}` });
    harness.users.add({ email: 'off@example.org', status: 'disabled' });
    return { ...harness, sent, failures };
  }

  it('sends nothing for unknown or disabled accounts, with an identical response', async () => {
    const { app, sent } = httpSetup();
    const responses = [];
    for (const email of ['alice@example.org', 'nobody@example.org', 'off@example.org']) {
      const response = await request(app).post('/api/v1/auth/forgot-password').send({ email });
      responses.push({ status: response.status, body: response.body });
    }
    await flush();
    expect(sent.map((mail) => mail.to[0])).toEqual(['alice@example.org']);
    expect(responses[0]!.status).toBe(200);
    expect(new Set(responses.map((r) => JSON.stringify(r))).size).toBe(1);
  });

  it.each([401, 429, 500])(
    'a Resend %i is invisible to the caller but reported, secret-free, to the operator',
    async (resendStatus) => {
      const { app, sent, failures } = httpSetup(resendStatus);

      const failing = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'alice@example.org' });
      const unknown = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@example.org' });
      await flush();

      expect(failing.status).toBe(200);
      expect({ status: failing.status, body: failing.body }).toEqual({
        status: unknown.status,
        body: unknown.body,
      });

      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ stage: 'deliver' });
      expect(failures[0]!.errorName).toMatch(/^Resend(Auth|RateLimited|Server)Error$/);

      const observable = JSON.stringify(failures);
      for (const secret of [codeFrom(sent[0]!), 'alice@example.org', API_KEY]) {
        expect(observable).not.toContain(secret);
      }
    },
  );
});
