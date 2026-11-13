import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../../src/config/env.js';

const base = {
  DATABASE_URL: 'postgres://app:pw@localhost:5432/app_dev',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  HMAC_SECRET: 'b'.repeat(40),
  JWT_ISSUER: 'issuer',
  JWT_AUDIENCE: 'audience',
};
// Obviously fake.
const KEY = 're_unit_test_not_a_real_key_0000';
const resend = {
  ...base,
  EMAIL_PROVIDER: 'resend',
  EMAIL_API_KEY: KEY,
  EMAIL_FROM: 'OnusFit <noreply@tuneonus.com>',
};

const issuesOf = (env: Record<string, string>): readonly string[] => {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.issues;
    throw error;
  }
  return [];
};

describe('e-mail configuration', () => {
  it('is off by default, so password reset stays disabled', () => {
    expect(loadConfig(base).email).toEqual({ provider: 'none' });
  });

  it.each(['', '   ', 'none', 'NONE'])('treats EMAIL_PROVIDER=%j as off', (value) => {
    expect(loadConfig({ ...base, EMAIL_PROVIDER: value }).email).toEqual({ provider: 'none' });
  });

  it('ignores a stray key or sender while the provider is off', () => {
    const config = loadConfig({ ...base, EMAIL_API_KEY: KEY, EMAIL_FROM: 'whatever' });
    expect(config.email).toEqual({ provider: 'none' });
  });

  it('builds the resend settings with a bounded default timeout', () => {
    expect(loadConfig(resend).email).toEqual({
      provider: 'resend',
      apiKey: KEY,
      from: 'OnusFit <noreply@tuneonus.com>',
      timeoutMs: 5_000,
    });
  });

  it('is case/whitespace tolerant for the provider and trims key and sender', () => {
    const config = loadConfig({
      ...resend,
      EMAIL_PROVIDER: '  Resend ',
      EMAIL_API_KEY: ` ${KEY}\n`,
      EMAIL_FROM: ' noreply@tuneonus.com ',
    });
    expect(config.email).toMatchObject({ provider: 'resend', apiKey: KEY, from: 'noreply@tuneonus.com' });
  });

  it('requires the key and the sender when resend is selected, naming keys only', () => {
    const issues = issuesOf({ ...base, EMAIL_PROVIDER: 'resend' });
    expect(issues).toEqual([
      'EMAIL_API_KEY: required when EMAIL_PROVIDER=resend',
      'EMAIL_FROM: required when EMAIL_PROVIDER=resend',
    ]);
    expect(issuesOf({ ...resend, EMAIL_API_KEY: '   ' })).toEqual([
      'EMAIL_API_KEY: required when EMAIL_PROVIDER=resend',
    ]);
  });

  it.each([
    'OnusFit <noreply@tuneonus.com>',
    'noreply@tuneonus.com',
    'OnusFit Support <support@mail.tuneonus.com>',
  ])('accepts the sender %j', (from) => {
    expect(issuesOf({ ...resend, EMAIL_FROM: from })).toEqual([]);
  });

  it.each([
    'not an email',
    'OnusFit <noreply>',
    '<noreply@tuneonus.com>',
    'OnusFit noreply@tuneonus.com extra <noreply@tuneonus.com> tail',
    'noreply@tuneonus.com\r\nBcc: attacker@example.org',
    'a@b@c.com',
  ])('rejects the sender %j without echoing it', (from) => {
    const issues = issuesOf({ ...resend, EMAIL_FROM: from });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^EMAIL_FROM: must look like/);
    expect(issues[0]).not.toContain('attacker');
  });

  it('rejects unknown providers and out-of-range timeouts', () => {
    expect(issuesOf({ ...base, EMAIL_PROVIDER: 'sendgrid' })[0]).toMatch(/^EMAIL_PROVIDER/);
    expect(issuesOf({ ...resend, EMAIL_TIMEOUT_MS: '100' })[0]).toMatch(/^EMAIL_TIMEOUT_MS/);
    expect(issuesOf({ ...resend, EMAIL_TIMEOUT_MS: '60000' })[0]).toMatch(/^EMAIL_TIMEOUT_MS/);
    expect(loadConfig({ ...resend, EMAIL_TIMEOUT_MS: '1500' }).email).toMatchObject({ timeoutMs: 1_500 });
  });

  it('never puts the API key into an error', () => {
    const all = [
      ...issuesOf({ ...resend, EMAIL_FROM: 'garbage', EMAIL_TIMEOUT_MS: '1' }),
      ...issuesOf({ ...base, EMAIL_PROVIDER: 'nope', EMAIL_API_KEY: KEY }),
    ];
    expect(all.length).toBeGreaterThan(0);
    expect(all.join(' ')).not.toContain(KEY);
  });

  it('loads in production with and without a delivery channel', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'Xk2'.repeat(15),
      HMAC_SECRET: 'Qz9'.repeat(15),
      CORS_ORIGINS: 'https://app.example.org',
      AUTH_PUBLIC_REGISTRATION: 'false',
    };
    expect(loadConfig(production).email.provider).toBe('none');
    expect(
      loadConfig({
        ...production,
        EMAIL_PROVIDER: 'resend',
        EMAIL_API_KEY: KEY,
        EMAIL_FROM: resend.EMAIL_FROM,
      }).email.provider,
    ).toBe('resend');
  });
});
