import { readFileSync } from 'node:fs';
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
import { GetCoachInsightsUseCase } from '../../../src/modules/coach/application/use-cases/get-coach-insights.js';
import { buildDeterministicInsights } from '../../../src/modules/coach/domain/coach-insights.js';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import {
  COACH_INSIGHTS_MAX_TIMEOUT_MS,
  PythonCoachInsightsService,
} from '../../../src/modules/coach/infrastructure/python-coach-insights-service.js';
import { createCoachController } from '../../../src/modules/coach/interface/coach.controller.js';
import { createCoachRoutes } from '../../../src/modules/coach/interface/coach.routes.js';
import { coachInsightsResponseSchema } from '../../../src/modules/coach/interface/coach.schemas.js';
import { PythonAiClient, type AiUsageRecorder } from '../../../src/shared/ai/python-ai-client.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { isAppError } from '../../../src/shared/errors/app-error.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger, type Logger } from '../../../src/shared/logging/logger.js';
import { InMemoryAiUsageStore } from '../../helpers/ai-usage-gate.js';
import {
  closedPortUrl,
  json,
  okInsightsReply,
  pythonError,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

/**
 * The real GetCoachInsightsUseCase (kill switch, 10-minute cache, in-flight de-duplication, the
 * `coach_chat` quota gate) with the Python AI backend as the only AI path. The guarantees:
 *  - the complete UserFitnessContext reaches Python and the answer keeps the public shape,
 *  - cache hits cost no Python call and no quota; one admitted generation costs exactly one unit,
 *  - every failure of the AI path ends in deterministic insights with HTTP 200 (never an error), and
 *    because it is swallowed the quota unit stays consumed, exactly as it did with Node Gemini,
 *  - Python is called at most once per generation (no retries).
 */

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';
const LIMITS = { dailyGlobalLimit: 50, coachChatDailyLimit: 20, mealPhotoDailyLimit: 10, voiceMealDailyLimit: 10, workoutGeneratorDailyLimit: 10 };

const CASES = JSON.parse(
  readFileSync(new URL('../../fixtures/coach-insights/deterministic_cases.json', import.meta.url), 'utf8'),
) as Array<{ name: string; context: UserFitnessContext }>;
const contextNamed = (name: string) => CASES.find((c) => c.name === name)!.context;
const CONTEXT = contextNamed('A_full__en');
const EMPTY_CONTEXT = contextNamed('I_insufficient__en');

class Settings {
  readonly store = new InMemoryAiUsageStore();
  coachEnabled = true;
  async getSettingByKey(key: string) {
    return {
      key,
      value:
        key === 'features.flags'
          ? { aiCoach: this.coachEnabled, mealPhotoScanner: true, voiceMealEntry: true, workoutGenerator: true }
          : LIMITS,
    };
  }
  reserveAiUsage = (input: Parameters<InMemoryAiUsageStore['reserveAiUsage']>[0]) => this.store.reserveAiUsage(input);
  releaseAiUsage = (input: Parameters<InMemoryAiUsageStore['releaseAiUsage']>[0]) => this.store.releaseAiUsage(input);
}

const normalise = <T extends { generatedAt: string }>(r: T) => ({ ...r, generatedAt: 'GENERATED_AT' });

describe('Coach insights served only by Python (full use case + quota gate + cache)', () => {
  let server: FakePythonServer;
  let settings: Settings;
  let context: UserFitnessContext;
  let recorder: { recordExternalUsage: ReturnType<typeof vi.fn> };
  let logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let loadContext: ReturnType<typeof vi.fn>;

  const serviceFor = (url: string, timeoutMs = 5_000, resolveModels?: () => Promise<{ primary: string; fallback: string | null }>) =>
    new PythonCoachInsightsService({
      client: new PythonAiClient({ baseUrl: url, serviceSecret: SECRET }),
      resolveModels: resolveModels ?? (() => Promise.resolve({ primary: 'coach-primary', fallback: 'coach-backup' })),
      usageRecorder: recorder as unknown as AiUsageRecorder,
      pythonTimeoutMs: timeoutMs,
      logger: logger as unknown as Pick<Logger, 'info' | 'error'>,
    });
  const useCaseFor = (service = serviceFor(server.url)) =>
    new GetCoachInsightsUseCase(
      { getUserFitnessContext: loadContext as never },
      { generateCoachResponse: vi.fn(), generateInsights: (c, l) => service.generateInsights(c, l) },
      new AiUsageGateService(new CheckAndRecordAiQuotaUseCase(settings as unknown as AppSettingsRepository)),
    );
  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);
  const units = () => settings.store.actionCount(USER, 'coach_chat');

  beforeEach(async () => {
    GetCoachInsightsUseCase.clearCache();
    server = await startFakePythonServer((_r, res) => json(res, 200, okInsightsReply()));
    settings = new Settings();
    context = CONTEXT;
    loadContext = vi.fn().mockImplementation(async () => context);
    recorder = { recordExternalUsage: vi.fn().mockResolvedValue(undefined) };
    logger = { info: vi.fn(), error: vi.fn() };
  });
  afterEach(async () => {
    await server.close();
    GetCoachInsightsUseCase.clearCache();
  });

  describe('success', () => {
    it('one Python call, one quota unit, and the answer keeps the public mobile shape', async () => {
      const result = await useCaseFor().execute({ userId: USER, lang: 'en', timezone: 'Asia/Kolkata' });

      expect(() => coachInsightsResponseSchema.parse(result)).not.toThrow();
      expect(result).toEqual({
        greeting: 'Good morning Karthik!',
        recommendation: 'Target Leg Day today.',
        insights: expect.arrayContaining([expect.objectContaining({ id: 'ins-1', category: 'workout', requiresDevice: false })]),
        generatedAt: '2026-11-19T10:00:00.000Z',
        hasSufficientData: true,
      });
      expect(loadContext).toHaveBeenCalledWith(USER, 'Asia/Kolkata');
      expect(server.requests).toHaveLength(1);
      expect(units()).toBe(1);
    });

    it('sends the COMPLETE user context unchanged, the language, models and a deadline - never the user id', async () => {
      await useCaseFor().execute({ userId: USER, lang: 'tanglish' });

      const sent = server.requests[0]!;
      expect(sent.url).toBe('/internal/v1/ai/coach/insights');
      expect(sent.body).toEqual({
        context: CONTEXT,
        lang: 'tanglish',
        model: { primary: 'coach-primary', fallback: 'coach-backup' },
        deadlineMs: 3_500, // the test's 5 s HTTP timeout minus the 1.5 s margin
      });
      expect(JSON.stringify(sent.body)).not.toContain(USER);
    });

    it.each(CASES.filter((c) => !c.name.startsWith('I_')).map((c) => [c.name, c.context] as const))(
      'context %s: reaches Python field for field (nulls, floats and unicode included)',
      async (_name, ctx) => {
        context = ctx;
        await useCaseFor().execute({ userId: USER, lang: 'en' });
        expect((server.requests[0]!.body as { context: unknown }).context).toEqual(ctx);
        GetCoachInsightsUseCase.clearCache();
      },
    );

    it('identifies the user only through a short-lived token scoped to coach insights', async () => {
      await useCaseFor().execute({ userId: USER });
      const token = String(server.requests[0]!.headers.authorization).replace('Bearer ', '');
      const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), { issuer: 'onusfit-node-api', audience: 'onusfit-ai-backend' });
      expect(payload).toMatchObject({ sub: USER, scope: 'ai:coach:insights' });
      expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(60);
    });

    it('records the tokens once under coach_insights, attributed to the user', async () => {
      await useCaseFor().execute({ userId: USER });
      expect(recorder.recordExternalUsage).toHaveBeenCalledTimes(1);
      expect(recorder.recordExternalUsage).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER, feature: 'coach_insights', model: 'gemini-3.5-flash-lite', totalTokens: 1015 }),
      );
    });

    it('a failing usage ledger never fails the request', async () => {
      recorder.recordExternalUsage.mockRejectedValue(new Error('db down'));
      await expect(useCaseFor().execute({ userId: USER })).resolves.toMatchObject({ hasSufficientData: true });
    });

    it('a backup-model answer is returned like any other and recorded as such', async () => {
      server.respond((_r, res) => json(res, 200, okInsightsReply({ usage: { ...(okInsightsReply().usage as object), model: 'coach-backup', isFallback: true } })));
      await expect(useCaseFor().execute({ userId: USER })).resolves.toMatchObject({ greeting: 'Good morning Karthik!' });
      expect(recorder.recordExternalUsage).toHaveBeenCalledWith(expect.objectContaining({ model: 'coach-backup', isFallback: true }));
    });

    it('stays inside the mobile deadline: at most 22 s HTTP / 20.5 s Gemini, even if configured higher', async () => {
      await useCaseFor(serviceFor(server.url, 28_000)).execute({ userId: USER });
      expect(COACH_INSIGHTS_MAX_TIMEOUT_MS).toBeLessThan(25_000); // the app waits 25 s
      expect((server.requests[0]!.body as { deadlineMs: number }).deadlineMs).toBe(COACH_INSIGHTS_MAX_TIMEOUT_MS - 1_500);
    });

  });

  describe('cache, de-duplication and the kill switch (unchanged use case)', () => {
    it('a second request within 10 minutes is served from cache: no Python call, no quota, no data load', async () => {
      const useCase = useCaseFor();
      const first = await useCase.execute({ userId: USER, lang: 'en' });
      const second = await useCase.execute({ userId: USER, lang: 'en' });

      expect(second).toEqual(first);
      expect(server.requests).toHaveLength(1);
      expect(loadContext).toHaveBeenCalledTimes(1);
      expect(units()).toBe(1);
      expect(settings.store.reserveCalls).toBe(1);
    });

    it('refresh=true bypasses the cache and costs a second unit', async () => {
      const useCase = useCaseFor();
      await useCase.execute({ userId: USER, lang: 'en' });
      await useCase.execute({ userId: USER, lang: 'en', forceRefresh: true });
      expect(server.requests).toHaveLength(2);
      expect(units()).toBe(2);
    });

    it('the cache is per user and per language', async () => {
      const useCase = useCaseFor();
      await useCase.execute({ userId: USER, lang: 'en' });
      await useCase.execute({ userId: USER, lang: 'ta' });
      await useCase.execute({ userId: '22222222-2222-4222-8222-222222222222', lang: 'en' });
      expect(server.requests).toHaveLength(3);
    });

    it('simultaneous requests share ONE Python call and ONE quota unit', async () => {
      server.respond(async (_r, res) => {
        await new Promise((r) => setTimeout(r, 50));
        json(res, 200, okInsightsReply());
      });
      const useCase = useCaseFor();
      const results = await Promise.all([1, 2, 3].map(() => useCase.execute({ userId: USER, lang: 'en' })));
      expect(results[0]).toEqual(results[1]);
      expect(server.requests).toHaveLength(1);
      expect(units()).toBe(1);
    });

    it('the deterministic fallback is cached as well (a failing AI path is not hammered)', async () => {
      server.respond((_r, res) => json(res, 503, pythonError('PROVIDER_ERROR', 'x')));
      const useCase = useCaseFor();
      const first = await useCase.execute({ userId: USER, lang: 'en' });
      const second = await useCase.execute({ userId: USER, lang: 'en' });
      expect(second).toEqual(first);
      expect(server.requests).toHaveLength(1);
    });

    it('the kill switch (aiCoach off) blocks every request, even one the cache could serve', async () => {
      const useCase = useCaseFor();
      await useCase.execute({ userId: USER, lang: 'en' });
      settings.coachEnabled = false;
      const error = await failure(useCase.execute({ userId: USER, lang: 'en' }));
      expect(isAppError(error) && error.code).toBe('FEATURE_DISABLED');
      expect(server.requests).toHaveLength(1);
    });

    it('an exhausted daily quota never reaches Python or loads data', async () => {
      settings.store.setCount(USER, 'coach_chat', 20);
      const error = await failure(useCaseFor().execute({ userId: USER, lang: 'en' }));
      expect(isAppError(error) && error.code).toBe('AI_QUOTA_EXCEEDED');
      expect(server.requests).toHaveLength(0);
      expect(loadContext).not.toHaveBeenCalled();
    });

    it('a request without a user is rejected before anything else', async () => {
      const error = await failure(useCaseFor().execute({ userId: '  ' }));
      expect(isAppError(error) && error.code).toBe('UNAUTHENTICATED');
      expect(settings.store.reserveCalls).toBe(0);
    });
  });

  describe('no data yet: a welcome answer without any AI call', () => {
    it('does not call Python; the unit is consumed exactly as before (the answer is not an error)', async () => {
      context = EMPTY_CONTEXT;
      const result = await useCaseFor().execute({ userId: USER, lang: 'tanglish' });
      expect(result).toMatchObject({ greeting: 'Vanakkam, Anu!', insights: [], hasSufficientData: false });
      expect(server.requests).toHaveLength(0);
      expect(units()).toBe(1);
    });
  });

  describe('every AI failure ends in deterministic insights, HTTP 200, one Python call, unit consumed', () => {
    const expectDeterministic = async (service = serviceFor(server.url), lang = 'en') => {
      const result = await useCaseFor(service).execute({ userId: USER, lang });
      expect(normalise(result)).toEqual(normalise(buildDeterministicInsights(CONTEXT, lang)));
      expect(() => coachInsightsResponseSchema.parse(result)).not.toThrow();
      expect(result.hasSufficientData).toBe(true);
      expect(units()).toBe(1); // swallowed => the gate sees a success => never refunded (as before)
    };

    it('Python unreachable', async () => {
      await expectDeterministic(serviceFor(await closedPortUrl()));
      expect(logger.error).toHaveBeenCalled();
    });

    it('Python timeout: one call, no retry', async () => {
      server.respond(() => undefined);
      await expectDeterministic(serviceFor(server.url, 100));
      expect(server.requests).toHaveLength(1);
    });

    it('wrong or missing service secret (Python 401)', async () => {
      server.respond((_r, res) => json(res, 401, pythonError('AUTH_INVALID_TOKEN', 'Invalid service token.', { dispatched: false })));
      await expectDeterministic();
      const logged = JSON.stringify(logger.error.mock.calls);
      expect(logged).toContain('AUTH_INVALID_TOKEN'); // the cause is logged...
      expect(logged).not.toContain(SECRET); // ...but never a secret, a bearer token or user data
      expect(logged).not.toMatch(/bearer|Karthik|Leg Day/i);
    });

    it('a real wrong secret on the client side', async () => {
      server.respond((req, res) => {
        const sent = String(req.headers.authorization);
        json(res, sent ? 401 : 500, pythonError('AUTH_INVALID_TOKEN', 'x', { dispatched: false }));
      });
      const wrong = new PythonCoachInsightsService({
        client: new PythonAiClient({ baseUrl: server.url, serviceSecret: 'x'.repeat(40) }),
        resolveModels: () => Promise.resolve({ primary: 'p', fallback: null }),
        pythonTimeoutMs: 5_000,
      });
      await expectDeterministic(wrong);
    });

    it('Gemini rate limit, daily quota, overload, provider error and timeout inside Python', async () => {
      const failures: Array<[number, string]> = [
        [429, 'PROVIDER_RATE_LIMITED'],
        [429, 'PROVIDER_QUOTA_EXHAUSTED'],
        [503, 'AI_UNAVAILABLE'],
        [503, 'PROVIDER_ERROR'],
        [504, 'PROVIDER_TIMEOUT'],
        [422, 'INVALID_REQUEST'],
      ];
      for (const [status, code] of failures) {
        GetCoachInsightsUseCase.clearCache();
        settings = new Settings();
        server.respond((_r, res) => json(res, status, pythonError(code, 'raw provider text must not leak')));
        await expectDeterministic();
      }
    });

    it('a Python reply that breaks the contract', async () => {
      server.respond((_r, res) => json(res, 200, { nope: true }));
      await expectDeterministic();
    });

    it('the model answered but not usably (outcome "unusable"): tokens are still recorded', async () => {
      server.respond((_r, res) => json(res, 200, okInsightsReply({ outcome: 'unusable', result: null })));
      await expectDeterministic();
      expect(recorder.recordExternalUsage).toHaveBeenCalledTimes(1);
    });

    it('outcome ok with an empty insight list is treated as unusable', async () => {
      const reply = okInsightsReply();
      server.respond((_r, res) => json(res, 200, { ...reply, result: { ...(reply.result as object), insights: [] } }));
      await expectDeterministic();
    });

    it('admin model configuration failing to resolve', async () => {
      await expectDeterministic(serviceFor(server.url, 5_000, () => Promise.reject(new Error('db down'))));
      expect(server.requests).toHaveLength(0);
    });

    it.each(['en', 'ta', 'tanglish'])('the fallback speaks %s', async (lang) => {
      server.respond((_r, res) => json(res, 503, pythonError('PROVIDER_ERROR', 'x')));
      await expectDeterministic(serviceFor(server.url), lang);
    });
  });

  describe('through the real route and controller: the public mobile contract', () => {
    const appFor = (service: PythonCoachInsightsService) => {
      const controller = createCoachController({ chatWithCoach: { execute: vi.fn() } as never, getCoachInsights: useCaseFor(service) });
      const group = createCoachRoutes('/api/v1/coach', controller);
      const app = express();
      app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
      app.use(express.json());
      app.use(
        group.basePath,
        buildRouter(group.routes, {
          authenticate: (req, _res, next) => {
            req.actor = createActor({ userId: USER, sessionId: 's1', role: 'member' });
            next();
          },
        }),
      );
      app.use(notFoundHandler);
      app.use(errorHandler);
      return app;
    };
    const get = (app: express.Express, query = '') => request(app).get(`/api/v1/coach/insights${query}`);

    it('200 {success, data, message} with exactly the keys the app parses', async () => {
      const res = await get(appFor(serviceFor(server.url)), '?lang=en&timezone=Asia/Kolkata');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, message: 'Personalized coach insights generated successfully' });
      expect(Object.keys(res.body.data).sort()).toEqual(['generatedAt', 'greeting', 'hasSufficientData', 'insights', 'recommendation']);
      expect(Object.keys(res.body.data.insights[0]).sort()).toEqual(
        ['action', 'category', 'confidence', 'description', 'evidence', 'id', 'priority', 'question', 'requiresDevice', 'severity', 'title'],
      );
    });

    it('refresh=true and lang reach the use case', async () => {
      const app = appFor(serviceFor(server.url));
      await get(app, '?lang=ta');
      await get(app, '?lang=ta');
      await get(app, '?lang=ta&refresh=true');
      expect(server.requests).toHaveLength(2);
      expect((server.requests[0]!.body as { lang: string }).lang).toBe('ta');
    });

    it.each([['lang=fr'], ['refresh=maybe']])('an invalid query (%s): 400 and Python is never called', async (query) => {
      const res = await get(appFor(serviceFor(server.url)), `?${query}`);
      expect(res.status).toBe(400);
      expect(server.requests).toHaveLength(0);
      expect(settings.store.reserveCalls).toBe(0);
    });

    it('Python down: still 200 with deterministic insights, nothing internal in the body', async () => {
      const res = await get(appFor(serviceFor(await closedPortUrl())), '?lang=en');
      expect(res.status).toBe(200);
      expect(res.body.data.hasSufficientData).toBe(true);
      expect(res.body.data.insights.map((i: { id: string }) => i.id)).toEqual(
        expect.arrayContaining(['ins-det-workout', 'ins-det-nutrition']),
      );
      expect(JSON.stringify(res.body)).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|secret|token/i);
    });

    it('the kill switch answers 422 FEATURE_DISABLED', async () => {
      settings.coachEnabled = false;
      const res = await get(appFor(serviceFor(server.url)));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('FEATURE_DISABLED');
      expect(server.requests).toHaveLength(0);
    });

    it('an exhausted quota answers 429 AI_QUOTA_EXCEEDED', async () => {
      settings.store.setCount(USER, 'coach_chat', 20);
      const res = await get(appFor(serviceFor(server.url)));
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('AI_QUOTA_EXCEEDED');
    });
  });
});
