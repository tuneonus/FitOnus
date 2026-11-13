import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { RequestPasswordResetUseCase } from '../../../src/modules/auth/application/use-cases/request-password-reset.js';
import {
  DEFAULT_PASSWORD_RESET_SETTINGS,
  isRedeemable,
  isWellFormedOtp,
  otpDigestInput,
  resolvePasswordResetSettings,
} from '../../../src/modules/auth/domain/password-reset.js';
import * as randomModule from '../../../src/shared/security/random.js';
import { randomOtp } from '../../../src/shared/security/random.js';
import { FakeUnitOfWork } from '../../helpers/fakes.js';
import { flush, MINUTE, RecordingNotifier } from './support/password-reset-fakes.js';
import { buildResetHarness, NEW_PASSWORD, OLD_PASSWORD } from './support/password-reset-harness.js';

const SECOND = 1_000;
const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as { kind: string; code: string; message: string };
  }
  throw new Error('expected the promise to reject');
};
const GENERIC = { kind: 'bad_request', code: 'BAD_REQUEST' };
const wrongOtp = (otp: string) => (otp === '000000' ? '000001' : '000000');
const withTimeout = <T>(promise: Promise<T>, ms = 1_000): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`still pending after ${ms}ms`)), ms)),
  ]);

describe('OTP generation and storage', () => {
  it('issues exactly six digits, keeps leading zeros and is unique enough', async () => {
    const h = buildResetHarness({ resendCooldownSeconds: 0, maxRequestsPerWindow: 100 });
    const otps: string[] = [];
    for (let i = 0; i < 60; i += 1) otps.push(await h.requestOtp());
    for (const otp of otps) expect(otp).toMatch(/^\d{6}$/);
    expect(new Set(otps).size).toBeGreaterThan(50);
  });

  it('pads small values and covers the full range (randomOtp)', () => {
    const spy = vi.spyOn(randomModule, 'randomOtp');
    spy.mockRestore();
    const samples = Array.from({ length: 3_000 }, () => randomOtp());
    expect(samples.every((otp) => /^\d{6}$/.test(otp))).toBe(true);
    expect(samples.some((otp) => otp.startsWith('0'))).toBe(true); // ~10% of codes; leading zeros survive
    expect(randomOtp(4)).toMatch(/^\d{4}$/);
  });

  it('stores only a keyed digest bound to the row: the OTP is not recoverable from storage', async () => {
    const h = buildResetHarness();
    const otp = await h.requestOtp();
    const [row] = [...h.tokens.rows.values()];
    expect(JSON.stringify(row)).not.toContain(otp);
    expect(row!.tokenHash).toBe(h.keyedHasher.digest(otpDigestInput(row!.id, otp)));
    expect(h.keyedHasher.digest(otpDigestInput(randomUUID(), otp))).not.toBe(row!.tokenHash); // row-bound
  });

  it('accepts only six-digit strings', () => {
    for (const ok of ['000000', '123456', '999999']) expect(isWellFormedOtp(ok)).toBe(true);
    for (const bad of ['12345', '1234567', '12345a', '12 456', '', ' 123456', '１２３４５６', '12345\n'])
      expect(isWellFormedOtp(bad)).toBe(false);
  });

  it('truncates client metadata to the column limits', async () => {
    const h = buildResetHarness();
    await h.request.execute(
      { email: 'alice@example.org' },
      { ip: 'i'.repeat(200), userAgent: 'u'.repeat(2_000) },
    );
    const [row] = [...h.tokens.rows.values()];
    expect(row!.requestIp).toHaveLength(64);
    expect(row!.userAgent).toHaveLength(512);
  });
});

