import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiUsageGateService,
  CheckAndRecordAiQuotaUseCase,
  type AppSettingsRepository,
} from '../../../src/modules/app-settings/index.js';
import type {
  ConversationRepository,
  GeminiService,
  MemoryRepository,
  UserContextRepository,
} from '../../../src/modules/coach/application/ports.js';
import { ChatWithCoachUseCase } from '../../../src/modules/coach/application/use-cases/chat-with-coach.js';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import { PythonCoachChatService } from '../../../src/modules/coach/infrastructure/python-coach-chat-service.js';
import { coachResponseSchema } from '../../../src/modules/coach/interface/coach.schemas.js';
import { PythonAiClient, type AiUsageRecorder } from '../../../src/shared/ai/python-ai-client.js';
import { isAppError } from '../../../src/shared/errors/app-error.js';
import { InMemoryAiUsageStore } from '../../helpers/ai-usage-gate.js';
import {
  closedPortUrl,
  json,
  okCoachReply,
  pythonError,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

/**
 * The whole coach-chat path with the REAL use case and the REAL quota gate, where the reply is served
 * only by Python. These tests prove Node keeps its responsibilities: exactly one quota unit, one user
 * message and (on success) one assistant message per request, and no AI call anywhere except Python.
 */

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';
const LIMITS = {
  dailyGlobalLimit: 50,
  coachChatDailyLimit: 20,
  mealPhotoDailyLimit: 10,
  voiceMealDailyLimit: 10,
  workoutGeneratorDailyLimit: 10,
};

class Settings {
  readonly store = new InMemoryAiUsageStore();
  coachEnabled = true;
  async getSettingByKey(key: string) {
    return {
      key,
      value:
        key === 'features.flags'
          ? {
              aiCoach: this.coachEnabled,
              mealPhotoScanner: true,
              voiceMealEntry: true,
              workoutGenerator: true,
            }
          : LIMITS,
    };
  }
  reserveAiUsage = (input: Parameters<InMemoryAiUsageStore['reserveAiUsage']>[0]) =>
    this.store.reserveAiUsage(input);
  releaseAiUsage = (input: Parameters<InMemoryAiUsageStore['releaseAiUsage']>[0]) =>
    this.store.releaseAiUsage(input);
}

const context = {
  profile: { displayName: 'Arun' },
  todayNutrition: { caloriesConsumed: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0, waterIntakeMl: 0 },
  recentWorkouts: [],
  todayPlannedWorkout: null,
  activeGoals: [],
  latestWeightKg: null,
} as unknown as UserFitnessContext;

describe('AI Coach chat served only by Python (full use case + quota gate)', () => {
  let server: FakePythonServer;
  let settings: Settings;
  let conversations: Record<keyof ConversationRepository, ReturnType<typeof vi.fn>>;
  let recorder: { recordExternalUsage: ReturnType<typeof vi.fn> };
  let memoryRepo: { getActiveMemoriesForContext: ReturnType<typeof vi.fn> };

  const useCaseFor = (pythonUrl: string, pythonTimeoutMs = 5_000) => {
    const chat = new PythonCoachChatService({
      client: new PythonAiClient({ baseUrl: pythonUrl, serviceSecret: SECRET }),
      resolveModels: () => Promise.resolve({ primary: 'primary-model', fallback: 'fallback-model' }),
      usageRecorder: recorder as unknown as AiUsageRecorder,
      pythonTimeoutMs,
    });
    const geminiService = {
      generateCoachResponse: chat.generateCoachResponse.bind(chat),
      generateInsights: vi.fn(),
    };
    const gate = new AiUsageGateService(
      new CheckAndRecordAiQuotaUseCase(settings as unknown as AppSettingsRepository),
    );
    return new ChatWithCoachUseCase(
      { getUserFitnessContext: vi.fn().mockResolvedValue(context) } as unknown as UserContextRepository,
      geminiService as unknown as GeminiService,
      gate,
      conversations as unknown as ConversationRepository,
      memoryRepo as unknown as MemoryRepository,
    );
  };

  const chat = (url = server.url, timeoutMs?: number) =>
    useCaseFor(url, timeoutMs).execute({ userId: USER, message: 'How much protein do I need?' });
  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);
  const storedRoles = () => conversations.addMessage.mock.calls.map((c) => (c[2] as { role: string }).role);

  beforeEach(async () => {
    server = await startFakePythonServer();
    settings = new Settings();
    recorder = { recordExternalUsage: vi.fn().mockResolvedValue(undefined) };
    memoryRepo = { getActiveMemoriesForContext: vi.fn().mockResolvedValue(['[GOALS]: run a 10k']) };
    conversations = {
      createConversation: vi.fn().mockResolvedValue({ id: 'convo-1' }),
      listConversations: vi.fn(),
      getConversation: vi.fn(),
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
      addMessage: vi.fn().mockResolvedValue(undefined),
      getMessages: vi.fn().mockResolvedValue([]),
      setMessageFeedback: vi.fn().mockResolvedValue(true),
    };
  });
  afterEach(async () => {
    await server.close();
  });

  describe('success', () => {
    it('serves the reply from Python; Node charges exactly 1 unit and stores exactly 2 messages', async () => {
      const response = await chat();

      expect(response.text).toBe('Great consistency! Add 20 g of protein at dinner.');
      expect(response.conversationId).toBe('convo-1');
      expect(settings.store.actionCount(USER, 'coach_chat')).toBe(1);
      expect(settings.store.reserveCalls).toBe(1);
      expect(conversations.createConversation).toHaveBeenCalledTimes(1);
      expect(storedRoles()).toEqual(['user', 'assistant']);
      expect(server.requests).toHaveLength(1);
    });

    it('keeps the public mobile response contract (same keys as before)', async () => {
      const parsed = coachResponseSchema.parse(await chat());
      expect(Object.keys(parsed).sort()).toEqual([
        'conversationId',
        'followUps',
        'medicalNote',
        'sources',
        'text',
      ]);
    });

    it('stores the assistant message with the Python text, sources and follow-ups', async () => {
      await chat();
      const assistant = conversations.addMessage.mock.calls
        .map((c) => c[2] as { role: string; text: string; sources?: string[]; followUps?: string[] })
        .find((m) => m.role === 'assistant')!;
      expect(assistant.text).toBe('Great consistency! Add 20 g of protein at dinner.');
      expect(assistant.sources).toEqual(['Profile', "Today's Nutrition"]);
      expect(assistant.followUps).toEqual(['What should I eat?']);
    });

    it('sends only the memories Node selected (consent stays in Node) and no user id', async () => {
      await chat();
      const body = server.requests[0]!.body as { memories: string[]; message: string };
      expect(body.memories).toEqual(['[GOALS]: run a 10k']);
      expect(JSON.stringify(server.requests[0]!.body)).not.toContain(USER);
    });

    it('records the Python-served call in the usage ledger once', async () => {
      await chat();
      expect(recorder.recordExternalUsage).toHaveBeenCalledTimes(1);
    });

    it('propagates toolCalls and cumulative usage when Python executes function calling tools', async () => {
      server.respond((_req, res) =>
        json(
          res,
          200,
          okCoachReply({
            result: {
              text: 'You completed 3 workouts in the past week.',
              followUps: ['Show details?'],
              sources: ['Profile', 'recent_workouts'],
              medicalNote: false,
              blocks: null,
              toolCalls: ['get_recent_workouts'],
            },
            usage: {
              model: 'gemini-3.5-flash-lite',
              isFallback: false,
              inputTokens: 1850,
              outputTokens: 220,
              cachedTokens: 0,
              thinkingTokens: 45,
              totalTokens: 2115,
              durationMs: 2500,
            },
          }),
        ),
      );

      const response = await chat();
      expect(response.toolCalls).toEqual(['get_recent_workouts']);
      expect(response.sources).toContain('recent_workouts');

      expect(recorder.recordExternalUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          feature: 'coach_chat',
          inputTokens: 1850,
          outputTokens: 220,
          totalTokens: 2115,
          durationMs: 2500,
        }),
      );
    });
  });

  describe('Python cannot answer', () => {
    it('Python unavailable: controlled 503, quota REFUNDED (nothing reached any AI), only the user message stored', async () => {
      const error = await failure(chat(await closedPortUrl()));

      expect(isAppError(error) && [error.kind, error.code]).toEqual(['unavailable', 'SERVICE_UNAVAILABLE']);
      expect(settings.store.actionCount(USER, 'coach_chat')).toBe(0);
      expect(settings.store.reserveCalls).toBe(1); // reserved once, never twice
      expect(storedRoles()).toEqual(['user']);
      expect(conversations.createConversation).toHaveBeenCalledTimes(1);
    });

    it('Python timeout: controlled 503 timeout error, quota stays consumed (Gemini may have been billed), no retry', async () => {
      server.respond(() => undefined);

      const error = await failure(chat(server.url, 100));

      expect(isAppError(error) && error.code).toBe('SERVICE_UNAVAILABLE');
      expect(isAppError(error) && error.message).toBe('AI request timed out. Please try again.');
      expect(settings.store.actionCount(USER, 'coach_chat')).toBe(1);
      expect(server.requests).toHaveLength(1);
      expect(storedRoles()).toEqual(['user']);
    });

    it('invalid service token (Python 401): controlled 503, quota refunded, nothing else is called', async () => {
      server.respond((_r, res) =>
        json(res, 401, pythonError('AUTH_INVALID_TOKEN', 'Invalid service token.', { dispatched: false })),
      );

      const error = await failure(chat());

      expect(isAppError(error) && error.code).toBe('SERVICE_UNAVAILABLE');
      expect(settings.store.actionCount(USER, 'coach_chat')).toBe(0);
      expect(server.requests).toHaveLength(1);
    });

    it('Gemini rate limit reported by Python: 429 RATE_LIMITED with retry hint, unit stays consumed', async () => {
      server.respond((_r, res) =>
        json(res, 429, pythonError('PROVIDER_RATE_LIMITED', 'Busy', { retryAfterSeconds: 25 })),
      );

      const error = await failure(chat());

      expect(isAppError(error) && [error.kind, error.code, error.details]).toEqual([
        'rate_limited',
        'RATE_LIMITED',
        { retryAfterSeconds: 25 },
      ]);
      expect(settings.store.actionCount(USER, 'coach_chat')).toBe(1);
      expect(server.requests).toHaveLength(1);
      expect(storedRoles()).toEqual(['user']); // same as before the migration when Gemini failed
    });

    it('invalid Python response: controlled 503, unit consumed, no assistant message stored', async () => {
      server.respond((_r, res) => json(res, 200, { nope: true }));

      const error = await failure(chat());

      expect(isAppError(error) && error.code).toBe('SERVICE_UNAVAILABLE');
      expect(settings.store.actionCount(USER, 'coach_chat')).toBe(1);
      expect(storedRoles()).toEqual(['user']);
    });

    it('a failed request followed by a successful retry never charges more than once per request', async () => {
      server.respond((_r, res) => json(res, 500, pythonError('INTERNAL_ERROR', 'boom')));
      await failure(chat());
      server.respond((_r, res) => json(res, 200, okCoachReply()));
      await chat();

      expect(settings.store.reserveCalls).toBe(2); // one per request
      expect(settings.store.actionCount(USER, 'coach_chat')).toBe(1 + 1); // failed 500 was dispatched=true: consumed
    });
  });

  describe('Node responsibilities that must not change', () => {
    it('a disabled feature never reaches Python and creates no conversation or message', async () => {
      settings.coachEnabled = false;

      const error = await failure(chat());

      expect(isAppError(error) && error.code).toBe('FEATURE_DISABLED');
      expect(server.requests).toHaveLength(0);
      expect(conversations.createConversation).not.toHaveBeenCalled();
      expect(conversations.addMessage).not.toHaveBeenCalled();
      expect(settings.store.totalCount(USER)).toBe(0);
    });

    it('an exhausted daily quota never reaches Python', async () => {
      settings.store.setCount(USER, 'coach_chat', 20);

      const error = await failure(chat());

      expect(isAppError(error) && error.code).toBe('AI_QUOTA_EXCEEDED');
      expect(server.requests).toHaveLength(0);
    });
  });
});
