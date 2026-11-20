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
const ACCESS_KEY_ID = 'TESTACCESSKEYID000000';
const SECRET = 'TEST-SECRET-ACCESS-KEY-THAT-MUST-NEVER-LEAK';
const r2 = {
  R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  R2_ACCESS_KEY_ID: ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: SECRET,
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

describe('R2 media configuration', () => {
  it('is off when nothing is set, so text-only notifications work exactly as before', () => {
    expect(loadConfig(base).media).toEqual({ r2: null, heicEnabled: true, privateMedia: null });
    expect(loadConfig(base).media.r2).toBeNull();
  });

  it('treats blank values as unset', () => {
    const blank = Object.fromEntries(Object.keys(r2).map((key) => [key, '  ']));
    expect(loadConfig({ ...base, ...blank }).media).toEqual({
      r2: null,
      heicEnabled: true,
      privateMedia: null,
    });
  });

  describe('IMAGE_HEIC_ENABLED (independent of R2: it only decides which uploads are decoded)', () => {
    it('is on by default, with or without R2', () => {
      expect(loadConfig(base).media.heicEnabled).toBe(true);
      expect(loadConfig({ ...base, ...r2 }).media.heicEnabled).toBe(true);
    });

    it('can be switched off, and does not disturb the R2 settings', () => {
      const off = loadConfig({ ...base, ...r2, IMAGE_HEIC_ENABLED: 'false' }).media;
      expect(off.heicEnabled).toBe(false);
      expect(off.r2).toMatchObject({ bucket: 'fitonus-media' });
      expect(loadConfig({ ...base, IMAGE_HEIC_ENABLED: 'false' }).media).toEqual({
        r2: null,
        heicEnabled: false,
        privateMedia: null,
      });
    });

    it('accepts an explicit true', () => {
      expect(loadConfig({ ...base, IMAGE_HEIC_ENABLED: 'true' }).media.heicEnabled).toBe(true);
    });

    it.each(['yes', '1', 'TRUE', 'off', ''])('refuses the unclear value %j instead of guessing', (value) => {
      const issues = issuesOf({ ...base, IMAGE_HEIC_ENABLED: value });
      expect(issues.some((issue) => issue.startsWith('IMAGE_HEIC_ENABLED'))).toBe(true);
    });
  });

  it('reads a complete configuration', () => {
    expect(loadConfig({ ...base, ...r2 }).media.r2).toEqual({
      accountId: r2.R2_ACCOUNT_ID,
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET,
      bucket: 'fitonus-media',
      publicBaseUrl: 'https://media.tuneonus.com',
      timeoutMs: 10_000,
    });
  });

  it('trims whitespace around values and a trailing slash on the public URL', () => {
    const config = loadConfig({
      ...base,
      ...r2,
      R2_BUCKET: ' fitonus-media ',
      R2_PUBLIC_BASE_URL: ' https://media.tuneonus.com/ ',
    });
    expect(config.media.r2).toMatchObject({
      bucket: 'fitonus-media',
      publicBaseUrl: 'https://media.tuneonus.com',
    });
  });

  it('accepts a custom request timeout', () => {
    expect(loadConfig({ ...base, ...r2, R2_REQUEST_TIMEOUT_MS: '3000' }).media.r2?.timeoutMs).toBe(3_000);
  });

  it('does not treat the shared account id alone as a public-bucket setup (private media may be the only R2 use)', () => {
    const config = loadConfig({ ...base, R2_ACCOUNT_ID: r2.R2_ACCOUNT_ID });
    expect(config.media.r2).toBeNull();
    expect(issuesOf({ ...base, R2_ACCOUNT_ID: r2.R2_ACCOUNT_ID })).toEqual([]);
  });

  describe('all-or-nothing', () => {
    it.each(Object.keys(r2))('refuses to start with %s missing, naming only that variable', (missing) => {
      const { [missing]: _removed, ...rest } = r2 as Record<string, string>;
      const issues = issuesOf({ ...base, ...rest });
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatch(new RegExp(`^${missing}: required`));
    });

    it('lists every missing variable when only one is set', () => {
      const issues = issuesOf({ ...base, R2_BUCKET: 'fitonus-media' });
      expect(issues.map((issue) => issue.split(':')[0])).toEqual([
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_PUBLIC_BASE_URL',
      ]);
    });
  });

  describe('validation', () => {
    it.each(['not-hex', '0123', '0123456789abcdef0123456789abcdeg', '0123456789abcdef0123456789abcdef0'])(
      'rejects the account id %j',
      (value) => {
        expect(issuesOf({ ...base, ...r2, R2_ACCOUNT_ID: value })).toEqual([
          'R2_ACCOUNT_ID: must be the 32-character Cloudflare account id',
        ]);
      },
    );

    it.each(['Fitonus-Media', 'fit_onus', 'ab', '-fitonus', 'fitonus-', 'a'.repeat(64), 'fit onus'])(
      'rejects the bucket name %j',
      (value) => {
        expect(issuesOf({ ...base, ...r2, R2_BUCKET: value })).toEqual([
          'R2_BUCKET: must be a bucket name (3-63 lowercase letters, digits or hyphens)',
        ]);
      },
    );

    it.each(['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'])('rejects whitespace inside %s', (key) => {
      expect(issuesOf({ ...base, ...r2, [key]: 'abc def' })).toEqual([`${key}: must not contain whitespace`]);
    });

    it.each([
      ['plain http (FCM refuses non-https images)', 'http://media.tuneonus.com'],
      ['a path', 'https://media.tuneonus.com/public'],
      ['a query string', 'https://media.tuneonus.com/?x=1'],
      ['a fragment', 'https://media.tuneonus.com/#x'],
      ['embedded credentials', 'https://user:pass@media.tuneonus.com'],
      ['the private S3 API host', `https://${r2.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`],
      ['a bare host name', 'media.tuneonus.com'],
      ['a non-URL', 'not a url'],
      ['javascript:', 'javascript:alert(1)'],
      ['a data URL', 'data:text/plain,hello'],
    ])('rejects a public URL with %s', (_name, value) => {
      const issues = issuesOf({ ...base, ...r2, R2_PUBLIC_BASE_URL: value });
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatch(/^R2_PUBLIC_BASE_URL: must be the public https origin/);
    });

    it('accepts a custom domain and an r2.dev public bucket URL', () => {
      expect(
        loadConfig({ ...base, ...r2, R2_PUBLIC_BASE_URL: 'https://pub-abc123.r2.dev' }).media.r2
          ?.publicBaseUrl,
      ).toBe('https://pub-abc123.r2.dev');
    });

    it('rejects an out-of-range timeout', () => {
      expect(issuesOf({ ...base, ...r2, R2_REQUEST_TIMEOUT_MS: '5' }).length).toBeGreaterThan(0);
    });
  });

  describe('secrecy', () => {
    const everyBadCase: Record<string, string>[] = [
      { R2_ACCOUNT_ID: 'bad' },
      { R2_BUCKET: 'BAD BUCKET' },
      { R2_PUBLIC_BASE_URL: `http://user:${SECRET}@media.tuneonus.com/${SECRET}` },
      { R2_SECRET_ACCESS_KEY: `${SECRET} with spaces` },
      { R2_ACCESS_KEY_ID: `${ACCESS_KEY_ID} spaced` },
    ];

    it.each(everyBadCase.map((override) => [JSON.stringify(Object.keys(override)), override] as const))(
      'never echoes a credential or the URL in the error for %s',
      (_name, override) => {
        const issues = issuesOf({ ...base, ...r2, ...override });
        expect(issues.length).toBeGreaterThan(0);
        const text = issues.join('\n');
        expect(text).not.toContain(SECRET);
        expect(text).not.toContain(ACCESS_KEY_ID);
        expect(text).not.toContain('media.tuneonus.com');
        expect(text).not.toContain(r2.R2_ACCOUNT_ID);
      },
    );

    it('keeps credentials out of the thrown error message too', () => {
      try {
        loadConfig({ ...base, ...r2, R2_BUCKET: 'BAD BUCKET' });
        expect.unreachable();
      } catch (error) {
        expect((error as Error).message).not.toContain(SECRET);
        expect((error as Error).message).not.toContain(ACCESS_KEY_ID);
      }
    });
  });
});
