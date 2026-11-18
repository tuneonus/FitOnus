import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachResponse, UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import {
  AI_BACKEND_UNAVAILABLE_MESSAGE,
  PythonCoachChatService,
} from '../../../src/modules/coach/infrastructure/python-coach-chat-service.js';
import { coachResponseSchema } from '../../../src/modules/coach/interface/coach.schemas.js';
import { AiTimeoutError } from '../../../src/shared/ai/ai-timeout.js';
import { runWithAiRequestContext, type AiRequestContext } from '../../../src/shared/ai/ai-usage.js';
import { PythonAiClient, type AiUsageRecorder } from '../../../src/shared/ai/python-ai-client.js';
import { isAppError } from '../../../src/shared/errors/app-error.js';
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

const context = {
  profile: { displayName: 'Arun', sex: null, age: 29 },
  todayNutrition: { caloriesConsumed: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0, waterIntakeMl: 0 },
  recentWorkouts: [],
  todayPlannedWorkout: null,
  activeGoals: [],
  latestWeightKg: null,
} as unknown as UserFitnessContext;

describe('PythonCoachChatService (the only coach chat implementation)', () => {
  let server: FakePythonServer;
  let recorder: { recordExternalUsage: ReturnType<typeof vi.fn> };
  let aiContext: AiRequestContext;
  let models: { primary: string; fallback: string | null };

  const build = (overrides: { baseUrl?: string; pythonTimeoutMs?: number } = {}) =>
    new PythonCoachChatService({
      client: new PythonAiClient({ baseUrl: overrides.baseUrl ?? server.url, serviceSecret: SECRET }),
      resolveModels: () => Promise.resolve(models),
      usageRecorder: recorder as unknown as AiUsageRecorder,
      pythonTimeoutMs: overrides.pythonTimeoutMs ?? 5_000,
    });

  /** Runs inside the same AsyncLocalStorage context the AI usage gate creates in production. */
  const generate = (service: PythonCoachChatService, history = [], memories: string[] = []) =>
    runWithAiRequestContext(aiContext, () =>
      service.generateCoachResponse('How much protein?', context, history, memories),
    );

  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

  beforeEach(async () => {
    server = await startFakePythonServer();
    recorder = { recordExternalUsage: vi.fn().mockResolvedValue(undefined) };
    aiContext = { userId: USER, action: 'coach_chat', dispatched: false };
    models = { primary: 'primary-model', fallback: 'fallback-model' };
  });
  afterEach(async () => {
    await server.close();
  });

  describe('success', () => {
    it('returns the Python reply in the existing mobile-compatible shape', async () => {
      const response = await generate(build());

      expect(response).toEqual({
        text: 'Great consistency! Add 20 g of protein at dinner.',
        followUps: ['What should I eat?'],
        sources: ['Profile', "Today's Nutrition"],
        medicalNote: false,
      });
      expect(() => coachResponseSchema.parse(response)).not.toThrow(); // the public route's output schema
      expect(server.requests).toHaveLength(1);
    });

    it('omits optional fields Python left null (no medicalNote/blocks keys)', async () => {
      server.respond((_r, res) =>
        json(res, 200, okCoachReply({ result: { text: 't', followUps: [], sources: [], medicalNote: null, blocks: null } })),
      );
      const response: CoachResponse = await generate(build());
      expect(response).toEqual({ text: 't', followUps: [], sources: [] });
      expect('medicalNote' in response).toBe(false);
      expect('blocks' in response).toBe(false);
    });

    it('passes blocks through when present', async () => {
      const blocks = [{ type: 'metrics', title: 'T', items: [] }];
      server.respond((_r, res) =>
        json(res, 200, okCoachReply({ result: { text: 't', followUps: [], sources: [], blocks } })),
      );
      expect((await generate(build())).blocks).toEqual(blocks);
    });

    it('sends context, history, memories, models and a deadline - and no user id', async () => {
      const history = [{ role: 'user' as const, text: 'earlier question' }];
      await generate(build(), history as never, ['[FOOD]: vegetarian']);

      const sent = server.requests[0]!;
      expect(sent.body).toEqual({
        message: 'How much protein?',
        context,
        history,
        memories: ['[FOOD]: vegetarian'],
        model: { primary: 'primary-model', fallback: 'fallback-model' },
        deadlineMs: 3_500, // 5000 ms HTTP timeout minus a 1500 ms margin, so Python can answer before we give up
      });
      expect(JSON.stringify(sent.body)).not.toContain(USER);
    });

    it('forwards the admin-configured primary and fallback model names (Python applies the fallback)', async () => {
      models = { primary: 'gemini-x-primary', fallback: 'gemini-x-backup' };
      await generate(build());
      expect((server.requests[0]!.body as { model: unknown }).model).toEqual({
        primary: 'gemini-x-primary',
        fallback: 'gemini-x-backup',
      });
    });

    it('sends fallback null when no fallback model is configured', async () => {
      models = { primary: 'only-model', fallback: null };
      await generate(build());
      expect((server.requests[0]!.body as { model: unknown }).model).toEqual({ primary: 'only-model', fallback: null });
    });

    it('identifies the user only through the signed token', async () => {
      await generate(build());
      const token = String(server.requests[0]!.headers.authorization).replace('Bearer ', '');
      const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
        issuer: 'onusfit-node-api',
        audience: 'onusfit-ai-backend',
      });
      expect(payload.sub).toBe(USER);
      expect(payload.scope).toBe('ai:coach:chat');
    });

    it('marks the request as dispatched so the quota unit is not refunded', async () => {
      await generate(build());
      expect(aiContext.dispatched).toBe(true);
    });

    it('records tokens, model and Python-side fallback usage in the ledger exactly once', async () => {
      server.respond((_r, res) =>
        json(res, 200, okCoachReply({ usage: { ...(okCoachReply().usage as object), model: 'fallback-model', isFallback: true } })),
      );
      await generate(build());

      expect(recorder.recordExternalUsage).toHaveBeenCalledTimes(1);
      expect(recorder.recordExternalUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER,
          feature: 'coach_chat',
          model: 'fallback-model',
          isFallback: true,
          inputTokens: 900,
          outputTokens: 120,
          totalTokens: 1050,
        }),
      );
    });

    it('does not fail the chat when the usage ledger write fails', async () => {
      recorder.recordExternalUsage.mockRejectedValue(new Error('db down'));
      await expect(generate(build())).resolves.toMatchObject({ text: expect.any(String) });
    });
  });

  describe('Python cannot answer: one controlled error, no second AI call', () => {
    it('Python unreachable: 503 SERVICE_UNAVAILABLE and NOT dispatched (quota can be refunded)', async () => {
      const error = await failure(generate(build({ baseUrl: await closedPortUrl() })));

      expect(isAppError(error) && [error.kind, error.code, error.message]).toEqual([
        'unavailable',
        'SERVICE_UNAVAILABLE',
        AI_BACKEND_UNAVAILABLE_MESSAGE,
      ]);
      expect(aiContext.dispatched).toBe(false);
    });

    it('Python timeout: the standard AI timeout error, dispatched (Gemini may have been billed)', async () => {
      server.respond(() => undefined); // never answers

      const error = await failure(generate(build({ pythonTimeoutMs: 100 })));

      expect(error).toBeInstanceOf(AiTimeoutError);
      expect(aiContext.dispatched).toBe(true);
      expect(server.requests).toHaveLength(1); // no retry
    });

    it('invalid service token (401): controlled 503, NOT dispatched, details never leak', async () => {
      server.respond((_r, res) =>
        json(res, 401, pythonError('AUTH_INVALID_TOKEN', 'Invalid service token.', { dispatched: false })),
      );

      const error = await failure(generate(build()));

      expect(isAppError(error) && [error.code, error.message]).toEqual(['SERVICE_UNAVAILABLE', AI_BACKEND_UNAVAILABLE_MESSAGE]);
      expect(aiContext.dispatched).toBe(false);
      expect(JSON.stringify(error)).not.toContain('token');
    });

    it.each([
      ['500 internal error', 500, pythonError('INTERNAL_ERROR', 'boom'), true],
      ['422 contract mismatch', 422, pythonError('INVALID_REQUEST', 'bad', { dispatched: false }), false],
      ['503 Python has no Gemini key', 503, pythonError('PROVIDER_NOT_CONFIGURED', 'no key', { dispatched: false }), false],
      ['503 Gemini key rejected', 503, pythonError('PROVIDER_AUTH_ERROR', 'bad key'), true],
      ['503 unknown provider error', 503, pythonError('PROVIDER_ERROR', 'x'), true],
    ])('%s: controlled 503, exactly one call, dispatched=%s', async (_name, status, body, dispatched) => {
      server.respond((_r, res) => json(res, status, body));

      const error = await failure(generate(build()));

      expect(isAppError(error) && error.code).toBe('SERVICE_UNAVAILABLE');
      expect(server.requests).toHaveLength(1); // never retried, never sent anywhere else
      expect(aiContext.dispatched).toBe(dispatched);
    });

    it('invalid Python response (200 but wrong shape): controlled 503, dispatched, nothing recorded', async () => {
      server.respond((_r, res) => json(res, 200, { outcome: 'ok', result: { text: 123 } }));

      const error = await failure(generate(build()));

      expect(isAppError(error) && error.code).toBe('SERVICE_UNAVAILABLE');
      expect(aiContext.dispatched).toBe(true);
      expect(recorder.recordExternalUsage).not.toHaveBeenCalled();
    });

    it('refuses to run without an AI request context (chat must go through the quota gate)', async () => {
      const error = await failure(build().generateCoachResponse('hi', context));
      expect(isAppError(error) && error.code).toBe('INTERNAL_ERROR');
      expect(server.requests).toHaveLength(0);
    });
  });

  describe('Gemini problems reported by Python', () => {
    it.each([
      ['PROVIDER_RATE_LIMITED', 429, 'RATE_LIMITED', { retryAfterSeconds: 25 }],
      ['PROVIDER_QUOTA_EXHAUSTED', 429, 'AI_QUOTA_EXCEEDED', { retryAfterSeconds: 86400 }],
      ['AI_UNAVAILABLE', 503, 'AI_UNAVAILABLE', { retryAfterSeconds: 20 }],
      ['PROVIDER_UNAVAILABLE', 503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 15 }],
    ])('maps %s to the public error %s', async (pyCode, status, publicCode, extra) => {
      server.respond((_r, res) => json(res, status, pythonError(pyCode, 'safe text', extra)));

      const error = await failure(generate(build()));

      expect(isAppError(error) && error.code).toBe(publicCode);
      expect(aiContext.dispatched).toBe(true);
    });

    it('keeps retryAfterSeconds on the rate-limit error (Gemini rate-limit)', async () => {
      server.respond((_r, res) => json(res, 429, pythonError('PROVIDER_RATE_LIMITED', 'slow', { retryAfterSeconds: 25 })));
      const error = await failure(generate(build()));
      expect(isAppError(error) && [error.kind, error.details]).toEqual(['rate_limited', { retryAfterSeconds: 25 }]);
    });

    it('maps a Gemini timeout inside Python to the standard timeout error', async () => {
      server.respond((_r, res) => json(res, 504, pythonError('PROVIDER_TIMEOUT', 'timed out')));
      expect(await failure(generate(build()))).toBeInstanceOf(AiTimeoutError);
    });
  });
});
