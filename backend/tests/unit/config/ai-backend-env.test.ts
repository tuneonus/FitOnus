import { describe, expect, it } from 'vitest';
import { assertAiBackendConfigured, ConfigError, loadConfig } from '../../../src/config/env.js';

const valid = {
  DATABASE_URL: 'postgres://app:pw@localhost:5432/app_dev',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  HMAC_SECRET: 'b'.repeat(40),
  JWT_ISSUER: 'issuer',
  JWT_AUDIENCE: 'audience',
};
const withAi = { ...valid, AI_BACKEND_URL: 'http://127.0.0.1:8000', AI_BACKEND_SERVICE_SECRET: 's'.repeat(32) };

const issuesOf = (fn: () => unknown): readonly string[] => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError) return error.issues;
    throw error;
  }
  return [];
};

describe('AI backend configuration (Python is the only coach chat backend)', () => {
  it('loadConfig alone does not need the AI backend (db scripts such as seed keep working)', () => {
    const { aiBackend } = loadConfig(valid);
    expect(aiBackend).toEqual({ timeoutMs: 25_000 });
  });

  it('there is no flag any more: a leftover COACH_CHAT_BACKEND value is simply ignored', () => {
    expect(() => loadConfig({ ...withAi, COACH_CHAT_BACKEND: 'NODE_GEMINI' })).not.toThrow();
  });

  it('accepts a URL and a long secret, trimming whitespace, and a custom timeout', () => {
    const { aiBackend } = loadConfig({
      ...valid,
      AI_BACKEND_URL: ' http://127.0.0.1:8000 ',
      AI_BACKEND_SERVICE_SECRET: ` ${'s'.repeat(32)} `,
      AI_BACKEND_TIMEOUT_MS: '12000',
    });
    expect(aiBackend).toEqual({ url: 'http://127.0.0.1:8000', serviceSecret: 's'.repeat(32), timeoutMs: 12_000 });
  });

  it('assertAiBackendConfigured passes through a fully configured config', () => {
    const config = assertAiBackendConfigured(loadConfig(withAi));
    expect(config.aiBackend.url).toBe('http://127.0.0.1:8000');
    expect(config.aiBackend.serviceSecret).toBe('s'.repeat(32));
  });

  it('refuses to start without a URL and a secret, naming both keys', () => {
    const issues = issuesOf(() => assertAiBackendConfigured(loadConfig(valid)));
    expect(issues.some((i) => i.startsWith('AI_BACKEND_URL: required'))).toBe(true);
    expect(issues.some((i) => i.startsWith('AI_BACKEND_SERVICE_SECRET: required'))).toBe(true);
  });

  it('rejects a short secret and a non-http URL at load time, without echoing the secret', () => {
    const issues = issuesOf(() =>
      loadConfig({ ...valid, AI_BACKEND_URL: 'ftp://nope', AI_BACKEND_SERVICE_SECRET: 'too-short-secret' }),
    );
    expect(issues).toContain('AI_BACKEND_URL: must start with http:// or https://');
    expect(issues).toContain('AI_BACKEND_SERVICE_SECRET: must be at least 32 characters');
    expect(issues.join(' ')).not.toContain('too-short-secret');
  });

  it('rejects an HTTP timeout outside 1-28 seconds', () => {
    expect(issuesOf(() => loadConfig({ ...withAi, AI_BACKEND_TIMEOUT_MS: '60000' })).join(' ')).toContain(
      'AI_BACKEND_TIMEOUT_MS',
    );
  });
});
