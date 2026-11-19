import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiUsageGateService,
  CheckAndRecordAiQuotaUseCase,
  type AppSettingsRepository,
} from '../../../src/modules/app-settings/index.js';
import { GetCoachInsightsUseCase } from '../../../src/modules/coach/application/use-cases/get-coach-insights.js';
import { buildDeterministicInsights } from '../../../src/modules/coach/domain/coach-insights.js';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import { PythonCoachInsightsService } from '../../../src/modules/coach/infrastructure/python-coach-insights-service.js';
import { PythonAiClient } from '../../../src/shared/ai/python-ai-client.js';
import { runWithCorrelationId } from '../../../src/shared/logging/request-correlation.js';
import { InMemoryAiUsageStore } from '../../helpers/ai-usage-gate.js';
import { createCapturingLogger } from '../../helpers/capture-logger.js';
import {
  closedPortUrl,
  json,
  okInsightsReply,
  pythonError,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

/**
 * Coach insights have four ways to answer: a fresh AI answer, a cache hit, a deterministic fallback
 * (after an AI failure or unusable output) and a welcome (no data yet). The logs must tell them apart,
 * including the subtle case that a deterministic fallback is itself cached for 10 minutes.
 * These tests change no behavior; they only read the log lines the existing flow now writes.
 */

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';
const CORRELATION_ID = 'mobile-request-insights-1';
const LIMITS = {
  dailyGlobalLimit: 50,
  coachChatDailyLimit: 20,
  mealPhotoDailyLimit: 10,
  voiceMealDailyLimit: 10,
  workoutGeneratorDailyLimit: 10,
};

const CASES = JSON.parse(
  readFileSync(new URL('../../fixtures/coach-insights/deterministic_cases.json', import.meta.url), 'utf8'),
) as Array<{ name: string; context: UserFitnessContext }>;
const contextNamed = (name: string) => CASES.find((c) => c.name === name)!.context;
const CONTEXT = contextNamed('A_full__en');
const EMPTY_CONTEXT = contextNamed('I_insufficient__en');

class Settings {
  readonly store = new InMemoryAiUsageStore();
  async getSettingByKey(key: string) {
    return {
      key,
      value:
        key === 'features.flags'
          ? { aiCoach: true, mealPhotoScanner: true, voiceMealEntry: true, workoutGenerator: true }
          : LIMITS,
    };
  }
  reserveAiUsage = (input: Parameters<InMemoryAiUsageStore['reserveAiUsage']>[0]) =>
    this.store.reserveAiUsage(input);
  releaseAiUsage = (input: Parameters<InMemoryAiUsageStore['releaseAiUsage']>[0]) =>
    this.store.releaseAiUsage(input);
}

describe('coach insights: cache and fallback events', () => {
  let server: FakePythonServer;
  let settings: Settings;
  let capture: ReturnType<typeof createCapturingLogger>;
  let context: UserFitnessContext;

  const serviceFor = (url: string, timeoutMs = 5_000) =>
    new PythonCoachInsightsService({
      client: new PythonAiClient({ baseUrl: url, serviceSecret: SECRET }),
      resolveModels: () => Promise.resolve({ primary: 'coach-primary', fallback: 'coach-backup' }),
      pythonTimeoutMs: timeoutMs,
      logger: capture.logger,
    });
  const useCaseFor = (service = serviceFor(server.url)) =>
    new GetCoachInsightsUseCase(
      { getUserFitnessContext: () => Promise.resolve(context) },
      { generateCoachResponse: vi.fn(), generateInsights: (c, l) => service.generateInsights(c, l) },
      new AiUsageGateService(new CheckAndRecordAiQuotaUseCase(settings as unknown as AppSettingsRepository)),
      capture.logger,
    );
  /** One HTTP request: every log line it writes carries the same correlation id. */
  const ask = (useCase: GetCoachInsightsUseCase, input: { forceRefresh?: boolean } = {}) =>
    runWithCorrelationId(CORRELATION_ID, () => useCase.execute({ userId: USER, lang: 'en', ...input }));
  /** The AI-related events so far, as compact "event:detail" labels in the order they were written. */
  const trail = () =>
    capture
      .entries()
      .filter((e) => typeof e.event === 'string')
      .map((e) => (e.event === 'ai.cache' ? `ai.cache:${String(e.cache)}` : String(e.event)));
  const units = () => settings.store.actionCount(USER, 'coach_chat');

  beforeEach(async () => {
    GetCoachInsightsUseCase.clearCache();
    server = await startFakePythonServer((_r, res) => json(res, 200, okInsightsReply()));
    settings = new Settings();
    capture = createCapturingLogger();
    context = CONTEXT;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await server.close();
    GetCoachInsightsUseCase.clearCache();
  });

  describe('a fresh AI answer, then a cache hit', () => {
    it('miss -> AI call -> stored, and every line carries the request id', async () => {
      await ask(useCaseFor());

      expect(trail()).toEqual(['ai.cache:miss', 'ai.call.completed', 'ai.cache:stored']);
      const [miss, , stored] = capture.entries().filter((e) => e.event);
      expect(miss).toMatchObject({
        feature: 'coach_insights',
        reason: 'absent',
        correlationId: CORRELATION_ID,
      });
      expect(capture.events('ai.call.completed')[0]).toMatchObject({
        feature: 'coach_insights',
        success: true,
        correlationId: CORRELATION_ID,
      });
      expect(stored).toMatchObject({ servedFrom: 'ai', correlationId: CORRELATION_ID });
    });

    it('the second request is a cache hit: no AI call, no quota, and the log says it served an AI answer', async () => {
      const useCase = useCaseFor();
      await ask(useCase);
      capture.lines.length = 0;

      await ask(useCase);

      expect(trail()).toEqual(['ai.cache:hit']);
      expect(capture.events('ai.cache')[0]).toMatchObject({
        cache: 'hit',
        servedFrom: 'ai',
        correlationId: CORRELATION_ID,
      });
      expect(capture.events('ai.cache')[0]!.cacheAgeMs).toBeGreaterThanOrEqual(0);
      expect(server.requests).toHaveLength(1);
      expect(units()).toBe(1);
    });

    it('a cache hit is never confused with a deterministic fallback', async () => {
      const useCase = useCaseFor();
      await ask(useCase);
      await ask(useCase);
      expect(capture.events('ai.deterministic_fallback')).toHaveLength(0);
    });
  });

  describe('a deterministic fallback, and the cached fallback after it', () => {
    it('Python down: failed call -> fallback event (with the category) -> the fallback is cached', async () => {
      const useCase = useCaseFor(serviceFor(await closedPortUrl()));

      const result = await ask(useCase);

      expect(trail()).toEqual([
        'ai.cache:miss',
        'ai.call.failed',
        'ai.deterministic_fallback',
        'ai.cache:stored',
      ]);
      const failed = capture.events('ai.call.failed')[0]!;
      const fallback = capture.events('ai.deterministic_fallback')[0]!;
      expect(fallback).toMatchObject({
        feature: 'coach_insights',
        reason: 'ai_call_failed',
        aiCalled: true,
        errorCategory: 'python_unavailable',
        correlationId: CORRELATION_ID,
        aiRequestId: failed.aiRequestId, // the two events are joined by the per-call id
      });
      expect(capture.events('ai.cache').at(-1)).toMatchObject({
        cache: 'stored',
        servedFrom: 'deterministic_fallback',
      });
      // Behavior is as before: deterministic insights, and the quota unit stays consumed.
      expect({ ...result, generatedAt: '' }).toEqual({
        ...buildDeterministicInsights(CONTEXT, 'en'),
        generatedAt: '',
      });
      expect(units()).toBe(1);
    });

    it('the next request is a cache hit that says it is serving a FALLBACK (and writes no new fallback event)', async () => {
      const useCase = useCaseFor(serviceFor(await closedPortUrl()));
      await ask(useCase);
      capture.lines.length = 0;

      await ask(useCase);

      expect(trail()).toEqual(['ai.cache:hit']);
      expect(capture.events('ai.cache')[0]).toMatchObject({
        cache: 'hit',
        servedFrom: 'deterministic_fallback',
      });
    });

    it.each([
      [
        'Gemini service unavailable',
        (s: FakePythonServer) =>
          s.respond((_r, res) => json(res, 503, pythonError('PROVIDER_UNAVAILABLE', 'x'))),
        'gemini_unavailable',
      ],
      [
        'Gemini rate limit',
        (s: FakePythonServer) =>
          s.respond((_r, res) => json(res, 429, pythonError('PROVIDER_RATE_LIMITED', 'x'))),
        'gemini_rate_limited',
      ],
      [
        'Gemini timeout',
        (s: FakePythonServer) => s.respond((_r, res) => json(res, 504, pythonError('PROVIDER_TIMEOUT', 'x'))),
        'gemini_timeout',
      ],
      [
        'authentication failure',
        (s: FakePythonServer) =>
          s.respond((_r, res) =>
            json(res, 401, pythonError('AUTH_INVALID_TOKEN', 'x', { dispatched: false })),
          ),
        'auth_failure',
      ],
      [
        'invalid AI response',
        (s: FakePythonServer) => s.respond((_r, res) => json(res, 200, { outcome: 'ok', usage: 'broken' })),
        'invalid_ai_response',
      ],
    ])('%s is recorded on the fallback event as %s', async (_name, arrange, category) => {
      arrange(server);
      await ask(useCaseFor());
      expect(capture.events('ai.deterministic_fallback')[0]).toMatchObject({
        reason: 'ai_call_failed',
        errorCategory: category,
      });
      expect(capture.events('ai.call.failed')[0]).toMatchObject({ errorCategory: category });
    });

    it('Python too slow: python_timeout', async () => {
      server.respond(() => undefined);
      await ask(useCaseFor(serviceFor(server.url, 100)));
      expect(capture.events('ai.deterministic_fallback')[0]).toMatchObject({
        errorCategory: 'python_timeout',
      });
    });

    it('the model answered but nothing usable: the call is success:false and the fallback says why', async () => {
      server.respond((_r, res) => json(res, 200, okInsightsReply({ outcome: 'unusable', result: null })));

      await ask(useCaseFor());

      expect(trail()).toEqual([
        'ai.cache:miss',
        'ai.call.completed',
        'ai.deterministic_fallback',
        'ai.cache:stored',
      ]);
      expect(capture.events('ai.call.completed')[0]).toMatchObject({
        success: false,
        outcome: 'unusable',
        errorCategory: 'invalid_ai_response',
      });
      expect(capture.events('ai.deterministic_fallback')[0]).toMatchObject({
        reason: 'unusable_ai_output',
        errorCategory: 'invalid_ai_response',
        aiCalled: true,
      });
    });

    it('"ok" with zero insights is also unusable', async () => {
      const reply = okInsightsReply();
      server.respond((_r, res) =>
        json(res, 200, { ...reply, result: { ...(reply.result as object), insights: [] } }),
      );
      await ask(useCaseFor());
      expect(capture.events('ai.deterministic_fallback')[0]).toMatchObject({ reason: 'unusable_ai_output' });
    });
  });

  describe('a user with no data yet', () => {
    it('is answered with the welcome insights without any AI call, and the log says so', async () => {
      context = EMPTY_CONTEXT;

      await ask(useCaseFor());

      expect(server.requests).toHaveLength(0);
      expect(capture.events('ai.deterministic_fallback')[0]).toMatchObject({
        reason: 'insufficient_data',
        aiCalled: false,
      });
      expect(capture.events('ai.call.completed')).toHaveLength(0);
      expect(capture.events('ai.cache').at(-1)).toMatchObject({ cache: 'stored', servedFrom: 'welcome' });
    });
  });

  describe('other cache decisions', () => {
    it('a request that arrives while one is generating joins it: one AI call, one join event', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      server.respond(async (_r, res) => {
        await gate;
        json(res, 200, okInsightsReply());
      });
      const useCase = useCaseFor();

      const first = ask(useCase);
      await vi.waitFor(() => expect(server.requests).toHaveLength(1));
      const second = ask(useCase);
      await vi.waitFor(() =>
        expect(capture.events('ai.cache').some((e) => e.cache === 'joined_inflight')).toBe(true),
      );
      release();
      await Promise.all([first, second]);

      expect(server.requests).toHaveLength(1);
      expect(capture.events('ai.cache').filter((e) => e.cache === 'joined_inflight')).toHaveLength(1);
      expect(units()).toBe(1);
    });

    it('forceRefresh bypasses the cache and says so', async () => {
      const useCase = useCaseFor();
      await ask(useCase);
      capture.lines.length = 0;

      await ask(useCase, { forceRefresh: true });

      expect(capture.events('ai.cache')[0]).toMatchObject({ cache: 'miss', reason: 'force_refresh' });
      expect(server.requests).toHaveLength(2);
    });

    it('an entry older than the 10-minute TTL is reported as expired, then regenerated', async () => {
      const useCase = useCaseFor();
      await ask(useCase);
      capture.lines.length = 0;
      const realNow = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(realNow + 10 * 60 * 1000 + 1);

      await ask(useCase);

      expect(capture.events('ai.cache')[0]).toMatchObject({ cache: 'miss', reason: 'expired' });
      expect(server.requests).toHaveLength(2);
    });
  });

  describe('privacy', () => {
    it('nothing from the user context, the model reply or any secret reaches the logs on any path', async () => {
      const useCase = useCaseFor();
      await ask(useCase); // AI answer
      await ask(useCase); // cache hit
      await ask(useCase, { forceRefresh: true });
      server.respond((_r, res) =>
        json(res, 503, pythonError('PROVIDER_UNAVAILABLE', `Karthik ${SECRET} Leg Day`)),
      );
      await ask(useCase, { forceRefresh: true }); // fallback
      context = EMPTY_CONTEXT;
      GetCoachInsightsUseCase.clearCache();
      await ask(useCase); // welcome

      const logged = capture.text();
      expect(capture.lines.length).toBeGreaterThan(8);
      for (const forbidden of [
        'Karthik',
        'Leg Day',
        'Upper Body Push',
        SECRET,
        USER,
        'ins-1',
        'Workout Consistency',
      ]) {
        expect(logged).not.toContain(forbidden);
      }
    });
  });
});
