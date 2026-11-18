import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PythonVoiceMealService } from '../../../src/modules/nutrition/infrastructure/python-voice-meal-service.js';
import { voiceMealResponseSchema } from '../../../src/modules/nutrition/interface/voice-meal.schemas.js';
import { AiTimeoutError } from '../../../src/shared/ai/ai-timeout.js';
import { runWithAiRequestContext, type AiRequestContext } from '../../../src/shared/ai/ai-usage.js';
import { PythonAiClient, type AiUsageRecorder } from '../../../src/shared/ai/python-ai-client.js';
import { isAppError } from '../../../src/shared/errors/app-error.js';
import {
  closedPortUrl,
  json,
  okVoiceReply,
  pythonError,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';

describe('PythonVoiceMealService', () => {
  let server: FakePythonServer;
  let recorder: { recordExternalUsage: ReturnType<typeof vi.fn> };
  let aiContext: AiRequestContext;

  const build = (overrides: { baseUrl?: string; pythonTimeoutMs?: number } = {}) =>
    new PythonVoiceMealService({
      client: new PythonAiClient({ baseUrl: overrides.baseUrl ?? server.url, serviceSecret: SECRET }),
      resolveModels: () => Promise.resolve({ primary: 'voice-primary', fallback: 'voice-backup' }),
      usageRecorder: recorder as unknown as AiUsageRecorder,
      pythonTimeoutMs: overrides.pythonTimeoutMs ?? 5_000,
    });

  const parse = (
    service: PythonVoiceMealService,
    params: Parameters<PythonVoiceMealService['parseVoiceMeal']>[0] = { transcript: 'rendu dosai' },
  ) => runWithAiRequestContext(aiContext, () => service.parseVoiceMeal(params));
  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

  beforeEach(async () => {
    server = await startFakePythonServer((_r, res) => json(res, 200, okVoiceReply()));
    recorder = { recordExternalUsage: vi.fn().mockResolvedValue(undefined) };
    aiContext = { userId: USER, action: 'voice_meal', dispatched: false };
  });
  afterEach(async () => {
    await server.close();
  });

  describe('success', () => {
    it('returns the existing mobile-compatible result and passes the public output schema', async () => {
      const result = await parse(build());

      expect(() => voiceMealResponseSchema.parse(result)).not.toThrow();
      expect(result).toEqual({
        transcript: 'rendu dosai, sambar',
        detectedLanguage: 'tanglish',
        items: [
          {
            id: 'voice-food-1700000000000-0',
            name: 'Dosa',
            brand: 'AI Voice Estimate',
            serving: '2 pieces · 160 g',
            servingWeightG: 160,
            servingUnit: 'piece',
            servingSize: 2,
            kcal: 260,
            protein: 6,
            carbs: 44,
            fat: 7,
            fiber: 2,
            confidence: 'high',
            isAiEstimated: true,
          },
        ],
        confidence: 'high',
        totalKcal: 260,
        totalProteinGrams: 6,
        totalCarbsGrams: 44,
        totalFatGrams: 7,
        totalFiberGrams: 2,
        parsedAt: '2026-11-18T10:00:00.000Z',
      });
      expect('unclearReason' in result).toBe(false); // null from Python becomes an absent key, as before
    });

    it('keeps unclearReason when present', async () => {
      server.respond((_r, res) =>
        json(res, 200, okVoiceReply({ outcome: 'no_food', result: { ...(okVoiceReply().result as object), items: [], unclearReason: 'No food mentioned.' } })),
      );
      expect((await parse(build())).unclearReason).toBe('No food mentioned.');
    });

    it('a model reply Python could not parse is still a normal 200 result (behavior unchanged), not an error', async () => {
      const notFormatted = {
        transcript: 'two dosa',
        detectedLanguage: 'en',
        items: [],
        confidence: 'low',
        totalKcal: 0,
        totalProteinGrams: 0,
        totalCarbsGrams: 0,
        totalFatGrams: 0,
        totalFiberGrams: 0,
        unclearReason: 'AI response was not formatted correctly. Please try again.',
        parsedAt: '2026-11-18T10:00:00.000Z',
      };
      server.respond((_r, res) => json(res, 200, okVoiceReply({ outcome: 'parse_failed', result: notFormatted })));

      const result = await parse(build());

      expect(result.items).toEqual([]);
      expect(result.unclearReason).toMatch(/not formatted correctly/);
      expect(() => voiceMealResponseSchema.parse(result)).not.toThrow();
    });

    it('sends a transcript request without audio, with models and a deadline - and no user id', async () => {
      await parse(build(), { transcript: 'rendu dosai', lang: 'ta', mealType: 'breakfast' });

      const sent = server.requests[0]!;
      expect(sent.url).toBe('/internal/v1/ai/meals/parse-voice');
      expect(sent.body).toEqual({
        transcript: 'rendu dosai',
        lang: 'ta',
        mealType: 'breakfast',
        model: { primary: 'voice-primary', fallback: 'voice-backup' },
        deadlineMs: 3_500, // 5000 ms HTTP timeout minus a 1500 ms margin
      });
      expect(JSON.stringify(sent.body)).not.toContain(USER);
    });

    it('sends an audio request with the clip and no transcript key', async () => {
      await parse(build(), { audio: { mimeType: 'audio/m4a', base64: 'AAEC' } });
      expect(server.requests[0]!.body).toMatchObject({ audio: { mimeType: 'audio/m4a', base64: 'AAEC' } });
      expect('transcript' in (server.requests[0]!.body as object)).toBe(false);
    });

    it('caps the HTTP timeout below the mobile app timeout (25 s) whatever the configured value', async () => {
      await parse(build({ pythonTimeoutMs: 28_000 }));
      expect((server.requests[0]!.body as { deadlineMs: number }).deadlineMs).toBe(20_500); // 22 s - 1.5 s
    });

    it('identifies the user only through a signed token with the voice-meal scope', async () => {
      await parse(build());
      const token = String(server.requests[0]!.headers.authorization).replace('Bearer ', '');
      const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
        issuer: 'onusfit-node-api',
        audience: 'onusfit-ai-backend',
      });
      expect([payload.sub, payload.scope]).toEqual([USER, 'ai:meals:voice']);
    });

    it('marks the request dispatched so the quota unit is not refunded', async () => {
      await parse(build());
      expect(aiContext.dispatched).toBe(true);
    });

    it('records tokens in the usage ledger once, as feature voice_meal', async () => {
      await parse(build());
      expect(recorder.recordExternalUsage).toHaveBeenCalledTimes(1);
      expect(recorder.recordExternalUsage).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER, feature: 'voice_meal', model: 'gemini-3.5-flash-lite', totalTokens: 800 }),
      );
    });

    it('does not fail the request when the usage ledger write fails', async () => {
      recorder.recordExternalUsage.mockRejectedValue(new Error('db down'));
      await expect(parse(build())).resolves.toMatchObject({ detectedLanguage: 'tanglish' });
    });
  });

  describe('Python cannot answer: one controlled error, never a second AI call', () => {
    it('Python unreachable: 503, not dispatched (quota refundable)', async () => {
      const error = await failure(parse(build({ baseUrl: await closedPortUrl() })));
      expect(isAppError(error) && [error.kind, error.code]).toEqual(['unavailable', 'SERVICE_UNAVAILABLE']);
      expect(aiContext.dispatched).toBe(false);
    });

    it('Python timeout: standard AI timeout error, dispatched, no retry', async () => {
      server.respond(() => undefined);
      const error = await failure(parse(build({ pythonTimeoutMs: 100 })));
      expect(error).toBeInstanceOf(AiTimeoutError);
      expect(aiContext.dispatched).toBe(true);
      expect(server.requests).toHaveLength(1);
    });

    it.each([
      ['401 invalid service token', 401, pythonError('AUTH_INVALID_TOKEN', 'x', { dispatched: false }), false],
      ['422 contract mismatch', 422, pythonError('INVALID_REQUEST', 'x', { dispatched: false }), false],
      ['503 Python has no Gemini key', 503, pythonError('PROVIDER_NOT_CONFIGURED', 'x', { dispatched: false }), false],
      ['500 crash', 500, pythonError('INTERNAL_ERROR', 'boom'), true],
    ])('%s: controlled 503 with the voice-meal message, one call, dispatched=%s', async (_n, status, body, dispatched) => {
      server.respond((_r, res) => json(res, status, body));
      const error = await failure(parse(build()));
      expect(isAppError(error) && [error.code, error.message]).toEqual([
        'SERVICE_UNAVAILABLE',
        'Voice meal parsing is temporarily unavailable. Please try again shortly.',
      ]);
      expect(server.requests).toHaveLength(1);
      expect(aiContext.dispatched).toBe(dispatched);
    });

    it('invalid Python response: controlled 503, dispatched, nothing recorded', async () => {
      server.respond((_r, res) => json(res, 200, { outcome: 'ok', result: { items: 'nope' } }));
      const error = await failure(parse(build()));
      expect(isAppError(error) && error.code).toBe('SERVICE_UNAVAILABLE');
      expect(aiContext.dispatched).toBe(true);
      expect(recorder.recordExternalUsage).not.toHaveBeenCalled();
    });

    it('refuses to run outside the quota gate (no AI request context)', async () => {
      const error = await failure(build().parseVoiceMeal({ transcript: 'x' }));
      expect(isAppError(error) && error.code).toBe('INTERNAL_ERROR');
      expect(server.requests).toHaveLength(0);
    });
  });

  describe('Gemini problems reported by Python', () => {
    it.each([
      ['PROVIDER_RATE_LIMITED', 429, 'RATE_LIMITED'],
      ['PROVIDER_QUOTA_EXHAUSTED', 429, 'AI_QUOTA_EXCEEDED'],
      ['AI_UNAVAILABLE', 503, 'AI_UNAVAILABLE'],
      ['PROVIDER_UNAVAILABLE', 503, 'SERVICE_UNAVAILABLE'],
    ])('maps %s to %s (dispatched, no retry)', async (pyCode, status, publicCode) => {
      server.respond((_r, res) => json(res, status, pythonError(pyCode, 'safe', { retryAfterSeconds: 25 })));
      const error = await failure(parse(build()));
      expect(isAppError(error) && error.code).toBe(publicCode);
      expect(server.requests).toHaveLength(1);
      expect(aiContext.dispatched).toBe(true);
    });

    it('maps a Gemini timeout inside Python to the standard timeout error', async () => {
      server.respond((_r, res) => json(res, 504, pythonError('PROVIDER_TIMEOUT', 'timed out')));
      expect(await failure(parse(build()))).toBeInstanceOf(AiTimeoutError);
    });
  });
});
