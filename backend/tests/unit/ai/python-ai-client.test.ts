import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PYTHON_AI_TOKEN_AUDIENCE,
  PYTHON_AI_TOKEN_ISSUER,
  PythonAiClient,
  PythonAiError,
} from '../../../src/shared/ai/python-ai-client.js';
import {
  closedPortUrl,
  json,
  pythonError,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';

const request = (overrides: Record<string, unknown> = {}) => ({
  path: '/internal/v1/ai/coach/chat',
  scope: 'ai:coach:chat',
  userId: USER,
  requestId: 'req-1',
  body: { message: 'hello' },
  timeoutMs: 2_000,
  ...overrides,
});

const failure = async (promise: Promise<unknown>): Promise<PythonAiError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PythonAiError) return error;
    throw error;
  }
  throw new Error('expected PythonAiError');
};

describe('PythonAiClient', () => {
  let server: FakePythonServer;
  let client: PythonAiClient;

  beforeEach(async () => {
    server = await startFakePythonServer();
    client = new PythonAiClient({ baseUrl: server.url, serviceSecret: SECRET });
  });
  afterEach(async () => {
    await server.close();
  });

  it('refuses a service secret shorter than 32 characters', () => {
    expect(() => new PythonAiClient({ baseUrl: server.url, serviceSecret: 'short' })).toThrow();
  });

  it('signs a short-lived HS256 token carrying the user, scope and request id', async () => {
    await client.postJson(request());

    const sent = server.requests[0]!;
    expect(sent.method).toBe('POST');
    expect(sent.url).toBe('/internal/v1/ai/coach/chat');
    expect(sent.headers['x-request-id']).toBe('req-1');

    const token = String(sent.headers.authorization).replace('Bearer ', '');
    const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      issuer: PYTHON_AI_TOKEN_ISSUER,
      audience: PYTHON_AI_TOKEN_AUDIENCE,
    });
    expect(protectedHeader.alg).toBe('HS256');
    expect(payload.sub).toBe(USER);
    expect(payload.scope).toBe('ai:coach:chat');
    expect(payload.rid).toBe('req-1');
    expect(typeof payload.jti).toBe('string');
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBeLessThanOrEqual(60);
  });

  it('forwards the HTTP request id as X-Correlation-Id without touching X-Request-Id or the token', async () => {
    await client.postJson(request({ correlationId: 'mobile-request-1234' }));

    const sent = server.requests[0]!;
    expect(sent.headers['x-correlation-id']).toBe('mobile-request-1234');
    expect(sent.headers['x-request-id']).toBe('req-1');
    const token = String(sent.headers.authorization).replace('Bearer ', '');
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET));
    expect(payload.rid).toBe('req-1');
  });

  it.each([undefined, '', 'short', 'has spaces in it!', 'line\r\nx-injected: 1', 'x'.repeat(200)])(
    'omits X-Correlation-Id when the id is absent or not header-safe (%j)',
    async (correlationId) => {
      await client.postJson(request({ correlationId }));
      expect(server.requests[0]!.headers).not.toHaveProperty('x-correlation-id');
    },
  );

  it('uses a fresh token id for every call (so replay protection works)', async () => {
    await client.postJson(request());
    await client.postJson(request());
    const jtis = server.requests.map((r) => {
      const token = String(r.headers.authorization).replace('Bearer ', '');
      return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')).jti as string;
    });
    expect(new Set(jtis).size).toBe(2);
  });

  it('never puts the user id or secret in the body or URL', async () => {
    await client.postJson(request());
    const sent = server.requests[0]!;
    expect(JSON.stringify(sent.body)).not.toContain(USER);
    expect(sent.url).not.toContain(USER);
    expect(JSON.stringify(sent)).not.toContain(SECRET);
  });

  it('resolves with the parsed JSON body on success', async () => {
    server.respond((_req, res) => json(res, 200, { hello: 'world' }));
    await expect(client.postJson(request())).resolves.toEqual({ hello: 'world' });
  });

  it.each([
    [401, 'AUTH_INVALID_TOKEN', 'auth', false],
    [503, 'AUTH_NOT_CONFIGURED', 'misconfigured', false],
    [503, 'PROVIDER_NOT_CONFIGURED', 'misconfigured', false],
    [503, 'PROVIDER_AUTH_ERROR', 'misconfigured', true],
    [422, 'INVALID_REQUEST', 'invalid_request', false],
    [429, 'PROVIDER_RATE_LIMITED', 'provider_rate_limited', true],
    [429, 'PROVIDER_QUOTA_EXHAUSTED', 'provider_quota_exhausted', true],
    [503, 'PROVIDER_UNAVAILABLE', 'provider_unavailable', true],
    [503, 'AI_UNAVAILABLE', 'provider_unavailable', false],
    [504, 'PROVIDER_TIMEOUT', 'provider_timeout', true],
    [503, 'PROVIDER_ERROR', 'provider_error', true],
  ])('maps %i %s to kind "%s"', async (status, code, kind, dispatched) => {
    server.respond((_req, res) =>
      json(res, status, { error: { code, message: 'safe message', dispatched, retryAfterSeconds: 12 } }),
    );

    const error = await failure(client.postJson(request()));

    expect(error.kind).toBe(kind);
    expect(error.dispatched).toBe(dispatched);
    expect(error.info.status).toBe(status);
    expect(error.info.retryAfterSeconds).toBe(12);
  });

  it('treats only Python-side problems as eligible for the Node fallback', async () => {
    const eligible = new Map<string, boolean>();
    for (const [status, code] of [
      [401, 'AUTH_INVALID_TOKEN'],
      [422, 'INVALID_REQUEST'],
      [500, 'INTERNAL_ERROR'],
      [429, 'PROVIDER_RATE_LIMITED'],
      [503, 'AI_UNAVAILABLE'],
      [504, 'PROVIDER_TIMEOUT'],
    ] as const) {
      server.respond((_req, res) => json(res, status, pythonError(code, 'x')));
      eligible.set(code, (await failure(client.postJson(request()))).fallbackEligible);
    }
    expect(Object.fromEntries(eligible)).toEqual({
      AUTH_INVALID_TOKEN: true,
      INVALID_REQUEST: true,
      INTERNAL_ERROR: true,
      PROVIDER_RATE_LIMITED: false,
      AI_UNAVAILABLE: false,
      PROVIDER_TIMEOUT: false,
    });
  });

  it('assumes Gemini may have been called when a 5xx has no explanation', async () => {
    server.respond((_req, res) => {
      res.writeHead(502);
      res.end('<html>bad gateway</html>');
    });
    const error = await failure(client.postJson(request()));
    expect(error.kind).toBe('server_error');
    expect(error.dispatched).toBe(true);
  });

  it('reports a timeout as dispatched (Python may still be calling Gemini)', async () => {
    server.respond(() => undefined); // never answers
    const error = await failure(client.postJson(request({ timeoutMs: 100 })));
    expect(error.kind).toBe('timeout');
    expect(error.dispatched).toBe(true);
    expect(error.fallbackEligible).toBe(true);
  });

  it('reports connection refused as NOT dispatched (nothing was sent)', async () => {
    const dead = new PythonAiClient({ baseUrl: await closedPortUrl(), serviceSecret: SECRET });
    const error = await failure(dead.postJson(request()));
    expect(error.kind).toBe('unreachable');
    expect(error.dispatched).toBe(false);
    expect(error.fallbackEligible).toBe(true);
  });

  it('rejects a 200 response that is not JSON', async () => {
    server.respond((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello');
    });
    const error = await failure(client.postJson(request()));
    expect(error.kind).toBe('invalid_response');
  });

  it('truncates very long error messages from the other side', async () => {
    server.respond((_req, res) => json(res, 500, pythonError('INTERNAL_ERROR', 'x'.repeat(5_000))));
    const error = await failure(client.postJson(request()));
    expect(error.message.length).toBeLessThanOrEqual(300);
  });
});
