import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, loadDatabaseConfig } from '../../../src/config/env.js';

const valid = {
  DATABASE_URL: 'postgres://app:pw@localhost:5432/app_dev',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  HMAC_SECRET: 'b'.repeat(40),
  JWT_ISSUER: 'issuer',
  JWT_AUDIENCE: 'audience',
};

const production = {
  ...valid,
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'Xk2'.repeat(15),
  HMAC_SECRET: 'Qz9'.repeat(15),
  CORS_ORIGINS: 'https://app.example.org',
  AUTH_PUBLIC_REGISTRATION: 'false',
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

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const config = loadConfig(valid);
    expect(config.env).toBe('development');
    expect(config.http.port).toBe(3000);
    expect(config.http.bodyLimit).toBe('100kb');
    expect(config.auth.publicRegistration).toBe(false);
    expect(config.auth.accessTokenTtlSeconds).toBe(900);
    expect(config.database.ssl).toBe('disable');
    expect(config.idempotency.ttlSeconds).toBe(24 * 3600);
  });

  it('reports every missing secret by key without echoing values', () => {
    const issues = issuesOf({ DATABASE_URL: valid.DATABASE_URL, JWT_ACCESS_SECRET: 'short-secret-value' });
    expect(issues.some((issue) => issue.startsWith('JWT_ACCESS_SECRET'))).toBe(true);
    expect(issues.some((issue) => issue.startsWith('HMAC_SECRET'))).toBe(true);
    expect(issues.join(' ')).not.toContain('short-secret-value');
  });

  it('rejects non-postgres URLs and wildcard CORS', () => {
    expect(issuesOf({ ...valid, DATABASE_URL: 'mysql://x' })[0]).toMatch(/^DATABASE_URL/);
    expect(issuesOf({ ...valid, CORS_ORIGINS: '*' })[0]).toMatch(/wildcard/);
    expect(issuesOf({ ...valid, CORS_ORIGINS: 'http://localhost:5173/path' })[0]).toMatch(/bare origin/);
  });

  it('accepts a hardened production configuration', () => {
    expect(loadConfig(production).isProduction).toBe(true);
  });

  it('refuses placeholder secrets, http origins, pretty logs and implicit registration policy in production', () => {
    const issues = issuesOf({
      ...production,
      JWT_ACCESS_SECRET: 'change-me-to-a-long-random-value-0123456789',
      CORS_ORIGINS: 'http://app.example.org',
      LOG_PRETTY: 'true',
      AUTH_PUBLIC_REGISTRATION: undefined as unknown as string,
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^JWT_ACCESS_SECRET: placeholder/),
        expect.stringMatching(/^CORS_ORIGINS: production origins must use https/),
        expect.stringMatching(/^LOG_PRETTY/),
        expect.stringMatching(/^AUTH_PUBLIC_REGISTRATION: must be set explicitly/),
      ]),
    );
  });

  it('refuses reusing the JWT secret as the HMAC secret in production', () => {
    expect(issuesOf({ ...production, HMAC_SECRET: production.JWT_ACCESS_SECRET })).toContain(
      'HMAC_SECRET: must differ from JWT_ACCESS_SECRET',
    );
  });
});

describe('loadDatabaseConfig', () => {
  it('needs only database settings', () => {
    expect(loadDatabaseConfig({ DATABASE_URL: valid.DATABASE_URL }).poolMax).toBe(10);
  });
});
