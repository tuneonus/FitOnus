import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../../src/config/env.js';

const base = {
  DATABASE_URL: 'postgres://app:pw@localhost:5432/app_dev',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  HMAC_SECRET: 'b'.repeat(40),
  JWT_ISSUER: 'issuer',
  JWT_AUDIENCE: 'audience',
};

// Obviously fake: they exist only so a test can prove they never appear in an error.
const PRIVATE_KEY_ID = 'TESTPRIVATEKEYID000000';
const PRIVATE_SECRET = 'TEST-PRIVATE-SECRET-THAT-MUST-NEVER-LEAK';
const ACCOUNT = '0123456789abcdef0123456789abcdef';
const privateEnv = {
  R2_ACCOUNT_ID: ACCOUNT,
  R2_PRIVATE_BUCKET: 'fitonus-private',
  R2_PRIVATE_ACCESS_KEY_ID: PRIVATE_KEY_ID,
  R2_PRIVATE_SECRET_ACCESS_KEY: PRIVATE_SECRET,
};
const publicEnv = {
  R2_ACCOUNT_ID: ACCOUNT,
  R2_ACCESS_KEY_ID: 'TESTPUBLICKEYID0000000',
  R2_SECRET_ACCESS_KEY: 'TEST-PUBLIC-SECRET-THAT-MUST-NEVER-LEAK',
  R2_BUCKET: 'fitonus-media',
  R2_PUBLIC_BASE_URL: 'https://media.tuneonus.com',
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

describe('private member-media configuration (loadConfig)', () => {
  it('is off when no R2_PRIVATE_* variable is set: nothing else changes', () => {
    const config = loadConfig({ ...base, ...publicEnv });
    expect(config.media.privateMedia).toBeNull();
    expect(config.media.r2?.bucket).toBe('fitonus-media');
  });

  it('is off, with no public bucket at all, when nothing is set', () => {
    expect(loadConfig(base).media.privateMedia).toBeNull();
  });

  it('reads a complete configuration with the documented defaults, independent of the public bucket', () => {
    const alone = loadConfig({ ...base, ...privateEnv }).media;
    expect(alone.r2).toBeNull();
    expect(alone.privateMedia).toMatchObject({
      accountId: ACCOUNT,
      bucket: 'fitonus-private',
      accessKeyId: PRIVATE_KEY_ID,
      urlTtlSeconds: 900,
      purgeEnabled: true,
    });
    const both = loadConfig({ ...base, ...publicEnv, ...privateEnv }).media;
    expect(both.r2?.bucket).toBe('fitonus-media');
    expect(both.privateMedia?.bucket).toBe('fitonus-private');
  });

  it('takes the request timeout from the shared R2_REQUEST_TIMEOUT_MS', () => {
    expect(
      loadConfig({ ...base, ...privateEnv, R2_REQUEST_TIMEOUT_MS: '4000' }).media.privateMedia?.timeoutMs,
    ).toBe(4000);
  });

  it('accepts a URL lifetime and the purge switch', () => {
    const config = loadConfig({
      ...base,
      ...privateEnv,
      PRIVATE_MEDIA_URL_TTL_SECONDS: '300',
      PRIVATE_MEDIA_PURGE_ENABLED: 'false',
    });
    expect(config.media.privateMedia).toMatchObject({ urlTtlSeconds: 300, purgeEnabled: false });
  });

  it.each(['59', '3601', 'abc', '1.5', '-1'])('refuses the URL lifetime %j', (ttl) => {
    const issues = issuesOf({ ...base, ...privateEnv, PRIVATE_MEDIA_URL_TTL_SECONDS: ttl });
    expect(issues.some((issue) => issue.startsWith('PRIVATE_MEDIA_URL_TTL_SECONDS'))).toBe(true);
  });

  it('refuses a partial set: all three R2_PRIVATE_* values or none', () => {
    const { R2_PRIVATE_SECRET_ACCESS_KEY: _omitted, ...partial } = privateEnv;
    void _omitted;
    const issues = issuesOf({ ...base, ...partial });
    expect(issues.some((issue) => issue.startsWith('R2_PRIVATE_SECRET_ACCESS_KEY: required'))).toBe(true);
  });

  it('refuses private media without the Cloudflare account id', () => {
    const { R2_ACCOUNT_ID: _omitted, ...withoutAccount } = privateEnv;
    void _omitted;
    expect(issuesOf({ ...base, ...withoutAccount }).some((issue) => issue.startsWith('R2_ACCOUNT_ID'))).toBe(
      true,
    );
  });

  it('refuses the public bucket as the private bucket', () => {
    const issues = issuesOf({ ...base, ...publicEnv, ...privateEnv, R2_PRIVATE_BUCKET: 'fitonus-media' });
    expect(issues.some((issue) => issue.startsWith('R2_PRIVATE_BUCKET: must not be the public'))).toBe(true);
  });

  it('refuses the public token as the private token', () => {
    const issues = issuesOf({
      ...base,
      ...publicEnv,
      ...privateEnv,
      R2_PRIVATE_ACCESS_KEY_ID: publicEnv.R2_ACCESS_KEY_ID,
    });
    expect(issues.some((issue) => issue.startsWith('R2_PRIVATE_ACCESS_KEY_ID: must not reuse'))).toBe(true);
  });

  it('refuses a public address for the private bucket, even when nothing else is configured', () => {
    const issues = issuesOf({ ...base, R2_PRIVATE_PUBLIC_BASE_URL: 'https://private.example.org' });
    expect(issues.some((issue) => issue.startsWith('R2_PRIVATE_PUBLIC_BASE_URL'))).toBe(true);
  });

  it('never repeats a key id, a secret or the account id in an error', () => {
    const issues = issuesOf({
      ...base,
      ...publicEnv,
      ...privateEnv,
      R2_PRIVATE_BUCKET: 'Not A Bucket!',
      PRIVATE_MEDIA_URL_TTL_SECONDS: 'x',
      R2_PRIVATE_PUBLIC_BASE_URL: 'https://secret-host.example.org',
    });
    expect(issues.length).toBeGreaterThan(0);
    const text = issues.join('\n');
    for (const secret of [
      PRIVATE_KEY_ID,
      PRIVATE_SECRET,
      publicEnv.R2_ACCESS_KEY_ID,
      publicEnv.R2_SECRET_ACCESS_KEY,
      'secret-host.example.org',
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});