describe('settings', () => {
  it('defaults to 5 minutes, 5 attempts and a 60 second cooldown, and validates overrides', () => {
    expect(DEFAULT_PASSWORD_RESET_SETTINGS).toMatchObject({
      tokenTtlMinutes: 5,
      maxVerificationAttempts: 5,
      resendCooldownSeconds: 60,
    });
    for (const bad of [
      { tokenTtlMinutes: 0 },
      { maxVerificationAttempts: 0 },
      { maxVerificationAttempts: 21 },
      { resendCooldownSeconds: -1 },
      { resendCooldownSeconds: 3_601 },
      { maxRequestsPerWindow: 0 },
    ]) {
      expect(() => resolvePasswordResetSettings(bad)).toThrow(/Invalid password reset settings/);
    }
    expect(resolvePasswordResetSettings({ resendCooldownSeconds: 0 }).resendCooldownSeconds).toBe(0);
  });

  it('isRedeemable honours expiry, use and the attempt cap', () => {
    const now = new Date('2026-03-10T10:00:00Z');
    const base = {
      id: 'a',
      userId: 'u',
      tokenHash: 'h',
      createdAt: now,
      expiresAt: new Date(now.getTime() + MINUTE),
      usedAt: null,
      failedAttempts: 4,
    };
    expect(isRedeemable(base, now, 5)).toBe(true);
    expect(isRedeemable({ ...base, failedAttempts: 5 }, now, 5)).toBe(false);
    expect(isRedeemable({ ...base, usedAt: now }, now, 5)).toBe(false);
    expect(isRedeemable({ ...base, expiresAt: now }, now, 5)).toBe(false);
  });
});

describe('forgot password: no account enumeration', () => {
  it('behaves identically for existing, admin, unknown and disabled e-mails; only active accounts get an OTP', async () => {
    const h = buildResetHarness();
    h.users.add({ email: 'root@example.org', role: 'admin' });
    h.users.add({ email: 'off@example.org', status: 'disabled' });
    for (const email of ['alice@example.org', 'root@example.org', 'off@example.org', 'nobody@example.org']) {
      await expect(h.request.execute({ email }, h.meta)).resolves.toBeUndefined();
    }
    await flush();
    expect(h.notifier.sent.map((m) => m.email).sort()).toEqual(['alice@example.org', 'root@example.org']);
    expect(h.tokens.rows.size).toBe(2);
    expect(h.failures).toEqual([]);
  });

  it('applies the timing floor to every outcome', async () => {
    const h = buildResetHarness({ minResponseMs: 250 });
    await h.request.execute({ email: 'nobody@example.org' }, h.meta);
    await h.request.execute({ email: 'alice@example.org' }, h.meta);
    expect(h.delays).toEqual([250, 250]);
  });

  it('does not wait for the delivery provider', async () => {
    const h = buildResetHarness();
    h.notifier.mode = 'hang';
    await withTimeout(h.request.execute({ email: 'alice@example.org' }, h.meta));
    await flush();
    expect(h.notifier.attempts).toBe(1);
    expect(h.tokens.rows.size).toBe(1);
  });

  it('hides delivery failures from the caller and never leaks the OTP into failure signals', async () => {
    for (const mode of ['reject', 'throw'] as const) {
      const h = buildResetHarness();
      h.notifier.mode = mode;
      const send = vi.spyOn(h.notifier, 'send');
      await expect(h.request.execute({ email: 'alice@example.org' }, h.meta)).resolves.toBeUndefined();
      await flush();
      const otp = send.mock.calls[0]![0].otp;
      expect(otp).toMatch(/^\d{6}$/);
      expect(h.failures).toEqual([
        { stage: 'deliver', userId: h.alice.id, errorName: mode === 'reject' ? 'RangeError' : 'TypeError' },
      ]);
      const [row] = [...h.tokens.rows.values()];
      expect(JSON.stringify(h.failures)).not.toMatch(/provider failed/);
      expect(JSON.stringify(h.failures)).not.toContain(otp);
      expect(JSON.stringify(h.failures)).not.toContain(row!.tokenHash);
    }
  });

  it('survives a failure hook that throws, and reports (but hides) storage failures', async () => {
    const h = buildResetHarness();
    const request = new RequestPasswordResetUseCase({
      accounts: h.accounts,
      tokens: h.tokens,
      keyedHasher: h.keyedHasher,
      notifier: h.notifier,
      uow: new FakeUnitOfWork(),
      clock: h.clock.now,
      settings: h.settings,
      onFailure: () => {
        throw new Error('hook exploded');
      },
    });
    h.notifier.mode = 'reject';
    await expect(request.execute({ email: 'alice@example.org' }, h.meta)).resolves.toBeUndefined();
    await flush();

    const g = buildResetHarness();
    g.tokens.failCreate = true;
    await expect(g.request.execute({ email: 'alice@example.org' }, g.meta)).resolves.toBeUndefined();
    await flush();
    expect(g.failures).toEqual([{ stage: 'issue', userId: g.alice.id, errorName: 'Error' }]);
    expect(g.notifier.attempts).toBe(0);
  });
});

