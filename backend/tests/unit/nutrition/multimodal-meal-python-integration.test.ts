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
import { AnalyzeMultimodalMealUseCase } from '../../../src/modules/nutrition/application/use-cases/analyze-multimodal-meal.js';
import {
  MULTIMODAL_MEAL_UNAVAILABLE_MESSAGE,
  PythonMultimodalMealService,
} from '../../../src/modules/nutrition/infrastructure/python-multimodal-meal-service.js';
import { createNutritionMemberController } from '../../../src/modules/nutrition/interface/nutrition.controller.js';
import { multimodalMealResponseSchema } from '../../../src/modules/nutrition/interface/multimodal-meal.schemas.js';
import { createNutritionMemberRoutes } from '../../../src/modules/nutrition/interface/nutrition.routes.js';
import { PythonAiClient, type AiUsageRecorder } from '../../../src/shared/ai/python-ai-client.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { isAiTimeoutError } from '../../../src/shared/ai/ai-timeout.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import { InMemoryAiUsageStore } from '../../helpers/ai-usage-gate.js';
import {
  closedPortUrl,
  json,
  okMultimodalMealReply,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';
const USER_TWO = '22222222-2222-4222-8222-222222222222';
const PHOTO = '/9j/4AAQSkZJRg==';
const AUDIO = Buffer.from('00000018667479706d703432', 'hex').toString('base64');
const SVG_BASE64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64');
const LIMITS = {
  dailyGlobalLimit: 50,
  coachChatDailyLimit: 20,
  mealPhotoDailyLimit: 10,
  voiceMealDailyLimit: 10,
  workoutGeneratorDailyLimit: 10,
};

class Settings {
  readonly store = new InMemoryAiUsageStore();
  photoEnabled = true;
  voiceEnabled = true;
  async getSettingByKey(key: string) {
    return {
      key,
      value:
        key === 'features.flags'
          ? {
              aiCoach: true,
              mealPhotoScanner: this.photoEnabled,
              voiceMealEntry: this.voiceEnabled,
              workoutGenerator: true,
            }
          : LIMITS,
    };
  }
  reserveAiUsage = (input: Parameters<InMemoryAiUsageStore['reserveAiUsage']>[0]) => this.store.reserveAiUsage(input);
  releaseAiUsage = (input: Parameters<InMemoryAiUsageStore['releaseAiUsage']>[0]) => this.store.releaseAiUsage(input);
}

describe('Multimodal meal analysis (HTTP route -> use case -> quota gate -> PythonAiClient)', () => {
  let server: FakePythonServer;
  let settings: Settings;
  let recorder: { recordExternalUsage: ReturnType<typeof vi.fn> };

  const serviceFor = (url: string, timeoutMs = 5_000) =>
    new PythonMultimodalMealService({
      client: new PythonAiClient({ baseUrl: url, serviceSecret: SECRET }),
      resolveModels: (feature) => Promise.resolve({ primary: `${feature}-primary`, fallback: `${feature}-fallback` }),
      usageRecorder: recorder as unknown as AiUsageRecorder,
      pythonTimeoutMs: timeoutMs,
    });

  const useCaseFor = (url: string, timeoutMs?: number) =>
    new AnalyzeMultimodalMealUseCase(
      serviceFor(url, timeoutMs),
      new AiUsageGateService(new CheckAndRecordAiQuotaUseCase(settings as unknown as AppSettingsRepository)),
    );

  const buildApp = (userId = USER, url = server.url) => {
    const app = express();
    app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
    app.use(express.json({ limit: '30mb' }));
    const controller = createNutritionMemberController({
      analyzeMultimodalMeal: useCaseFor(url),
    } as never);
    app.use(
      '/api/v1/nutrition',
      buildRouter(createNutritionMemberRoutes('/api/v1/nutrition', controller).routes, {
        authenticate: (req, _res, next) => {
          req.actor = createActor({ userId, sessionId: 's1', role: 'member' });
          next();
        },
      }),
    );
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
  };

  beforeEach(async () => {
    server = await startFakePythonServer((_r, res) => json(res, 200, okMultimodalMealReply()));
    settings = new Settings();
    recorder = { recordExternalUsage: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(async () => {
    await server.close();
  });

  it('fuses image + audio + transcript through HTTP route, verifies JWT scope, and meters one quota unit', async () => {
    const res = await request(buildApp())
      .post('/api/v1/nutrition/multimodal/analyze')
      .send({
        image: PHOTO,
        imageMimeType: 'image/jpeg',
        audio: AUDIO,
        audioMimeType: 'audio/m4a',
        transcript: 'two dosa with sambar',
        mealType: 'breakfast',
        lang: 'tanglish',
        notes: 'home made',
        dietaryGoal: 'fat_loss',
        allergies: ['peanut'],
        dailyCalorieTarget: 2100,
      })
      .expect(200);

    expect(() => multimodalMealResponseSchema.parse(res.body.data)).not.toThrow();
    expect(res.body.data.modalitiesUsed).toEqual(['image', 'audio', 'text']);
    expect(res.body.data.uncertaintyNote).toContain('Visual estimate');
    expect(res.body.data.medicalDisclaimer).toContain('not medical');
    expect(server.requests).toHaveLength(1);

    const token = server.requests[0]!.headers.authorization?.replace(/^Bearer /, '') ?? '';
    const verified = await jwtVerify(token, new TextEncoder().encode(SECRET));
    expect(verified.payload.sub).toBe(USER);
    expect(verified.payload.scope).toBe('ai:meals:multimodal');

    expect(settings.store.actionCount(USER, 'meal_photo')).toBe(1);
    expect(settings.store.actionCount(USER_TWO, 'meal_photo')).toBe(0);
    expect(recorder.recordExternalUsage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, feature: 'meal_photo', status: 'success' }),
    );
  });

  it('rejects disguised SVG payload before calling Python or charging quota', async () => {
    const res = await request(buildApp())
      .post('/api/v1/nutrition/multimodal/analyze')
      .send({
        image: SVG_BASE64,
        imageMimeType: 'image/png',
        transcript: 'dosa',
      })
      .expect(400);

    expect(res.body.error?.code).toBe('VALIDATION_FAILED');
    expect(server.requests).toHaveLength(0);
    expect(settings.store.actionCount(USER, 'meal_photo')).toBe(0);
  });

  it('refunds quota when request is aborted before Python dispatch', async () => {
    const controller = new AbortController();
    controller.abort();

    const err = await useCaseFor(server.url)
      .execute({
        userId: USER,
        transcript: 'idli and sambar',
        signal: controller.signal,
      })
      .catch((e: unknown) => e);

    expect(err).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(server.requests).toHaveLength(0);
    expect(settings.store.actionCount(USER, 'voice_meal')).toBe(0);
  });

  it('refunds quota when Python is unreachable before TCP dispatch', async () => {
    const res = await request(buildApp(USER, await closedPortUrl()))
      .post('/api/v1/nutrition/multimodal/analyze')
      .send({ transcript: 'idli and chutney' })
      .expect(503);

    expect(res.body.error?.message).toBe(MULTIMODAL_MEAL_UNAVAILABLE_MESSAGE);
    expect(settings.store.actionCount(USER, 'voice_meal')).toBe(0);
  });

  it('aborts in-flight HTTP call when caller signal fires mid-request', async () => {
    let sawAbort = false;
    const delayed = await startFakePythonServer((_req, res) => {
      setTimeout(() => {
        if (!res.writableEnded) {
          json(res, 200, okMultimodalMealReply());
        }
      }, 250);
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);

    try {
      await useCaseFor(delayed.url).execute({
        userId: USER,
        transcript: 'pongal',
        signal: controller.signal,
      });
    } catch (error) {
      sawAbort = isAiTimeoutError(error);
    } finally {
      await delayed.close();
    }

    expect(sawAbort).toBe(true);
  });
});
