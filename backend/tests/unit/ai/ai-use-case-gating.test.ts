import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiUsageGateService,
  CheckAndRecordAiQuotaUseCase,
  type AppSettingsRepository,
} from '../../../src/modules/app-settings/index.js';
import { ChatWithCoachUseCase } from '../../../src/modules/coach/application/use-cases/chat-with-coach.js';
import { GetCoachInsightsUseCase } from '../../../src/modules/coach/application/use-cases/get-coach-insights.js';
import type {
  ConversationRepository,
  GeminiService,
  UserContextRepository,
} from '../../../src/modules/coach/application/ports.js';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import { AnalyzeMealPhotoUseCase } from '../../../src/modules/nutrition/application/use-cases/analyze-meal-photo.js';
import { ParseVoiceMealUseCase } from '../../../src/modules/nutrition/application/use-cases/parse-voice-meal.js';
import type { GeminiMealPhotoService } from '../../../src/modules/nutrition/infrastructure/gemini-meal-photo-service.js';
import type { GeminiVoiceMealService } from '../../../src/modules/nutrition/infrastructure/gemini-voice-meal-service.js';
import { markAiRequestDispatched } from '../../../src/shared/ai/ai-usage.js';
import { isAppError } from '../../../src/shared/errors/app-error.js';
import { InMemoryAiUsageStore } from '../../helpers/ai-usage-gate.js';

const USER = '11111111-1111-4111-8111-111111111111';

const ALL_ON = { aiCoach: true, mealPhotoScanner: true, voiceMealEntry: true, workoutGenerator: true };
const LIMITS = {
  dailyGlobalLimit: 50,
  coachChatDailyLimit: 20,
  mealPhotoDailyLimit: 10,
  voiceMealDailyLimit: 10,
  workoutGeneratorDailyLimit: 10,
};

class Settings {
  flags: Record<string, boolean> = { ...ALL_ON };
  limits: Record<string, number> = { ...LIMITS };
  readonly store = new InMemoryAiUsageStore();
  async getSettingByKey(key: string) {
    return { key, value: key === 'features.flags' ? this.flags : this.limits };
  }
  reserveAiUsage = (input: Parameters<InMemoryAiUsageStore['reserveAiUsage']>[0]) =>
    this.store.reserveAiUsage(input);
  releaseAiUsage = (input: Parameters<InMemoryAiUsageStore['releaseAiUsage']>[0]) =>
    this.store.releaseAiUsage(input);
}

const code = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return isAppError(error) ? error.code : `non-app-error:${String(error)}`;
  }
  return 'resolved';
};

const PNG = 'aGVsbG8='; // arbitrary small base64 payload

let settings: Settings;
let gate: AiUsageGateService;

beforeEach(() => {
  settings = new Settings();
  gate = new AiUsageGateService(
    new CheckAndRecordAiQuotaUseCase(settings as unknown as AppSettingsRepository),
  );
  GetCoachInsightsUseCase.clearCache();
});

