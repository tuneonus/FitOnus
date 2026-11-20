import { describe, expect, it } from 'vitest';
import { parsePrivateMediaConfig } from '../../../src/shared/private-media/private-media-config.js';

const ACCOUNT = '0123456789abcdef0123456789abcdef';
const VALID = {
  R2_ACCOUNT_ID: ACCOUNT,
  R2_PRIVATE_BUCKET: 'tuneonus-private',
  R2_PRIVATE_ACCESS_KEY_ID: 'PRIVATEKEYID000000',
  R2_PRIVATE_SECRET_ACCESS_KEY: 'PRIVATE-SECRET-VALUE-THAT-MUST-NEVER-LEAK',
};
const CONTEXT = {
  timeoutMs: 10_000,
  publicBucket: { bucket: 'fitonus-media', accessKeyId: 'PUBLICKEYID000000' },
};

describe('parsePrivateMediaConfig', () => {
  it('is off, without complaint, when nothing private is set', () => {
    expect(parsePrivateMediaConfig({ R2_ACCOUNT_ID: ACCOUNT }, CONTEXT)).toEqual({
      config: null,
      issues: [],
    });
    expect(parsePrivateMediaConfig({}, CONTEXT)).toEqual({ config: null, issues: [] });
  });

  it('reads a complete configuration with the documented defaults', () => {
    const { config, issues } = parsePrivateMediaConfig(VALID, CONTEXT);
    expect(issues).toEqual([]);
    expect(config).toEqual({
      accountId: ACCOUNT,
      bucket: 'tuneonus-private',
      accessKeyId: 'PRIVATEKEYID000000',
      secretAccessKey: VALID.R2_PRIVATE_SECRET_ACCESS_KEY,
      timeoutMs: 10_000,
      urlTtlSeconds: 900,
      purgeEnabled: true,
    });
  });

  it('works without any public bucket configured (private media alone)', () => {
    expect(parsePrivateMediaConfig(VALID, { timeoutMs: 5_000 }).config?.bucket).toBe('tuneonus-private');
  });

  it('is all-or-none for the three private values', () => {
    for (const missing of [
      'R2_PRIVATE_BUCKET',
      'R2_PRIVATE_ACCESS_KEY_ID',
      'R2_PRIVATE_SECRET_ACCESS_KEY',
    ] as const) {
      const partial: Record<string, string> = { ...VALID };
      delete partial[missing];
      const { config, issues } = parsePrivateMediaConfig(partial, CONTEXT);
      expect(config).toBeNull();
      expect(issues.join('\n')).toContain(`${missing}: required`);
    }
  });

  it('needs the Cloudflare account id', () => {
    const { R2_ACCOUNT_ID: _omitted, ...withoutAccount } = VALID;
    expect(parsePrivateMediaConfig(withoutAccount, CONTEXT).issues.join('\n')).toContain('R2_ACCOUNT_ID');
    expect(parsePrivateMediaConfig({ ...VALID, R2_ACCOUNT_ID: 'short' }, CONTEXT).config).toBeNull();
  });

  it('refuses to share the public bucket or its token', () => {
    const sameBucket = parsePrivateMediaConfig({ ...VALID, R2_PRIVATE_BUCKET: 'fitonus-media' }, CONTEXT);
    expect(sameBucket.config).toBeNull();
    expect(sameBucket.issues.join('\n')).toContain('must not be the public media bucket');

    const sameToken = parsePrivateMediaConfig(
      { ...VALID, R2_PRIVATE_ACCESS_KEY_ID: 'PUBLICKEYID000000' },
      CONTEXT,
    );
    expect(sameToken.config).toBeNull();
    expect(sameToken.issues.join('\n')).toContain('must not reuse the public bucket token');
  });

  it('refuses a public address for the private bucket, even when nothing else is set', () => {
    const { config, issues } = parsePrivateMediaConfig(
      { R2_PRIVATE_PUBLIC_BASE_URL: 'https://media.example.org' },
      CONTEXT,
    );
    expect(config).toBeNull();
    expect(issues.join('\n')).toContain('has no public address by design');
  });

  it.each(['A', 'ab', 'UPPER-case', '-leading', 'trailing-', 'has_underscore', 'x'.repeat(64)])(
    'refuses the bucket name %j',
    (bucket) => {
      expect(parsePrivateMediaConfig({ ...VALID, R2_PRIVATE_BUCKET: bucket }, CONTEXT).config).toBeNull();
    },
  );

  it('bounds the signed-URL lifetime to 60-3600 seconds', () => {
    expect(
      parsePrivateMediaConfig({ ...VALID, PRIVATE_MEDIA_URL_TTL_SECONDS: '60' }, CONTEXT).config
        ?.urlTtlSeconds,
    ).toBe(60);
    expect(
      parsePrivateMediaConfig({ ...VALID, PRIVATE_MEDIA_URL_TTL_SECONDS: '3600' }, CONTEXT).config
        ?.urlTtlSeconds,
    ).toBe(3600);
    for (const bad of ['59', '3601', '0', '-5', '1.5', 'abc', '900s']) {
      const { config, issues } = parsePrivateMediaConfig(
        { ...VALID, PRIVATE_MEDIA_URL_TTL_SECONDS: bad },
        CONTEXT,
      );
      expect(config, bad).toBeNull();
      expect(issues.join('\n')).toContain('PRIVATE_MEDIA_URL_TTL_SECONDS');
    }
  });

  it('reads the purge switch', () => {
    expect(
      parsePrivateMediaConfig({ ...VALID, PRIVATE_MEDIA_PURGE_ENABLED: 'false' }, CONTEXT).config
        ?.purgeEnabled,
    ).toBe(false);
    expect(
      parsePrivateMediaConfig({ ...VALID, PRIVATE_MEDIA_PURGE_ENABLED: 'yes' }, CONTEXT).config,
    ).toBeNull();
  });

  it('never repeats a secret in an issue', () => {
    const { issues } = parsePrivateMediaConfig(
      { ...VALID, R2_PRIVATE_BUCKET: 'BAD', PRIVATE_MEDIA_URL_TTL_SECONDS: 'x', R2_ACCOUNT_ID: 'bad' },
      CONTEXT,
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join('\n')).not.toContain(VALID.R2_PRIVATE_SECRET_ACCESS_KEY);
    expect(issues.join('\n')).not.toContain(VALID.R2_PRIVATE_ACCESS_KEY_ID);
  });
});
