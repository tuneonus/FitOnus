import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../../src/config/env.js';

const base = {
  DATABASE_URL: 'postgres://app:pw@localhost:5432/app_dev',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  HMAC_SECRET: 'b'.repeat(40),
  JWT_ISSUER: 'issuer',
  JWT_AUDIENCE: 'audience',
};

// Obviously fake key material: only the PEM header/footer shape matters to the config check.
const FAKE_PEM =
  '-----BEGIN PRIVATE KEY-----\nZmFrZS1rZXktbWF0ZXJpYWwtZm9yLXVuaXQtdGVzdHM=\n-----END PRIVATE KEY-----\n';
const account = {
  type: 'service_account',
  project_id: 'demo-project',
  client_email: 'sender@demo-project.iam.gserviceaccount.com',
  private_key: FAKE_PEM,
  token_uri: 'https://oauth2.googleapis.com/token',
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

describe('push notification configuration', () => {
  it('leaves push off (inbox still works) when no service account is configured', () => {
    const config = loadConfig(base);
    expect(config.notifications.fcm).toBeNull();
    expect(config.notifications.dispatcher).toEqual({
      enabled: true,
      pollIntervalMs: 10_000,
      maxAttempts: 4,
    });
    expect(config.notifications.dispatchSecret).toBeUndefined();
  });

  it('reads the raw service-account JSON', () => {
    const config = loadConfig({ ...base, FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(account) });
    expect(config.notifications.fcm).toMatchObject({
      projectId: 'demo-project',
      clientEmail: account.client_email,
      dryRun: false,
    });
  });

  it('reads the base64 variant', () => {
    const encoded = Buffer.from(JSON.stringify(account)).toString('base64');
    const config = loadConfig({ ...base, FCM_SERVICE_ACCOUNT_BASE64: encoded });
    expect(config.notifications.fcm?.projectId).toBe('demo-project');
  });

  it('lets FCM_PROJECT_ID override the key file and enables dry-run on request', () => {
    const config = loadConfig({
      ...base,
      FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(account),
      FCM_PROJECT_ID: 'other-project',
      FCM_DRY_RUN: 'true',
    });
    expect(config.notifications.fcm).toMatchObject({ projectId: 'other-project', dryRun: true });
  });

  it('refuses a token_uri that is not a Google endpoint', () => {
    const config = loadConfig({
      ...base,
      FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...account, token_uri: 'https://attacker.example/token' }),
    });
    expect(config.notifications.fcm?.tokenUri).toBe('https://oauth2.googleapis.com/token');
  });

  it('reports malformed credentials by variable name only, never echoing the content', () => {
    const issues = issuesOf({
      ...base,
      FCM_SERVICE_ACCOUNT_JSON: `{"private_key": "${FAKE_PEM.slice(0, 20)} oops`,
    });
    expect(issues).toEqual(['FCM_SERVICE_ACCOUNT_JSON: must be a service-account JSON document']);
    expect(issues.join(' ')).not.toContain('PRIVATE');
  });

  it('names every missing field without printing the key', () => {
    const issues = issuesOf({
      ...base,
      FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: '',
        private_key: 'not a key',
        project_id: '',
      }),
    });
    expect(issues.some((i) => i.includes('client_email'))).toBe(true);
    expect(issues.some((i) => i.includes('private_key'))).toBe(true);
    expect(issues.some((i) => i.includes('project_id'))).toBe(true);
    expect(issues.join(' ')).not.toContain('not a key');
  });

  it('requires a long dispatch secret when the external trigger is enabled', () => {
    expect(issuesOf({ ...base, NOTIFICATIONS_DISPATCH_SECRET: 'short' })).toEqual([
      'NOTIFICATIONS_DISPATCH_SECRET: must be at least 32 characters',
    ]);
    expect(
      loadConfig({ ...base, NOTIFICATIONS_DISPATCH_SECRET: 'c'.repeat(40) }).notifications.dispatchSecret,
    ).toHaveLength(40);
  });
});
