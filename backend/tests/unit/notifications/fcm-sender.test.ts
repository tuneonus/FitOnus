import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyFcmError,
  FcmHttpV1Sender,
  safeTokenUri,
} from '../../../src/modules/notifications/infrastructure/fcm-push-sender.js';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const credentials = {
  projectId: 'demo-project',
  clientEmail: 'sender@demo-project.iam.gserviceaccount.com',
  privateKey,
  tokenUri: 'https://oauth2.googleapis.com/token',
};

const urlOf = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
const bodyOf = (init: RequestInit | undefined): string => (typeof init?.body === 'string' ? init.body : '');

const message = {
  token: 'TOKEN_THAT_MUST_NEVER_BE_LOGGED_0123456789',
  title: 'Hello',
  body: 'World',
  data: { notificationId: 'n1', category: 'announcements' },
  channelId: 'remote-updates',
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const tokenResponse = () => json(200, { access_token: 'oauth-access-token', expires_in: 3600 });

function fcmError(status: number, errorCode: string, grpc: string, text = 'failure') {
  return json(status, {
    error: { code: status, status: grpc, message: text, details: [{ '@type': 'FcmError', errorCode }] },
  });
}

describe('classifyFcmError', () => {
  it.each([
    [404, 'UNREGISTERED', 'NOT_FOUND', 'invalid_token'],
    [403, 'SENDER_ID_MISMATCH', 'PERMISSION_DENIED', 'invalid_token'],
    [429, 'QUOTA_EXCEEDED', 'RESOURCE_EXHAUSTED', 'retryable'],
    [503, 'UNAVAILABLE', 'UNAVAILABLE', 'retryable'],
    [500, 'INTERNAL', 'INTERNAL', 'retryable'],
    [401, 'THIRD_PARTY_AUTH_ERROR', 'UNAUTHENTICATED', 'retryable'],
  ])('maps %i %s to %s', (status, code, grpc, kind) => {
    const result = classifyFcmError(status, { error: { status: grpc, details: [{ errorCode: code }] } });
    expect(result.kind).toBe(kind);
  });

  it('treats a malformed registration token as an invalid token', () => {
    const result = classifyFcmError(400, {
      error: {
        status: 'INVALID_ARGUMENT',
        message: 'The registration token is not a valid FCM registration token',
        details: [{ errorCode: 'INVALID_ARGUMENT' }],
      },
    });
    expect(result).toEqual({ kind: 'invalid_token', code: 'INVALID_TOKEN' });
  });

  it('does not invalidate a device for a bad payload (INVALID_ARGUMENT about something else)', () => {
    const result = classifyFcmError(400, {
      error: {
        status: 'INVALID_ARGUMENT',
        message: 'Invalid value at message.data',
        details: [{ errorCode: 'INVALID_ARGUMENT' }],
      },
    });
    expect(result).toEqual({ kind: 'failed', code: 'INVALID_ARGUMENT' });
  });

  it('carries the provider retry hint', () => {
    expect(classifyFcmError(429, null, 12_000)).toEqual({
      kind: 'retryable',
      code: 'QUOTA_EXCEEDED',
      retryAfterMs: 12_000,
    });
  });

  it('falls back to a generic permanent failure', () => {
    expect(classifyFcmError(418, null)).toEqual({ kind: 'failed', code: 'HTTP_418' });
  });
});

describe('safeTokenUri', () => {
  it('only trusts Google token endpoints', () => {
    expect(safeTokenUri('https://oauth2.googleapis.com/token')).toBe('https://oauth2.googleapis.com/token');
    expect(safeTokenUri('https://evil.example/token')).toBe('https://oauth2.googleapis.com/token');
    expect(safeTokenUri('http://oauth2.googleapis.com/token')).toBe('https://oauth2.googleapis.com/token');
    expect(safeTokenUri(undefined)).toBe('https://oauth2.googleapis.com/token');
  });
});

describe('FcmHttpV1Sender', () => {
  const build = (fetchFn: typeof fetch, extra: { dryRun?: boolean } = {}) =>
    new FcmHttpV1Sender({ credentials, dryRun: extra.dryRun ?? false, timeoutMs: 2_000, fetch: fetchFn });

  it('signs a service-account assertion, then posts the message with a bearer token', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: urlOf(url), init: init! });
      return urlOf(url).includes('oauth2')
        ? tokenResponse()
        : json(200, { name: 'projects/demo-project/messages/abc' });
    });
    const result = await build(fetchFn as unknown as typeof fetch).send(message);

    expect(result).toEqual({ kind: 'accepted', messageId: 'projects/demo-project/messages/abc' });
    const [tokenCall, sendCall] = calls;
    expect(tokenCall!.url).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(bodyOf(tokenCall!.init));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const claims = JSON.parse(Buffer.from(form.get('assertion')!.split('.')[1]!, 'base64url').toString());
    expect(claims).toMatchObject({ iss: credentials.clientEmail, aud: credentials.tokenUri });
    expect(claims.scope).toContain('firebase.messaging');

    expect(sendCall!.url).toBe('https://fcm.googleapis.com/v1/projects/demo-project/messages:send');
    expect((sendCall!.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer oauth-access-token',
    );
    const body = JSON.parse(bodyOf(sendCall!.init));
    expect(body.validate_only).toBe(false);
    expect(body.message).toMatchObject({
      token: message.token,
      notification: { title: 'Hello', body: 'World' },
      data: { notificationId: 'n1', category: 'announcements' },
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: 'remote-updates',
          notification_priority: 'PRIORITY_HIGH',
          sound: 'default',
        },
      },
    });
  });

  it('asks FCM to validate only in dry-run mode', async () => {
    const bodies: { validate_only: boolean }[] = [];
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (urlOf(url).includes('oauth2')) return tokenResponse();
      bodies.push(JSON.parse(bodyOf(init)));
      return json(200, { name: 'x' });
    });
    const sender = build(fetchFn as unknown as typeof fetch, { dryRun: true });
    expect(sender.dryRun).toBe(true);
    await sender.send(message);
    expect(bodies[0]!.validate_only).toBe(true);
  });

  it('reuses the OAuth token across sends and shares one request between concurrent sends', async () => {
    let tokenRequests = 0;
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (urlOf(url).includes('oauth2')) {
        tokenRequests += 1;
        return tokenResponse();
      }
      return json(200, { name: 'x' });
    });
    const sender = build(fetchFn as unknown as typeof fetch);
    await Promise.all([sender.send(message), sender.send(message), sender.send(message)]);
    await sender.send(message);
    expect(tokenRequests).toBe(1);
  });

  it('renews the OAuth token once when FCM rejects it, then succeeds', async () => {
    let tokenRequests = 0;
    let sends = 0;
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (urlOf(url).includes('oauth2')) {
        tokenRequests += 1;
        return tokenResponse();
      }
      sends += 1;
      return sends === 1
        ? fcmError(401, 'THIRD_PARTY_AUTH_ERROR', 'UNAUTHENTICATED')
        : json(200, { name: 'ok' });
    });
    const result = await build(fetchFn as unknown as typeof fetch).send(message);
    expect(result.kind).toBe('accepted');
    expect(tokenRequests).toBe(2);
  });

  it('reports a refused OAuth exchange as retryable, never as an invalid token', async () => {
    const fetchFn = vi.fn(async () =>
      json(400, { error: 'invalid_grant', error_description: 'sensitive text' }),
    );
    const result = await build(fetchFn as unknown as typeof fetch).send(message);
    expect(result).toEqual({ kind: 'retryable', code: 'FCM_AUTH_FAILED' });
  });

  it('classifies network failures and timeouts as retryable', async () => {
    const network = vi.fn(async (url: string | URL | Request) => {
      if (urlOf(url).includes('oauth2')) return tokenResponse();
      throw new TypeError('fetch failed');
    });
    expect(await build(network as unknown as typeof fetch).send(message)).toEqual({
      kind: 'retryable',
      code: 'NETWORK_ERROR',
    });

    const timeout = vi.fn(async (url: string | URL | Request) => {
      if (urlOf(url).includes('oauth2')) return tokenResponse();
      throw new DOMException('timed out', 'TimeoutError');
    });
    expect(await build(timeout as unknown as typeof fetch).send(message)).toEqual({
      kind: 'retryable',
      code: 'TIMEOUT',
    });
  });

  it('parses Retry-After from a quota error', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      urlOf(url).includes('oauth2')
        ? tokenResponse()
        : json(
            429,
            { error: { status: 'RESOURCE_EXHAUSTED', details: [{ errorCode: 'QUOTA_EXCEEDED' }] } },
            { 'retry-after': '30' },
          ),
    );
    expect(await build(fetchFn as unknown as typeof fetch).send(message)).toEqual({
      kind: 'retryable',
      code: 'QUOTA_EXCEEDED',
      retryAfterMs: 30_000,
    });
  });

  it('never puts the device token or provider text into a result', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      urlOf(url).includes('oauth2')
        ? tokenResponse()
        : fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', `bad value ${message.token}`),
    );
    const result = await build(fetchFn as unknown as typeof fetch).send(message);
    expect(JSON.stringify(result)).not.toContain(message.token);
  });
});