describe('meal photo analysis', () => {
  const result = { isFood: true, summary: 'ok', items: [] } as never;
  let service: { analyzePhoto: ReturnType<typeof vi.fn> };
  let useCase: AnalyzeMealPhotoUseCase;

  beforeEach(() => {
    service = { analyzePhoto: vi.fn().mockResolvedValue(result) };
    useCase = new AnalyzeMealPhotoUseCase(service as unknown as GeminiMealPhotoService, gate);
  });

  const call = () => useCase.execute({ userId: USER, imageBase64: PNG, mimeType: 'image/jpeg' });

  it('calls Gemini once and charges one meal_photo unit when enabled', async () => {
    await expect(call()).resolves.toBe(result);

    expect(service.analyzePhoto).toHaveBeenCalledTimes(1);
    expect(settings.store.actionCount(USER, 'meal_photo')).toBe(1);
  });

  it('never calls Gemini when the Meal Photo Scanner is disabled', async () => {
    settings.flags.mealPhotoScanner = false;

    expect(await code(call())).toBe('FEATURE_DISABLED');
    expect(service.analyzePhoto).not.toHaveBeenCalled();
    expect(settings.store.totalCount(USER)).toBe(0);
  });

  it('never calls Gemini once the daily quota is used up', async () => {
    settings.limits.mealPhotoDailyLimit = 1;
    await call();

    expect(await code(call())).toBe('AI_QUOTA_EXCEEDED');
    expect(service.analyzePhoto).toHaveBeenCalledTimes(1);
  });

  it('does not charge requests rejected by validation before the AI path', async () => {
    const bad = [
      useCase.execute({ userId: USER, imageBase64: '', mimeType: 'image/jpeg' }),
      useCase.execute({ userId: USER, imageBase64: PNG, mimeType: 'image/gif' as never }),
      useCase.execute({ userId: '', imageBase64: PNG, mimeType: 'image/jpeg' }),
    ];

    for (const request of bad) expect(await code(request)).not.toBe('resolved');
    expect(settings.store.reserveCalls).toBe(0);
    expect(service.analyzePhoto).not.toHaveBeenCalled();
  });

  it('refunds when the service fails before dispatching, keeps the charge after dispatch', async () => {
    service.analyzePhoto.mockRejectedValueOnce(new Error('key not configured'));
    await expect(call()).rejects.toThrow('key not configured');
    expect(settings.store.actionCount(USER, 'meal_photo')).toBe(0);

    service.analyzePhoto.mockImplementationOnce(async () => {
      markAiRequestDispatched();
      throw new Error('provider 503');
    });
    await expect(call()).rejects.toThrow('provider 503');
    expect(settings.store.actionCount(USER, 'meal_photo')).toBe(1);
  });

  it('admits at most the limit under 25 parallel requests', async () => {
    settings.limits.mealPhotoDailyLimit = 4;

    await Promise.allSettled(Array.from({ length: 25 }, () => call()));

    expect(service.analyzePhoto).toHaveBeenCalledTimes(4);
  });
});

describe('voice meal parsing', () => {
  const result = { transcript: 'rice', items: [] } as never;
  let service: { parseVoiceMeal: ReturnType<typeof vi.fn> };
  let useCase: ParseVoiceMealUseCase;

  beforeEach(() => {
    service = { parseVoiceMeal: vi.fn().mockResolvedValue(result) };
    useCase = new ParseVoiceMealUseCase(service as unknown as GeminiVoiceMealService, gate);
  });

  const transcript = () => useCase.execute({ userId: USER, transcript: 'two idlis and sambar' });
  const audio = () => useCase.execute({ userId: USER, audioBase64: PNG, mimeType: 'audio/m4a' });

  it.each([
    ['transcript', transcript],
    ['audio', audio],
  ])('meters the %s path and calls Gemini once when enabled', async (_name, run) => {
    await expect(run()).resolves.toBe(result);

    expect(service.parseVoiceMeal).toHaveBeenCalledTimes(1);
    expect(settings.store.actionCount(USER, 'voice_meal')).toBe(1);
  });

  it.each([
    ['transcript', transcript],
    ['audio', audio],
  ])('never calls Gemini on the %s path when Voice Meal Entry is disabled', async (_name, run) => {
    settings.flags.voiceMealEntry = false;

    expect(await code(run())).toBe('FEATURE_DISABLED');
    expect(service.parseVoiceMeal).not.toHaveBeenCalled();
    expect(settings.store.totalCount(USER)).toBe(0);
  });

  it('never calls Gemini once the voice quota or the total quota is used up', async () => {
    settings.limits.voiceMealDailyLimit = 1;
    await transcript();
    expect(await code(transcript())).toBe('AI_QUOTA_EXCEEDED');

    settings.limits.voiceMealDailyLimit = 10;
    settings.limits.dailyGlobalLimit = 1;
    expect(await code(audio())).toBe('AI_QUOTA_EXCEEDED');
    expect(service.parseVoiceMeal).toHaveBeenCalledTimes(1);
  });

  it('does not charge invalid requests', async () => {
    expect(await code(useCase.execute({ userId: USER }))).not.toBe('resolved');
    expect(await code(useCase.execute({ userId: USER, audioBase64: PNG, mimeType: 'audio/flac' }))).not.toBe(
      'resolved',
    );
    expect(settings.store.reserveCalls).toBe(0);
  });
});

