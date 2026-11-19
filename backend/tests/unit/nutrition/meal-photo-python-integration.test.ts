import express from 'express';
import { jwtVerify } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import {
  AiUsageGateService,
  CheckAndRecordAiQuotaUseCase,
  type AppSettingsRepository,
} from '../../../src/modules/app-settings/index.js';
import { AnalyzeMealPhotoUseCase } from '../../../src/modules/nutrition/application/use-cases/analyze-meal-photo.js';
import {
  MEAL_PHOTO_MAX_TIMEOUT_MS,
  MEAL_PHOTO_UNAVAILABLE_MESSAGE,
  PythonMealPhotoService,
} from '../../../src/modules/nutrition/infrastructure/python-meal-photo-service.js';
import { createNutritionMemberController } from '../../../src/modules/nutrition/interface/nutrition.controller.js';
import { mealPhotoResponseSchema } from '../../../src/modules/nutrition/interface/meal-photo.schemas.js';
import { createNutritionMemberRoutes } from '../../../src/modules/nutrition/interface/nutrition.routes.js';
import { PythonAiClient, type AiUsageRecorder } from '../../../src/shared/ai/python-ai-client.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { isAppError } from '../../../src/shared/errors/app-error.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import { InMemoryAiUsageStore } from '../../helpers/ai-usage-gate.js';
import {
  closedPortUrl,
  json,
  okMealPhotoReply,
  pythonError,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

/**
 * The real AnalyzeMealPhotoUseCase and the real quota gate, with Python as the only AI backend.
 * Meal photo persists nothing, so the guarantees are: validation never charges or calls Python,
 * exactly one quota unit per admitted request, refund-vs-consume follows whether Gemini may have been
 * called, and the public response the mobile app parses is unchanged.
 */

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';
const PHOTO = '/9j/4AAQSkZJRg=='; // the start of a JPEG, base64
const LIMITS = { dailyGlobalLimit: 50, coachChatDailyLimit: 20, mealPhotoDailyLimit: 10, voiceMealDailyLimit: 10, workoutGeneratorDailyLimit: 10 };

class Settings {
  readonly store = new InMemoryAiUsageStore();
  photoEnabled = true;
  async getSettingByKey(key: string) {
    return {
      key,
      value:
        key === 'features.flags'
          ? { aiCoach: true, mealPhotoScanner: this.photoEnabled, voiceMealEntry: true, workoutGenerator: true }
          : LIMITS,
    };
  }
  reserveAiUsage = (input: Parameters<InMemoryAiUsageStore['reserveAiUsage']>[0]) => this.store.reserveAiUsage(input);
  releaseAiUsage = (input: Parameters<InMemoryAiUsageStore['releaseAiUsage']>[0]) => this.store.releaseAiUsage(input);
}

describe('Meal photo analysis served only by Python (full use case + quota gate)', () => {
  let server: FakePythonServer;
  let settings: Settings;
  let recorder: { recordExternalUsage: ReturnType<typeof vi.fn> };

  const serviceFor = (url: string, timeoutMs = 5_000) =>
    new PythonMealPhotoService({
      client: new PythonAiClient({ baseUrl: url, serviceSecret: SECRET }),
      resolveModels: () => Promise.resolve({ primary: 'photo-primary', fallback: 'photo-backup' }),
      usageRecorder: recorder as unknown as AiUsageRecorder,
      pythonTimeoutMs: timeoutMs,
    });
  const useCaseFor = (url: string, timeoutMs?: number) =>
    new AnalyzeMealPhotoUseCase(
      serviceFor(url, timeoutMs),
      new AiUsageGateService(new CheckAndRecordAiQuotaUseCase(settings as unknown as AppSettingsRepository)),
    );
  const analyze = (input: Partial<Parameters<AnalyzeMealPhotoUseCase['execute']>[0]> = {}, url = server.url, timeoutMs?: number) =>
    useCaseFor(url, timeoutMs).execute({ userId: USER, imageBase64: PHOTO, mimeType: 'image/jpeg', ...input });
  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

  beforeEach(async () => {
    server = await startFakePythonServer((_r, res) => json(res, 200, okMealPhotoReply()));
    settings = new Settings();
    recorder = { recordExternalUsage: vi.fn().mockResolvedValue(undefined) };
  });
  afterEach(async () => {
    await server.close();
  });

  describe('success', () => {
    it('one Python call, one quota unit, public response contract intact', async () => {
      const result = await analyze({ mealType: 'breakfast', notes: 'no sugar' });

      expect(() => mealPhotoResponseSchema.parse(result)).not.toThrow();
      expect(result).toMatchObject({ isFood: true, summary: 'Dosa with sambar', overallConfidence: 0.9, totalKcal: 260, totalFiberGrams: 2 });
      expect(result.items[0]).toMatchObject({ name: 'Dosa', brand: 'AI Estimate', kcal: 260, isAiEstimated: true });
      expect('unclearReason' in result).toBe(false); // absent, never null: the app has always seen it that way
      expect(server.requests).toHaveLength(1);
      expect(settings.store.actionCount(USER, 'meal_photo')).toBe(1);
      expect(settings.store.reserveCalls).toBe(1);
    });

    it('sends the photo, hints, admin-configured models and a deadline - and never the user id', async () => {
      await analyze({ mealType: 'lunch', notes: 'restaurant portion', mimeType: 'image/webp' });

      const sent = server.requests[0]!;
      expect(sent.url).toBe('/internal/v1/ai/meals/analyze-photo');
      expect(sent.body).toEqual({
        image: { mimeType: 'image/webp', base64: PHOTO },
        mealType: 'lunch',
        notes: 'restaurant portion',
        model: { primary: 'photo-primary', fallback: 'photo-backup' },
        deadlineMs: 3_500, // the test's 5 s HTTP timeout minus the 1.5 s margin
      });
      expect(JSON.stringify(sent.body)).not.toContain(USER);
    });

    it('identifies the user only through a short-lived token scoped to meal photos', async () => {
      await analyze();
      const token = String(server.requests[0]!.headers.authorization).replace('Bearer ', '');
      const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
        issuer: 'onusfit-node-api',
        audience: 'onusfit-ai-backend',
      });
      expect(payload).toMatchObject({ sub: USER, scope: 'ai:meals:photo' });
      expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(60);
    });

    it('omits optional hints that were not given', async () => {
      await analyze();
      const body = server.requests[0]!.body as Record<string, unknown>;
      expect('mealType' in body || 'notes' in body).toBe(false);
    });

    it('stays inside the mobile deadline: never more than 27 s HTTP / 25.5 s Gemini, even if configured higher', async () => {
      await useCaseFor(server.url, 28_000).execute({ userId: USER, imageBase64: PHOTO, mimeType: 'image/jpeg' });
      expect(MEAL_PHOTO_MAX_TIMEOUT_MS).toBeLessThan(30_000); // the app waits 30 s
      expect((server.requests[0]!.body as { deadlineMs: number }).deadlineMs).toBe(MEAL_PHOTO_MAX_TIMEOUT_MS - 1_500);
    });

    it('records the tokens once under meal_photo, attributed to the user', async () => {
      await analyze();
      expect(recorder.recordExternalUsage).toHaveBeenCalledTimes(1);
      expect(recorder.recordExternalUsage).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER, feature: 'meal_photo', model: 'gemini-3.5-flash-lite', totalTokens: 1370 }),
      );
    });

    it('a failing usage ledger never fails the request', async () => {
      recorder.recordExternalUsage.mockRejectedValue(new Error('db down'));
      await expect(analyze()).resolves.toMatchObject({ isFood: true });
    });

    it('reports a backup-model answer like any other (the app cannot tell)', async () => {
      server.respond((_r, res) => json(res, 200, okMealPhotoReply({ usage: { ...(okMealPhotoReply().usage as object), model: 'photo-backup', isFallback: true } })));
      await expect(analyze()).resolves.toMatchObject({ isFood: true });
      expect(recorder.recordExternalUsage).toHaveBeenCalledWith(expect.objectContaining({ model: 'photo-backup', isFallback: true }));
    });
  });

  describe('Gemini answers that are not a normal meal', () => {
    it('a photo without food is a normal 200 result and still costs one unit', async () => {
      server.respond((_r, res) =>
        json(
          res,
          200,
          okMealPhotoReply({
            outcome: 'no_food',
            result: {
              isFood: false, summary: 'No food detected', items: [], overallConfidence: 0, totalKcal: 0, totalProteinGrams: 0,
              totalCarbsGrams: 0, totalFatGrams: 0, totalFiberGrams: 0, unclearReason: 'A desk.', analyzedAt: '2026-11-19T10:00:00.000Z',
            },
          }),
        ),
      );
      const result = await analyze();
      expect(result).toMatchObject({ isFood: false, items: [], unclearReason: 'A desk.' });
      expect(() => mealPhotoResponseSchema.parse(result)).not.toThrow();
      expect(settings.store.actionCount(USER, 'meal_photo')).toBe(1);
    });

    it('a malformed Gemini reply keeps the known "Unable to parse food analysis" result (parity) and is charged', async () => {
      server.respond((_r, res) =>
        json(
          res,
          200,
          okMealPhotoReply({
            outcome: 'parse_failed',
            result: {
              isFood: false, summary: 'Unable to parse food analysis', items: [], overallConfidence: 0, totalKcal: 0,
              totalProteinGrams: 0, totalCarbsGrams: 0, totalFatGrams: 0, totalFiberGrams: 0,
              unclearReason: 'AI response was not formatted correctly. Please try again.', analyzedAt: '2026-11-19T10:00:00.000Z',
            },
          }),
        ),
      );
      const result = await analyze();
      expect(result).toMatchObject({ isFood: false, summary: 'Unable to parse food analysis' });
      expect(settings.store.actionCount(USER, 'meal_photo')).toBe(1);
    });
  });

  describe('failures: one controlled error, never a second AI call', () => {
    it('Python unavailable: controlled 503 with the existing message and the unit is refunded', async () => {
      const error = await failure(analyze({}, await closedPortUrl()));
      expect(isAppError(error) && [error.kind, error.code, error.message]).toEqual(['unavailable', 'SERVICE_UNAVAILABLE', MEAL_PHOTO_UNAVAILABLE_MESSAGE]);
      expect(settings.store.actionCount(USER, 'meal_photo')).toBe(0);
      expect(settings.store.reserveCalls).toBe(1);
    });

    it('Python timeout: timeout error, unit stays consumed, no retry', async () => {
      server.respond(() => undefined);
      const error = await failure(analyze({}, server.url, 100));
      expect(isAppError(error) && error.message).toBe('AI request timed out. Please try again.');
      expect(settings.store.actionCount(USER, 'meal_photo')).toBe(1);
      expect(server.requests).toHaveLength(1);
    });

    it('wrong or missing service token (Python 401): controlled 503, unit refunded, no internals leaked', async () => {
      server.respond((_r, res) => json(res, 401, pythonError('AUTH_INVALID_TOKEN', 'Invalid service token.', { dispatched: false })));
      const error = await failure(analyze());
      expect(isAppError(error) && [error.code, error.message]).toEqual(['SERVICE_UNAVAILABLE', MEAL_PHOTO_UNAVAILABLE_MESSAGE]);
      expect(settings.store.actionCount(USER, 'meal_photo')).toBe(0);
    });

    it('Python refuses a corrupt image (422, Gemini never called): controlled 503 and the unit is refunded', async () => {
      server.respond((_r, res) =>
        json(res, 422, pythonError('INVALID_REQUEST', 'Image data is not a valid JPEG, PNG, WebP or HEIC image.', { dispatched: false })),
      );
      const error = await failure(analyze());
      expect(isAppError(error) && [error.code, error.message]).toEqual(['SERVICE_UNAVAILABLE', MEAL_PHOTO_UNAVAILABLE_MESSAGE]);
      expect(settings.store.actionCount(USER, 'meal_photo')).toBe(0);
    });

    it('Gemini rate limit: 429 with retry hint, unit consumed', async () => {
      server.respond((_r, res) => json(res, 429, pythonError('PROVIDER_RATE_LIMITED', 'Busy', { retryAfterSeconds: 25 })));
      const error = await failure(analyze());
      expect(isAppError(error) && [error.kind, error.code, error.details]).toEqual(['rate_limited', 'RATE_LIMITED', { retryAfterSeconds: 25 }]);
      expect(settings.store.actionCount(USER, 'meal_photo')).toBe(1);
    });

    it('Gemini daily project quota: AI_QUOTA_EXCEEDED, unit consumed', async () => {
      server.respond((_r, res) => json(res, 429, pythonError('PROVIDER_QUOTA_EXHAUSTED', 'Daily capacity reached', { retryAfterSeconds: 3600 })));
      const error = await failure(analyze());
      expect(isAppError(error) && error.code).toBe('AI_QUOTA_EXCEEDED');
      expect(settings.store.actionCount(USER, 'meal_photo')).toBe(1);
    });

    it('both Gemini models failing (Python AI_UNAVAILABLE): 503 AI_UNAVAILABLE, unit consumed', async () => {
      server.respond((_r, res) => json(res, 503, pythonError('AI_UNAVAILABLE', 'High demand', { retryAfterSeconds: 20 })));
      const error = await failure(analyze());
      expect(isAppError(error) && [error.kind, error.code]).toEqual(['unavailable', 'AI_UNAVAILABLE']);
      expect(settings.store.actionCount(USER, 'meal_photo')).toBe(1);
    });

    it('Gemini provider error / timeout inside Python: controlled errors, unit consumed', async () => {
      server.respond((_r, res) => json(res, 503, pythonError('PROVIDER_ERROR', 'raw provider text must not leak')));
      const error = await failure(analyze());
      expect(isAppError(error) && [error.code, error.message]).toEqual(['SERVICE_UNAVAILABLE', MEAL_PHOTO_UNAVAILABLE_MESSAGE]);
      expect(settings.store.actionCount(USER, 'meal_photo')).toBe(1);

      server.respond((_r, res) => json(res, 504, pythonError('PROVIDER_TIMEOUT', 'x')));
      const timeout = await failure(analyze({}, server.url));
      expect(isAppError(timeout) && timeout.message).toBe('AI request timed out. Please try again.');
    });

    it('an invalid Python response: controlled 503, unit consumed', async () => {
      server.respond((_r, res) => json(res, 200, { nope: true }));
      const error = await failure(analyze());
      expect(isAppError(error) && error.code).toBe('SERVICE_UNAVAILABLE');
      expect(settings.store.actionCount(USER, 'meal_photo')).toBe(1);
    });
  });

  describe('Node keeps validation and quota', () => {
    it.each([
      ['empty image', { imageBase64: '' }],
      ['blank image', { imageBase64: '   ' }],
      ['unsupported format', { mimeType: 'image/gif' as never }],
      ['over 10 MB', { imageBase64: 'A'.repeat(10 * 1024 * 1024 + 1) }],
      ['no user', { userId: '' }],
    ])('%s: rejected before any charge or Python call', async (_name, input) => {
      const error = await failure(analyze(input));
      expect(isAppError(error)).toBe(true);
      expect(settings.store.reserveCalls).toBe(0);
      expect(server.requests).toHaveLength(0);
    });

    it('a disabled feature never reaches Python', async () => {
      settings.photoEnabled = false;
      const error = await failure(analyze());
      expect(isAppError(error) && error.code).toBe('FEATURE_DISABLED');
      expect(server.requests).toHaveLength(0);
      expect(settings.store.totalCount(USER)).toBe(0);
    });

    it('an exhausted daily quota never reaches Python', async () => {
      settings.store.setCount(USER, 'meal_photo', 10);
      const error = await failure(analyze());
      expect(isAppError(error) && error.code).toBe('AI_QUOTA_EXCEEDED');
      expect(server.requests).toHaveLength(0);
    });

    it('exactly one unit is charged per admitted request, even across several photos', async () => {
      await analyze();
      await analyze();
      expect(settings.store.actionCount(USER, 'meal_photo')).toBe(2);
      expect(server.requests).toHaveLength(2);
    });
  });

  describe('through the real route and controller: the public mobile contract', () => {
    const appFor = () => {
      const controller = createNutritionMemberController({ analyzeMealPhoto: useCaseFor(server.url) } as never);
      const group = createNutritionMemberRoutes('/api/v1/nutrition', controller);
      const app = express();
      app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
      app.use(express.json({ limit: '20mb' }));
      const authenticate: express.RequestHandler = (req, _res, next) => {
        req.actor = createActor({ userId: USER, sessionId: 's1', role: 'member' });
        next();
      };
      app.use(group.basePath, buildRouter(group.routes, { authenticate }));
      app.use(notFoundHandler);
      app.use(errorHandler);
      return app;
    };
    const post = (body: object) => request(appFor()).post('/api/v1/nutrition/meal-photo/analyze').send(body);

    it('200 {success, data, message} with the exact data the app parses', async () => {
      const res = await post({ image: PHOTO, mimeType: 'image/jpeg', mealType: 'breakfast' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, message: 'Meal photo analyzed successfully' });
      expect(Object.keys(res.body.data).sort()).toEqual(
        ['analyzedAt', 'isFood', 'items', 'overallConfidence', 'summary', 'totalCarbsGrams', 'totalFatGrams', 'totalFiberGrams', 'totalKcal', 'totalProteinGrams'].sort(),
      );
      expect(res.body.data.items[0]).toEqual({
        id: 'ai-food-1700000000000-0', name: 'Dosa', brand: 'AI Estimate', serving: '2 pieces', servingWeightG: 160,
        servingUnit: 'piece', servingSize: 2, kcal: 260, protein: 6, carbs: 44, fat: 7, fiber: 2, confidence: 'high', isAiEstimated: true,
      });
    });

    it('defaults the mime type to image/jpeg like before', async () => {
      const res = await post({ image: PHOTO });
      expect(res.status).toBe(200);
      expect((server.requests[0]!.body as { image: { mimeType: string } }).image.mimeType).toBe('image/jpeg');
    });

    it.each([
      ['missing image', {}, 400],
      ['empty image', { image: '' }, 400],
      ['unsupported mime type', { image: PHOTO, mimeType: 'image/gif' }, 400],
      ['notes over 250 characters', { image: PHOTO, notes: 'n'.repeat(251) }, 400],
    ])('%s: %i and Python is never called', async (_name, body, status) => {
      const res = await post(body);
      expect(res.status).toBe(status);
      expect(res.body.success).toBe(false);
      expect(server.requests).toHaveLength(0);
      expect(settings.store.reserveCalls).toBe(0);
    });

    it('Python unavailable: 503 envelope, existing message, nothing internal in the body', async () => {
      const controller = createNutritionMemberController({ analyzeMealPhoto: useCaseFor(await closedPortUrl()) } as never);
      const group = createNutritionMemberRoutes('/api/v1/nutrition', controller);
      const app = express();
      app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
      app.use(express.json());
      app.use(group.basePath, buildRouter(group.routes, { authenticate: (req, _res, next) => { req.actor = createActor({ userId: USER, sessionId: 's1', role: 'member' }); next(); } }));
      app.use(errorHandler);
      const res = await request(app).post('/api/v1/nutrition/meal-photo/analyze').send({ image: PHOTO });
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: MEAL_PHOTO_UNAVAILABLE_MESSAGE } });
      expect(JSON.stringify(res.body)).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|secret|token/i);
    });
  });
});