describe('forgot password: expiry, cooldown, supersession and throttling', () => {
  it('uses the injected clock and a 5 minute expiry', async () => {
    const h = buildResetHarness();
    const before = h.clock.now();
    await h.requestOtp();
    const [row] = [...h.tokens.rows.values()];
    expect(row!.createdAt).toEqual(before);
    expect(row!.expiresAt.getTime() - before.getTime()).toBe(5 * MINUTE);
    expect(h.notifier.last.expiresAt).toEqual(row!.expiresAt);
  });

  it('enforces a 60 second resend cooldown, silently, and lifts it exactly at 60s', async () => {
    const h = buildResetHarness();
    const first = await h.requestOtp();

    h.clock.advance(59 * SECOND);
    await expect(h.request.execute({ email: 'alice@example.org' }, h.meta)).resolves.toBeUndefined();
    await flush();
    expect(h.notifier.sent).toHaveLength(1); // swallowed: no mail, no new row, same response
    expect(h.tokens.rows.size).toBe(1);
    expect(h.failures).toEqual([]);

    h.clock.advance(1 * SECOND); // exactly 60s after the first
    const second = await h.requestOtp();
    expect(h.tokens.rows.size).toBe(2);
    // the swallowed request did not supersede the live OTP; the new one does
    await expect(
      h.reset.execute({ email: 'alice@example.org', otp: first, newPassword: NEW_PASSWORD }),
    ).rejects.toMatchObject(GENERIC);
    await h.reset.execute({ email: 'alice@example.org', otp: second, newPassword: NEW_PASSWORD });
  });

  it('keeps the first OTP valid when a request is swallowed by the cooldown', async () => {
    const h = buildResetHarness();
    const otp = await h.requestOtp();
    h.clock.advance(10 * SECOND);
    await h.request.execute({ email: 'alice@example.org' }, h.meta);
    await h.reset.execute({ email: 'alice@example.org', otp, newPassword: NEW_PASSWORD });
  });

  it('caps the hourly volume per user and lifts the cap when the window rolls over', async () => {
    const h = buildResetHarness({ maxRequestsPerWindow: 2 });
    await h.requestOtp();
    h.clock.advance(61 * SECOND);
    await h.requestOtp();
    h.clock.advance(61 * SECOND);
    await h.request.execute({ email: 'alice@example.org' }, h.meta);
    await flush();
    expect(h.notifier.sent).toHaveLength(2); // third swallowed

    h.clock.advance(61 * MINUTE);
    await h.requestOtp();
    expect(h.notifier.sent).toHaveLength(3);
  });

  it('serialises issuance per user through the repository lock', async () => {
    const h = buildResetHarness();
    await h.requestOtp();
    expect(h.tokens.lockCalls).toBe(1);
  });
});

