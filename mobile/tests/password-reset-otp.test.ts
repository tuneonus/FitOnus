import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { apiClient } from '../src/services/api-client';
import { authService } from '../src/features/auth/services/authService';
import { resetPasswordSchema } from '../src/features/auth/utils/auth-schemas';
import {
  isValidOtp,
  OTP_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  sanitizeOtp,
} from '../src/features/auth/utils/validation';

const PASSWORD = 'AValidPassword123!';

/** Replaces apiClient.post for one test and records what the app would have sent. */
async function withPost<T>(
  respond: (url: string, body: unknown) => Promise<unknown>,
  run: (calls: Array<{ url: string; body: unknown }>) => Promise<T>,
): Promise<T> {
  const original = apiClient.post;
  const calls: Array<{ url: string; body: unknown }> = [];
  (apiClient as any).post = (url: string, body: unknown) => {
    calls.push({ url, body });
    return respond(url, body);
  };
  try {
    return await run(calls);
  } finally {
    apiClient.post = original;
  }
}

describe('password reset: 6-digit OTP (mobile)', () => {
  describe('OTP helpers', () => {
    it('keeps exactly six digits, strips everything else, and preserves leading zeros', () => {
      assert.equal(OTP_LENGTH, 6);
      assert.equal(sanitizeOtp('004217'), '004217');
      assert.equal(sanitizeOtp(' 12 34-56 '), '123456'); // pasted with spaces/dashes
      assert.equal(sanitizeOtp('12345678'), '123456'); // capped
      assert.equal(sanitizeOtp('abc'), '');
      assert.equal(typeof sanitizeOtp('000000'), 'string');
    });

    it('validates only six-digit strings', () => {
      for (const ok of ['000000', '123456', '999999']) assert.equal(isValidOtp(ok), true);
      for (const bad of ['', '12345', '1234567', '12345a', ' 123456', '12 456'])
        assert.equal(isValidOtp(bad), false, bad);
    });

    it('mirrors the server resend cooldown of 60 seconds', () => {
      assert.equal(RESEND_COOLDOWN_SECONDS, 60);
    });
  });

  describe('resetPasswordSchema', () => {
    const base = { email: 'user@example.com', otp: '123456', newPassword: PASSWORD };
    it('accepts email + 6-digit OTP + strong password', () => {
      assert.equal(resetPasswordSchema.safeParse(base).success, true);
    });
    it('rejects a missing email, a bad OTP and a short password', () => {
      assert.equal(resetPasswordSchema.safeParse({ ...base, email: '' }).success, false);
      for (const otp of ['', '12345', '1234567', 'abcdef'])
        assert.equal(resetPasswordSchema.safeParse({ ...base, otp }).success, false, otp);
      assert.equal(resetPasswordSchema.safeParse({ ...base, newPassword: 'short' }).success, false);
    });
    it('no longer accepts the old token shape', () => {
      assert.equal(resetPasswordSchema.safeParse({ token: 'x'.repeat(43), newPassword: PASSWORD }).success, false);
    });
  });

  describe('authService.resetPassword', () => {
    it('posts {email, otp, newPassword} to /auth/reset-password, OTP as a string with its leading zeros', async () => {
      await withPost(
        () => Promise.resolve({ data: { data: { message: 'Your password has been reset.' } } }),
        async (calls) => {
          const res = await authService.resetPassword({ email: ' User@Example.com ', otp: '004217', newPassword: PASSWORD });
          assert.equal(res.ok, true);
          assert.deepEqual(calls, [
            {
              url: '/auth/reset-password',
              body: { email: 'user@example.com', otp: '004217', newPassword: PASSWORD },
            },
          ]);
          assert.equal(typeof (calls[0]!.body as { otp: unknown }).otp, 'string');
        },
      );
    });

    it('never calls the API for an invalid email, OTP or password', async () => {
      await withPost(
        () => Promise.reject(new Error('must not be called')),
        async (calls) => {
          for (const params of [
            { email: 'nope', otp: '123456', newPassword: PASSWORD },
            { email: 'user@example.com', otp: '12345', newPassword: PASSWORD },
            { email: 'user@example.com', otp: '1234567', newPassword: PASSWORD },
            { email: 'user@example.com', otp: '123456', newPassword: 'short' },
          ]) {
            const res = await authService.resetPassword(params);
            assert.equal(res.ok, false);
          }
          assert.equal(calls.length, 0);
        },
      );
    });

    it('surfaces the generic server message for a wrong, expired or locked-out code', async () => {
      await withPost(
        () =>
          Promise.reject({
            response: {
              status: 400,
              data: { error: { code: 'BAD_REQUEST', message: 'This verification code is invalid or has expired. Please request a new one.' } },
            },
          }),
        async () => {
          const res = await authService.resetPassword({ email: 'user@example.com', otp: '123456', newPassword: PASSWORD });
          assert.equal(res.ok, false);
          if (!res.ok) assert.match(res.error, /invalid or has expired/i);
        },
      );
    });
  });

  describe('authService.requestReset', () => {
    it('sends only the email and treats the generic 200 as success', async () => {
      await withPost(
        () => Promise.resolve({ data: { data: { message: 'If an account exists ... a 6-digit verification code has been sent.' } } }),
        async (calls) => {
          const res = await authService.requestReset(' User@Example.com ');
          assert.equal(res.ok, true);
          assert.deepEqual(calls, [{ url: '/auth/forgot-password', body: { email: 'user@example.com' } }]);
        },
      );
    });
  });

  describe('screens (source contract; React Native cannot render under node:test)', () => {
    const read = (file: string) =>
      readFileSync(path.join(__dirname, '..', 'src/features/auth/screens', file), 'utf8');

    it('the forgot screen hands the email to the reset screen and runs a resend countdown', () => {
      const src = read('ForgotPasswordScreen.tsx');
      assert.match(src, /navigate\('resetPassword', \{ email:/);
      assert.match(src, /RESEND_COOLDOWN_SECONDS/);
      assert.match(src, /6-digit/);
      assert.doesNotMatch(src, /30 minutes|reset link|token/i);
    });

    it('the reset screen collects a numeric 6-digit one-time code and no longer uses a token', () => {
      const src = read('ResetPasswordScreen.tsx');
      assert.match(src, /keyboardType="number-pad"/);
      assert.match(src, /maxLength=\{OTP_LENGTH\}/);
      assert.match(src, /oneTimeCode/);
      assert.match(src, /sanitizeOtp\(/);
      assert.doesNotMatch(src, /token/i);
    });
  });
});