describe('AI coach chat', () => {
  const context = {
    profile: { displayName: 'Test' },
    todayNutrition: {},
    recentWorkouts: [],
    todayPlannedWorkout: null,
    activeGoals: [],
    latestWeightKg: null,
  } as unknown as UserFitnessContext;

  let contextRepo: { getUserFitnessContext: ReturnType<typeof vi.fn> };
  let gemini: { generateCoachResponse: ReturnType<typeof vi.fn>; generateInsights: ReturnType<typeof vi.fn> };
  let conversations: Record<keyof ConversationRepository, ReturnType<typeof vi.fn>>;
  let useCase: ChatWithCoachUseCase;

  beforeEach(() => {
    contextRepo = { getUserFitnessContext: vi.fn().mockResolvedValue(context) };
    gemini = {
      generateCoachResponse: vi.fn().mockResolvedValue({ text: 'hello', followUps: [], sources: [] }),
      generateInsights: vi.fn(),
    };
    conversations = {
      createConversation: vi.fn().mockResolvedValue({ id: 'convo-1' }),
      listConversations: vi.fn(),
      getConversation: vi.fn(),
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
      addMessage: vi.fn().mockResolvedValue(undefined),
      getMessages: vi.fn().mockResolvedValue([]),
    };
    useCase = new ChatWithCoachUseCase(
      contextRepo as unknown as UserContextRepository,
      gemini as unknown as GeminiService,
      gate,
      conversations as unknown as ConversationRepository,
    );
  });

  const chat = (message = 'How much protein do I need?') => useCase.execute({ userId: USER, message });

  it('answers and charges one coach_chat unit when enabled (existing flow unchanged)', async () => {
    const response = await chat();

    expect(response.text).toBe('hello');
    expect(response.conversationId).toBe('convo-1');
    expect(gemini.generateCoachResponse).toHaveBeenCalledTimes(1);
    expect(conversations.addMessage).toHaveBeenCalledTimes(2);
    expect(settings.store.actionCount(USER, 'coach_chat')).toBe(1);
  });

  it('a disabled AI Coach has no side effects: no Gemini call, no context load, no conversation, no stored message', async () => {
    settings.flags.aiCoach = false;

    expect(await code(chat())).toBe('FEATURE_DISABLED');
    expect(gemini.generateCoachResponse).not.toHaveBeenCalled();
    expect(contextRepo.getUserFitnessContext).not.toHaveBeenCalled();
    expect(conversations.createConversation).not.toHaveBeenCalled();
    expect(conversations.addMessage).not.toHaveBeenCalled();
    expect(settings.store.totalCount(USER)).toBe(0);
  });

  it('an exhausted quota has no side effects either', async () => {
    settings.limits.coachChatDailyLimit = 1;
    await chat();
    vi.clearAllMocks();

    expect(await code(chat())).toBe('AI_QUOTA_EXCEEDED');
    expect(gemini.generateCoachResponse).not.toHaveBeenCalled();
    expect(conversations.createConversation).not.toHaveBeenCalled();
    expect(conversations.addMessage).not.toHaveBeenCalled();
  });

  it('does not charge an empty message', async () => {
    expect(await code(chat('   '))).not.toBe('resolved');
    expect(settings.store.reserveCalls).toBe(0);
  });

  it('refunds when setup fails before Gemini is dispatched', async () => {
    contextRepo.getUserFitnessContext.mockRejectedValueOnce(new Error('database error'));

    await expect(chat()).rejects.toThrow('database error');

    expect(gemini.generateCoachResponse).not.toHaveBeenCalled();
    expect(settings.store.actionCount(USER, 'coach_chat')).toBe(0);
  });

  it('keeps the charge when Gemini was dispatched and failed', async () => {
    gemini.generateCoachResponse.mockImplementationOnce(async () => {
      markAiRequestDispatched();
      throw new Error('provider timeout');
    });

    await expect(chat()).rejects.toThrow('provider timeout');

    expect(settings.store.actionCount(USER, 'coach_chat')).toBe(1);
  });

  it('admits at most the limit under 30 parallel chats', async () => {
    settings.limits.coachChatDailyLimit = 5;

    await Promise.allSettled(Array.from({ length: 30 }, () => chat()));

    expect(gemini.generateCoachResponse).toHaveBeenCalledTimes(5);
  });
});