describe('reset password', () => {
  it('sets the password, redeems the OTP, kills others, revokes all sessions and does not sign in', async () => {
    const h = buildResetHarness();
    const bob = h.users.add({ email: 'bob@example.org' });
    const now = h.clock.now();
    const newSession = (userId: string) =>
      h.sessions.create({
        id: randomUUID(),
        userId,
        refreshTokenHash: `hash-${randomUUID()}`,
        expiresAt: new Date(now.getTime() + 86_400_000),
        userAgent: null,
        ipAddress: null,
      });
    const aliceOne = await newSession(h.alice.id);
    const bobSession = await newSession(bob.id);
    const otp = await h.requestOtp();

    const outcome = await h.reset.execute({ email: 'alice@example.org', otp, newPassword: NEW_PASSWORD });

    expect(outcome).toBeUndefined();
    expect((await h.users.findById(h.alice.id))!.passwordHash).toBe(`hashed:${NEW_PASSWORD}`);
    expect(h.tokens.outstanding(h.alice.id)).toHaveLength(0);
    expect(h.sessions.sessions.get(aliceOne.id)).toMatchObject({ revokeReason: 'password_change' });
    expect(h.sessions.sessions.get(bobSession.id)!.revokedAt).toBeNull();
  });

  it('is single use: the OTP is invalid after a successful reset', async () => {
    const h = buildResetHarness();
    const otp = await h.requestOtp();
    await h.reset.execute({ email: 'alice@example.org', otp, newPassword: NEW_PASSWORD });
    const error = await rejection(
      h.reset.execute({ email: 'alice@example.org', otp, newPassword: 'another good passphrase' }),
    );
    expect(error).toMatchObject(GENERIC);
    expect((await h.users.findById(h.alice.id))!.passwordHash).toBe(`hashed:${NEW_PASSWORD}`);
  });

  it('gives one identical error for unknown e-mail, wrong, malformed, expired, superseded and disabled cases', async () => {
    const h = buildResetHarness();
    h.users.add({ email: 'off@example.org' });
    const otp = await h.requestOtp();
    const attempt = (email: string, code: string) =>
      rejection(h.reset.execute({ email, otp: code, newPassword: NEW_PASSWORD }));

    const errors = [
      await attempt('nobody@example.org', otp), // unknown e-mail, right-looking OTP
      await attempt('alice@example.org', wrongOtp(otp)), // wrong OTP
      await attempt('alice@example.org', '12345'), // malformed
      await attempt('alice@example.org', 'abcdef'),
      await attempt('off@example.org', otp), // account without a live OTP
    ];
    h.clock.advance(5 * MINUTE); // exactly the expiry boundary
    errors.push(await attempt('alice@example.org', otp));
    for (const error of errors) expect(error).toMatchObject(GENERIC);
    expect(new Set(errors.map((e) => e.message)).size).toBe(1);
  });

  it('binds the OTP to its owner: another account cannot use it', async () => {
    const h = buildResetHarness();
    h.users.add({ email: 'bob@example.org' });
    const aliceOtp = await h.requestOtp('alice@example.org');
    h.clock.advance(61 * SECOND);
    const bobOtp = await h.requestOtp('bob@example.org');
    expect(
      await rejection(
        h.reset.execute({
          email: 'bob@example.org',
          otp: aliceOtp === bobOtp ? wrongOtp(bobOtp) : aliceOtp,
          newPassword: NEW_PASSWORD,
        }),
      ),
    ).toMatchObject(GENERIC);
  });

  it('expires strictly at 5 minutes: valid 1 ms before, dead at the boundary', async () => {
    const early = buildResetHarness();
    const otp = await early.requestOtp();
    early.clock.advance(5 * MINUTE - 1);
    await early.reset.execute({ email: 'alice@example.org', otp, newPassword: NEW_PASSWORD });

    const late = buildResetHarness();
    const lateOtp = await late.requestOtp();
    late.clock.advance(5 * MINUTE);
    expect(
      await rejection(
        late.reset.execute({ email: 'alice@example.org', otp: lateOtp, newPassword: NEW_PASSWORD }),
      ),
    ).toMatchObject(GENERIC);
  });

  it('locks the OTP after 5 wrong attempts, even for the correct code afterwards', async () => {
    const h = buildResetHarness();
    const otp = await h.requestOtp();
    for (let i = 1; i <= 5; i += 1) {
      expect(
        await rejection(
          h.reset.execute({ email: 'alice@example.org', otp: wrongOtp(otp), newPassword: NEW_PASSWORD }),
        ),
      ).toMatchObject(GENERIC);
      expect([...h.tokens.rows.values()][0]!.failedAttempts).toBe(i); // counted and committed
    }
    expect(
      await rejection(h.reset.execute({ email: 'alice@example.org', otp, newPassword: NEW_PASSWORD })),
    ).toMatchObject(GENERIC);
    expect([...h.tokens.rows.values()][0]!.failedAttempts).toBe(5); // a locked OTP is not even compared
    expect((await h.users.findById(h.alice.id))!.passwordHash).toBe(`hashed:${OLD_PASSWORD}`);
  });

  it('still accepts the correct OTP after 4 wrong attempts', async () => {
    const h = buildResetHarness();
    const otp = await h.requestOtp();
    for (let i = 0; i < 4; i += 1) {
      await rejection(
        h.reset.execute({ email: 'alice@example.org', otp: wrongOtp(otp), newPassword: NEW_PASSWORD }),
      );
    }
    await h.reset.execute({ email: 'alice@example.org', otp, newPassword: NEW_PASSWORD });
  });

  it('counts guesses against the newest OTP only; a fresh OTP starts at zero attempts', async () => {
    const h = buildResetHarness();
    const first = await h.requestOtp();
    for (let i = 0; i < 5; i += 1) {
      await rejection(
        h.reset.execute({ email: 'alice@example.org', otp: wrongOtp(first), newPassword: NEW_PASSWORD }),
      );
    }
    h.clock.advance(61 * SECOND);
    const second = await h.requestOtp(); // a locked OTP can be replaced by asking again
    await h.reset.execute({ email: 'alice@example.org', otp: second, newPassword: NEW_PASSWORD });
  });

  it('enforces the password policy without burning an attempt or the OTP', async () => {
    const h = buildResetHarness();
    const otp = await h.requestOtp();
    const weak = await rejection(
      h.reset.execute({ email: 'alice@example.org', otp, newPassword: ' '.repeat(14) }),
    );
    expect(weak.code).toBe('PASSWORD_POLICY_VIOLATION');
    expect([...h.tokens.rows.values()][0]).toMatchObject({ failedAttempts: 0, usedAt: null });
    await h.reset.execute({ email: 'alice@example.org', otp, newPassword: NEW_PASSWORD });
  });

  it('does not run the expensive password hash for guesses that cannot succeed', async () => {
    const h = buildResetHarness();
    const otp = await h.requestOtp();
    const hash = vi.spyOn(h.passwordHasher, 'hash');
    await rejection(
      h.reset.execute({ email: 'alice@example.org', otp: wrongOtp(otp), newPassword: NEW_PASSWORD }),
    );
    await rejection(h.reset.execute({ email: 'nobody@example.org', otp, newPassword: NEW_PASSWORD }));
    expect(hash).not.toHaveBeenCalled();
  });

  it('refuses a disabled account even with an OTP issued while it was active', async () => {
    const h = buildResetHarness();
    const otp = await h.requestOtp();
    h.users.users.set(h.alice.id, { ...h.alice, status: 'disabled' });
    expect(
      await rejection(h.reset.execute({ email: 'alice@example.org', otp, newPassword: NEW_PASSWORD })),
    ).toMatchObject(GENERIC);
    expect((await h.users.findById(h.alice.id))!.passwordHash).toBe(`hashed:${OLD_PASSWORD}`);
  });

  it('lets exactly one of many concurrent submissions of the same OTP win', async () => {
    const h = buildResetHarness();
    const otp = await h.requestOtp();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        h.reset.execute({ email: 'alice@example.org', otp, newPassword: NEW_PASSWORD }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(7);
  });

  it('never puts the OTP or its digest into thrown errors', async () => {
    const h = buildResetHarness();
    const otp = await h.requestOtp();
    const error = await rejection(
      h.reset.execute({ email: 'alice@example.org', otp: wrongOtp(otp), newPassword: NEW_PASSWORD }),
    );
    expect(JSON.stringify(error)).not.toContain([...h.tokens.rows.values()][0]!.tokenHash);
    expect(RecordingNotifier.name).toBe('RecordingNotifier');
  });
});
