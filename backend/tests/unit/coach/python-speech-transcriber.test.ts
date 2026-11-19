import express from 'express';
import { jwtVerify } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import {
  PythonSpeechTranscriber,
  TRANSCRIBE_UNAVAILABLE_MESSAGE,
} from '../../../src/modules/coach/infrastructure/python-speech-transcriber.js';
import { createCoachController } from '../../../src/modules/coach/interface/coach.controller.js';
import { createCoachRoutes } from '../../../src/modules/coach/interface/coach.routes.js';
import { AiTimeoutError } from '../../../src/shared/ai/ai-timeout.js';
import { currentAiRequestContext } from '../../../src/shared/ai/ai-usage.js';
import { PythonAiClient, type AiUsageRecorder } from '../../../src/shared/ai/python-ai-client.js';
import { isAppError } from '../../../src/shared/errors/app-error.js';
import {
  closedPortUrl,
  json,
  okTranscribeReply,
  pythonError,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';
const AUDIO = { mimeType: 'audio/m4a', base64: 'AAECAw==' };

describe('PythonSpeechTranscriber (POST /coach/transcribe)', () => {
  let server: FakePythonServer;
  let recorder: { recordExternalUsage: ReturnType<typeof vi.fn> };

  const build = (overrides: { baseUrl?: string; pythonTimeoutMs?: number; models?: { primary: string; fallback: string | null } } = {}) =>
    new PythonSpeechTranscriber({
      client: new PythonAiClient({ baseUrl: overrides.baseUrl ?? server.url, serviceSecret: SECRET }),
      resolveModels: () => Promise.resolve(overrides.models ?? { primary: 'coach-primary', fallback: 'coach-backup' }),
      usageRecorder: recorder as unknown as AiUsageRecorder,
      pythonTimeoutMs: overrides.pythonTimeoutMs ?? 5_000,
    });
  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

  beforeEach(async () => {
    server = await startFakePythonServer((_r, res) => json(res, 200, okTranscribeReply()));
    recorder = { recordExternalUsage: vi.fn().mockResolvedValue(undefined) };
  });
  afterEach(async () => {
    await server.close();
  });

  describe('success', () => {
    it('returns exactly {transcript, detectedLanguage}, the shape the app has always received', async () => {
      const result = await build().transcribe(USER, AUDIO);
      expect(result).toEqual({ transcript: 'inniku leg workout mudichiten', detectedLanguage: 'tanglish' });
    });

    it('works WITHOUT an AI quota gate context (transcription has no quota gate, unchanged)', async () => {
      expect(currentAiRequestContext()).toBeUndefined();
      await expect(build().transcribe(USER, AUDIO)).resolves.toMatchObject({ detectedLanguage: 'tanglish' });
    });

    it('sends the clip, the admin-configured models and a deadline - and never the user id', async () => {
      await build().transcribe(USER, AUDIO);

      const sent = server.requests[0]!;
      expect(sent.url).toBe('/internal/v1/ai/speech/transcribe');
      expect(sent.body).toEqual({
        audio: AUDIO,
        model: { primary: 'coach-primary', fallback: 'coach-backup' },
        deadlineMs: 3_500, // 5000 ms HTTP timeout minus a 1500 ms margin
      });
      expect(JSON.stringify(sent.body)).not.toContain(USER);
    });

    it('identifies the user only through a signed token scoped to transcription', async () => {
      await build().transcribe(USER, AUDIO);
      const token = String(server.requests[0]!.headers.authorization).replace('Bearer ', '');
      const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
        issuer: 'onusfit-node-api',
        audience: 'onusfit-ai-backend',
      });
      expect([payload.sub, payload.scope]).toEqual([USER, 'ai:speech:transcribe']);
    });

    it('records tokens once, attributed to the user (the old path recorded a null user)', async () => {
      await build().transcribe(USER, AUDIO);
      expect(recorder.recordExternalUsage).toHaveBeenCalledTimes(1);
      expect(recorder.recordExternalUsage).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER, feature: 'coach_chat', model: 'gemini-3.5-flash-lite', totalTokens: 330 }),
      );
    });

    it('does not fail the request when the usage ledger write fails', async () => {
      recorder.recordExternalUsage.mockRejectedValue(new Error('db down'));
      await expect(build().transcribe(USER, AUDIO)).resolves.toMatchObject({ transcript: expect.any(String) });
    });

    it('sends a null fallback when none is configured', async () => {
      await build({ models: { primary: 'only', fallback: null } }).transcribe(USER, AUDIO);
      expect((server.requests[0]!.body as { model: unknown }).model).toEqual({ primary: 'only', fallback: null });
    });
  });

  describe('failures: one controlled error, never a second AI call', () => {
    it('Python unreachable: 503 with the existing transcription message', async () => {
      const error = await failure(build({ baseUrl: await closedPortUrl() }).transcribe(USER, AUDIO));
      expect(isAppError(error) && [error.kind, error.code, error.message]).toEqual([
        'unavailable',
        'SERVICE_UNAVAILABLE',
        TRANSCRIBE_UNAVAILABLE_MESSAGE,
      ]);
    });

    it('Python timeout: the standard AI timeout error, one call, no retry', async () => {
      server.respond(() => undefined);
      const error = await failure(build({ pythonTimeoutMs: 100 }).transcribe(USER, AUDIO));
      expect(error).toBeInstanceOf(AiTimeoutError);
      expect(server.requests).toHaveLength(1);
    });

    it.each([
      ['wrong service secret (Python 401)', 401, pythonError('AUTH_INVALID_TOKEN', 'x', { dispatched: false })],
      ['contract mismatch (422)', 422, pythonError('INVALID_REQUEST', 'x', { dispatched: false })],
      ['Python has no Gemini key', 503, pythonError('PROVIDER_NOT_CONFIGURED', 'x', { dispatched: false })],
      ['Python crashed (500)', 500, pythonError('INTERNAL_ERROR', 'boom')],
    ])('%s: controlled 503, exactly one call', async (_n, status, body) => {
      server.respond((_r, res) => json(res, status, body));
      const error = await failure(build().transcribe(USER, AUDIO));
      expect(isAppError(error) && [error.code, error.message]).toEqual(['SERVICE_UNAVAILABLE', TRANSCRIBE_UNAVAILABLE_MESSAGE]);
      expect(server.requests).toHaveLength(1);
    });

    it.each([
      ['malformed body', { outcome: 'ok', result: { transcript: 123 } }],
      ['missing usage', { outcome: 'ok', result: { transcript: 'x', detectedLanguage: 'en' }, traceId: 't' }],
      ['unknown outcome', okTranscribeReply({ outcome: 'weird' })],
    ])('invalid Python response (%s): controlled 503, nothing recorded', async (_n, body) => {
      server.respond((_r, res) => json(res, 200, body));
      const error = await failure(build().transcribe(USER, AUDIO));
      expect(isAppError(error) && error.code).toBe('SERVICE_UNAVAILABLE');
      expect(recorder.recordExternalUsage).not.toHaveBeenCalled();
    });

    it.each([
      ['PROVIDER_RATE_LIMITED', 429, 'RATE_LIMITED'],
      ['PROVIDER_QUOTA_EXHAUSTED', 429, 'AI_QUOTA_EXCEEDED'],
      ['AI_UNAVAILABLE', 503, 'AI_UNAVAILABLE'],
      ['PROVIDER_UNAVAILABLE', 503, 'SERVICE_UNAVAILABLE'],
    ])('Gemini error %s maps to %s', async (pyCode, status, publicCode) => {
      server.respond((_r, res) => json(res, status, pythonError(pyCode, 'safe', { retryAfterSeconds: 25 })));
      const error = await failure(build().transcribe(USER, AUDIO));
      expect(isAppError(error) && error.code).toBe(publicCode);
      expect(server.requests).toHaveLength(1);
    });

    it('a Gemini timeout inside Python maps to the standard timeout error', async () => {
      server.respond((_r, res) => json(res, 504, pythonError('PROVIDER_TIMEOUT', 'timed out')));
      expect(await failure(build().transcribe(USER, AUDIO))).toBeInstanceOf(AiTimeoutError);
    });
  });

  describe('through the real route and controller: the public mobile contract', () => {
    const appFor = (transcriber: PythonSpeechTranscriber) => {
      const controller = createCoachController({
        chatWithCoach: { execute: vi.fn() } as never,
        getCoachInsights: { execute: vi.fn() } as never,
        speechTranscriber: transcriber,
      });
      const group = createCoachRoutes('/api/v1/coach', controller);
      const app = express();
      app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
      app.use(express.json());
      const authenticate: express.RequestHandler = (req, _res, next) => {
        req.actor = createActor({ userId: USER, sessionId: 's1', role: 'member' });
        next();
      };
      app.use(group.basePath, buildRouter(group.routes, { authenticate }));
      app.use(notFoundHandler);
      app.use(errorHandler);
      return app;
    };
    const post = (app: express.Express, audio: object = AUDIO) =>
      request(app).post('/api/v1/coach/transcribe').send({ audio });

    it('200 {success, data:{transcript, detectedLanguage}, message}', async () => {
      const res = await post(appFor(build()));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: 'Audio transcribed successfully',
        data: { transcript: 'inniku leg workout mudichiten', detectedLanguage: 'tanglish' },
      });
    });

    it('invalid audio format: 400 VALIDATION_FAILED and Python is never called', async () => {
      const res = await post(appFor(build()), { mimeType: 'audio/flac', base64: 'AAAA' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(server.requests).toHaveLength(0);
    });

    it('Python unavailable: 503 envelope with the existing message', async () => {
      const res = await post(appFor(build({ baseUrl: await closedPortUrl() })));
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: TRANSCRIBE_UNAVAILABLE_MESSAGE } });
    });

    it('wrong service secret: the same controlled 503, no internals in the body', async () => {
      const wrong = new PythonSpeechTranscriber({
        client: new PythonAiClient({ baseUrl: server.url, serviceSecret: 'x'.repeat(40) }),
        resolveModels: () => Promise.resolve({ primary: 'p', fallback: null }),
        pythonTimeoutMs: 5_000,
      });
      server.respond((_r, res) => json(res, 401, pythonError('AUTH_INVALID_TOKEN', 'Invalid service token.', { dispatched: false })));
      const res = await post(appFor(wrong));
      expect(res.status).toBe(503);
      expect(JSON.stringify(res.body)).not.toMatch(/token|secret|401/i);
    });

    it('Gemini rate limit: 429 RATE_LIMITED', async () => {
      server.respond((_r, res) => json(res, 429, pythonError('PROVIDER_RATE_LIMITED', 'Busy', { retryAfterSeconds: 25 })));
      const res = await post(appFor(build()));
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });

    it('timeout: 503 "AI request timed out"', async () => {
      server.respond(() => undefined);
      const res = await post(appFor(build({ pythonTimeoutMs: 100 })));
      expect(res.status).toBe(503);
      expect(res.body.error.message).toBe('AI request timed out. Please try again.');
    });
  });
});