describe('AI coach insights', () => {
  const context = { profile: { displayName: 'Test' } } as unknown as UserFitnessContext;
  const insights = {
    greeting: 'hi',
    recommendation: null,
    insights: [],
    generatedAt: 'now',
    hasSufficientData: true,
  };

  let contextRepo: { getUserFitnessContext: ReturnType<typeof vi.fn> };
  let gemini: { generateCoachResponse: ReturnType<typeof vi.fn>; generateInsights: ReturnType<typeof vi.fn> };
  let useCase: GetCoachInsightsUseCase;

  beforeEach(() => {
    contextRepo = { getUserFitnessContext: vi.fn().mockResolvedValue(context) };
    gemini = { generateCoachResponse: vi.fn(), generateInsights: vi.fn().mockResolvedValue(insights) };
    useCase = new GetCoachInsightsUseCase(
      contextRepo as unknown as UserContextRepository,
      gemini as unknown as GeminiService,
      gate,
    );
  });

  it('charges only the request that generates; cache hits are free', async () => {
    await useCase.execute({ userId: USER, lang: 'en' });
    await useCase.execute({ userId: USER, lang: 'en' });
    await useCase.execute({ userId: USER, lang: 'en' });

    expect(gemini.generateInsights).toHaveBeenCalledTimes(1);
    expect(settings.store.actionCount(USER, 'coach_chat')).toBe(1);
  });

  it('concurrent identical requests share one generation and one charge', async () => {
    await Promise.all(Array.from({ length: 8 }, () => useCase.execute({ userId: USER, lang: 'en' })));

    expect(gemini.generateInsights).toHaveBeenCalledTimes(1);
    expect(settings.store.actionCount(USER, 'coach_chat')).toBe(1);
  });

  it('the kill switch also blocks requests the cache could have served', async () => {
    await useCase.execute({ userId: USER, lang: 'en' });
    settings.flags.aiCoach = false;

    expect(await code(useCase.execute({ userId: USER, lang: 'en' }))).toBe('FEATURE_DISABLED');
    expect(gemini.generateInsights).toHaveBeenCalledTimes(1);
  });

  it('never calls Gemini when the quota is exhausted', async () => {
    settings.limits.coachChatDailyLimit = 1;
    settings.store.setCount(USER, 'coach_chat', 1);

    expect(await code(useCase.execute({ userId: USER, lang: 'en', forceRefresh: true }))).toBe(
      'AI_QUOTA_EXCEEDED',
    );
    expect(gemini.generateInsights).not.toHaveBeenCalled();
    expect(contextRepo.getUserFitnessContext).not.toHaveBeenCalled();
  });

  it('forced refreshes cannot bypass the quota', async () => {
    settings.limits.coachChatDailyLimit = 3;

    await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        useCase.execute({ userId: USER, lang: `l${i}`, forceRefresh: true }),
      ),
    );

    expect(gemini.generateInsights).toHaveBeenCalledTimes(3);
  });
});
