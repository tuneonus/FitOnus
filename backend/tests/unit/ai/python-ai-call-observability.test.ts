import { jwtVerify } from 'jose';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithAiRequestContext, type AiRequestContext } from '../../../src/shared/ai/ai-usage.js';
import { callPythonAi, pythonUsageSchema } from '../../../src/shared/ai/python-ai-call.js';
import { PythonAiClient, type AiUsageRecorder } from '../../../src/shared/ai/python-ai-client.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { runWithCorrelationId } from '../../../src/shared/logging/request-correlation.js';
import { createCapturingLogger } from '../../helpers/capture-logger.js';
import {
  closedPortUrl,
  json,
  okCoachReply,
  pythonError,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';
const CORRELATION_ID = 'req-7f3a9c1e-correlation';
const AI_REQUEST_ID = 'chat-lx3k9a-abc123';

const schema = z.object({ outcome: z.string(), usage: pythonUsageSchema });

describe('callPythonAi observability', () => {
  let server: FakePythonServer;
  let capture: ReturnType<typeof createCapturingLogger>;
  let recorder: { recordExternalUsage: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    server = await startFakePythonServer((_req, res) => json(res, 200, okCoachReply()));
    capture = createCapturingLogger();
    recorder = { recordExternalUsage: vi.fn().mockResolvedValue(undefined) };
  });
  afterEach(async () => {
    await server.close();
  });

  const call = (overrides: Partial<Parameters<typeof callPythonAi<typeof schema>>[0]> = {}) =>
    callPythonAi({
      client: new PythonAiClient({ baseUrl: server.url, serviceSecret: SECRET }),
      path: '/internal/v1/ai/coach/chat',
      scope: 'ai:coach:chat',
      userId: USER,
      requestId: AI_REQUEST_ID,
      timeoutMs: 2_000,
      body: { message: 'hi' },
      schema,
      feature: 'coach_chat',
      usageRecorder: recorder as unknown as AiUsageRecorder,
      logger: capture.logger,
      label: 'Python coach chat',
      unavailableMessage: 'The AI Coach is unavailable.',
      ...overrides,
    });
  const inRequest = <T>(work: () => Promise<T>) => runWithCorrelationId(CORRELATION_ID, work);
  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => undefined,
      (error: unknown) => error,
    );

  describe('correlation id propagation Node -> Python', () => {
    it('sends the HTTP request id as X-Correlation-Id, next to the unchanged per-call X-Request-Id', async () => {
      await inRequest(() => call());

      const sent = server.requests[0]!;
      expect(sent.headers['x-correlation-id']).toBe(CORRELATION_ID);
      expect(sent.headers['x-request-id']).toBe(AI_REQUEST_ID);
    });

    it('does not change the token: the call id stays the `rid` claim, the correlation id is not a claim', async () => {
      await inRequest(() => call());

      const token = String(server.requests[0]!.headers.authorization).replace('Bearer ', '');
      const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET));
      expect(payload).toMatchObject({ rid: AI_REQUEST_ID, sub: USER, scope: 'ai:coach:chat' });
      expect(JSON.stringify(payload)).not.toContain(CORRELATION_ID);
    });

    it('sends no correlation header outside an HTTP request', async () => {
      await call();
      expect(server.requests[0]!.headers).not.toHaveProperty('x-correlation-id');
    });

    it('puts the same id into the structured events, success and failure alike', async () => {
      await inRequest(() => call());
      server.respond((_r, res) => json(res, 503, pythonError('PROVIDER_UNAVAILABLE', 'busy')));
      await failure(inRequest(() => call()));

      const [completed] = capture.events('ai.call.completed');
      const [failed] = capture.events('ai.call.failed');
      expect(completed).toMatchObject({ correlationId: CORRELATION_ID, aiRequestId: AI_REQUEST_ID });
      expect(failed).toMatchObject({ correlationId: CORRELATION_ID, aiRequestId: AI_REQUEST_ID });
    });

    it('keeps concurrent requests apart', async () => {
      const ids = ['req-aaaaaaaa-0001', 'req-bbbbbbbb-0002', 'req-cccccccc-0003', 'req-dddddddd-0004'];
      await Promise.all(
        ids.map((id) =>
          runWithCorrelationId(id, () => call({ requestId: `chat-${id}`, body: { marker: id } })),
        ),
      );
      for (const sent of server.requests) {
        const marker = (sent.body as { marker: string }).marker;
        expect(sent.headers['x-correlation-id']).toBe(marker);
      }
    });
  });

  describe('structured event metadata', () => {
    it('logs one ai.call.completed event with feature, model, durations, tokens and no content', async () => {
      await inRequest(() => call());

      const events = capture.events('ai.call.completed');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        level: 'info',
        service: 'onusfit-api',
        event: 'ai.call.completed',
        feature: 'coach_chat',
        endpoint: '/internal/v1/ai/coach/chat',
        correlationId: CORRELATION_ID,
        aiRequestId: AI_REQUEST_ID,
        success: true,
        outcome: 'ok',
        errorCategory: null,
        model: 'gemini-3.5-flash-lite',
        modelFallbackUsed: false,
        geminiDurationMs: 1234,
        inputTokens: 900,
        outputTokens: 120,
        cachedTokens: 0,
        thinkingTokens: 30,
        totalTokens: 1050,
        msg: 'Python coach chat served',
      });
      expect(typeof events[0]!.durationMs).toBe('number');
      expect(capture.events('ai.call.failed')).toHaveLength(0);
    });

    it('reports when the backup model answered', async () => {
      server.respond((_r, res) =>
        json(
          res,
          200,
          okCoachReply({
            usage: { ...(okCoachReply().usage as object), model: 'backup-model', isFallback: true },
          }),
        ),
      );
      await call();
      expect(capture.events('ai.call.completed')[0]).toMatchObject({
        model: 'backup-model',
        modelFallbackUsed: true,
      });
    });

    it('marks an unusable model answer success:false with the invalid_ai_response category', async () => {
      server.respond((_r, res) => json(res, 200, okCoachReply({ outcome: 'unstructured' })));
      await call();
      expect(capture.events('ai.call.completed')[0]).toMatchObject({
        success: false,
        outcome: 'unstructured',
        errorCategory: 'invalid_ai_response',
      });
    });
  });

  describe('error classification over real HTTP', () => {
    const answer =
      (status: number, code: string, extra: Record<string, unknown> = {}) =>
      () =>
        server.respond((_r, res) =>
          json(res, status, pythonError(code, 'text that must never be logged', extra)),
        );

    it.each([
      ['Gemini timeout', answer(504, 'PROVIDER_TIMEOUT'), 'gemini_timeout', 'provider_timeout'],
      [
        'Gemini rate limit',
        answer(429, 'PROVIDER_RATE_LIMITED', { retryAfterSeconds: 25 }),
        'gemini_rate_limited',
        'provider_rate_limited',
      ],
      [
        'Gemini daily quota',
        answer(429, 'PROVIDER_QUOTA_EXHAUSTED'),
        'gemini_quota_exhausted',
        'provider_quota_exhausted',
      ],
      [
        'Gemini service unavailable',
        answer(503, 'PROVIDER_UNAVAILABLE'),
        'gemini_unavailable',
        'provider_unavailable',
      ],
      ['both models failed', answer(503, 'AI_UNAVAILABLE'), 'gemini_unavailable', 'provider_unavailable'],
      ['Gemini key rejected', answer(503, 'PROVIDER_AUTH_ERROR'), 'gemini_auth', 'misconfigured'],
      [
        'authentication failure',
        answer(401, 'AUTH_INVALID_TOKEN', { dispatched: false }),
        'auth_failure',
        'auth',
      ],
      [
        'contract mismatch',
        answer(422, 'INVALID_REQUEST', { dispatched: false }),
        'invalid_request',
        'invalid_request',
      ],
    ])('%s', async (_name, arrange, category, kind) => {
      arrange();
      await failure(inRequest(() => call()));

      const [event] = capture.events('ai.call.failed');
      expect(event).toMatchObject({
        level: 'error',
        success: false,
        errorCategory: category,
        errorKind: kind,
        feature: 'coach_chat',
      });
      expect(capture.text()).not.toContain('text that must never be logged');
    });

    it('Python service unavailable: nothing is listening', async () => {
      const client = new PythonAiClient({ baseUrl: await closedPortUrl(), serviceSecret: SECRET });
      await failure(inRequest(() => call({ client })));
      expect(capture.events('ai.call.failed')[0]).toMatchObject({
        errorCategory: 'python_unavailable',
        errorKind: 'unreachable',
        dispatched: false,
      });
    });

    it('Python service unavailable: the proxy answers 502 with a non-JSON body (restart / cold start)', async () => {
      server.respond((_r, res) => {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end('Bad Gateway');
      });
      await failure(inRequest(() => call()));
      expect(capture.events('ai.call.failed')[0]).toMatchObject({
        errorCategory: 'python_unavailable',
        httpStatus: 502,
      });
    });

    it('Python did not answer before our deadline', async () => {
      server.respond(() => undefined);
      await failure(inRequest(() => call({ timeoutMs: 100 })));
      expect(capture.events('ai.call.failed')[0]).toMatchObject({
        errorCategory: 'python_timeout',
        errorKind: 'timeout',
        dispatched: true,
      });
    });

    it('invalid AI response: a 200 that breaks the contract', async () => {
      server.respond((_r, res) => json(res, 200, { outcome: 'ok', usage: { model: 'x' } }));
      await failure(inRequest(() => call()));
      expect(capture.events('ai.call.failed')[0]).toMatchObject({
        errorCategory: 'invalid_ai_response',
        errorKind: 'invalid_response',
      });
    });

    it('a 500 from Python is internal_error, not "unavailable"', async () => {
      answer(500, 'SOMETHING_ELSE')();
      await failure(inRequest(() => call()));
      expect(capture.events('ai.call.failed')[0]).toMatchObject({
        errorCategory: 'internal_error',
        httpStatus: 500,
      });
    });

    it('the failed event records how long the call took', async () => {
      server.respond((_r, res) => json(res, 503, pythonError('PROVIDER_UNAVAILABLE', 'busy')));
      await failure(call());
      expect(capture.events('ai.call.failed')[0]!.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('existing behavior is preserved', () => {
    it('public errors keep their code, kind and details (the category is not added to them)', async () => {
      server.respond((_r, res) =>
        json(res, 429, pythonError('PROVIDER_RATE_LIMITED', 'Slow down.', { retryAfterSeconds: 25 })),
      );

      const error = await failure(call());

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        kind: 'rate_limited',
        code: 'RATE_LIMITED',
        details: { retryAfterSeconds: 25 },
      });
      expect(Object.keys(error as object)).not.toContain('errorCategory');
    });

    it('a failure after Gemini may have been called still keeps the quota unit consumed', async () => {
      server.respond((_r, res) =>
        json(res, 503, pythonError('PROVIDER_UNAVAILABLE', 'busy', { dispatched: true })),
      );
      const context: AiRequestContext = { userId: USER, action: 'coach_chat', dispatched: false };

      await failure(runWithAiRequestContext(context, () => call()));

      expect(context.dispatched).toBe(true);
    });

    it('a call that never reached Python still allows the refund', async () => {
      const context: AiRequestContext = { userId: USER, action: 'coach_chat', dispatched: false };
      const client = new PythonAiClient({ baseUrl: await closedPortUrl(), serviceSecret: SECRET });

      await failure(runWithAiRequestContext(context, () => call({ client })));

      expect(context.dispatched).toBe(false);
    });

    it('still writes exactly one usage-ledger row on success, none on failure, and a ledger failure never fails the call', async () => {
      await call();
      expect(recorder.recordExternalUsage).toHaveBeenCalledTimes(1);
      expect(recorder.recordExternalUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: AI_REQUEST_ID,
          userId: USER,
          feature: 'coach_chat',
          totalTokens: 1050,
        }),
      );

      recorder.recordExternalUsage.mockClear();
      recorder.recordExternalUsage.mockRejectedValue(new Error('db down'));
      await expect(call()).resolves.toMatchObject({ outcome: 'ok' });

      recorder.recordExternalUsage.mockClear();
      server.respond((_r, res) => json(res, 503, pythonError('PROVIDER_UNAVAILABLE', 'busy')));
      await failure(call());
      expect(recorder.recordExternalUsage).not.toHaveBeenCalled();
    });

    it('works with no logger at all', async () => {
      await expect(call({ logger: undefined })).resolves.toMatchObject({ outcome: 'ok' });
    });
  });

  describe('privacy: nothing but metadata is ever logged', () => {
    // Built at runtime so no literal in the repository looks like a real credential to secret scanners.
    const GOOGLE_KEY = 'AI' + 'za' + 'SyFAKE-FAKE-FAKE-FAKE-FAKE-1234567';
    const FAKE_JWT = [
      'ey' + 'JhbGciOiJIUzI1NiJ9',
      'ey' + 'JzdWIiOiIxMjM0NTY3ODkwIn0',
      'c2lnbmF0dXJlLXNpZ25hdHVyZQ',
    ].join('.');
    const SENTINELS = [
      'SENTINEL_USER_MESSAGE_I_weigh_91kg',
      'SENTINEL_FITNESS_CONTEXT_knee_surgery',
      'SENTINEL_IMAGE_BASE64_/9j/4AAQ',
      'SENTINEL_AUDIO_BASE64_UklGRg',
      'SENTINEL_EMAIL_someone@example.test',
      'SENTINEL_DISPLAY_NAME_Karthik',
    ];
    const sensitiveBody = {
      message: SENTINELS[0],
      context: { profile: { displayName: SENTINELS[5], injury: SENTINELS[1] } },
      image: { mimeType: 'image/jpeg', base64: SENTINELS[2] },
      audio: { mimeType: 'audio/m4a', base64: SENTINELS[3] },
      email: SENTINELS[4],
    };

    const expectNothingSensitive = () => {
      const logged = capture.text();
      for (const sentinel of SENTINELS) expect(logged).not.toContain(sentinel);
      for (const secret of [SECRET, GOOGLE_KEY, FAKE_JWT, 'Bearer ']) expect(logged).not.toContain(secret);
      expect(logged).not.toContain(USER); // the user id is never logged either
      expect(logged).not.toMatch(/authorization/i);
    };

    it('a successful call', async () => {
      await inRequest(() => call({ body: sensitiveBody }));
      expectNothingSensitive();
      expect(capture.lines.length).toBeGreaterThan(0);
    });

    it('failures whose error text is full of secrets and user content', async () => {
      const hostile = `${GOOGLE_KEY} Bearer ${FAKE_JWT} ${SENTINELS.join(' ')} ${SECRET}`;
      for (const [status, code] of [
        [503, 'PROVIDER_UNAVAILABLE'],
        [429, 'PROVIDER_RATE_LIMITED'],
        [401, 'AUTH_INVALID_TOKEN'],
        [422, 'INVALID_REQUEST'],
        [500, 'WHATEVER'],
      ] as const) {
        server.respond((_r, res) => json(res, status, pythonError(code, hostile)));
        await failure(inRequest(() => call({ body: sensitiveBody })));
      }
      expect(capture.events('ai.call.failed')).toHaveLength(5);
      expectNothingSensitive();
    });

    it('a 200 reply that echoes user content but breaks the contract', async () => {
      server.respond((_r, res) => json(res, 200, { outcome: 'ok', usage: 'bad', echoed: sensitiveBody }));
      await failure(inRequest(() => call({ body: sensitiveBody })));
      expectNothingSensitive();
    });

    it('an unreachable service', async () => {
      const client = new PythonAiClient({ baseUrl: await closedPortUrl(), serviceSecret: SECRET });
      await failure(call({ body: sensitiveBody, client }));
      expectNothingSensitive();
    });
  });
});
