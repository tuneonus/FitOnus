import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { z } from 'zod';
import {
  AiUsageGateService,
  CheckAndRecordAiQuotaUseCase,
  GeminiRuntimeService,
  type AiLimitsSettingValue,
  type AppSettingsRepository,
  type FeatureFlagsSettingValue,
  type GeminiConfigRecord,
} from '../../../src/modules/app-settings/index.js';
import { STATUS_BY_KIND } from '../../../src/middleware/error-handler.js';
import {
  currentAiRequestContext,
  markAiRequestDispatched,
  type AiUsageAction,
} from '../../../src/shared/ai/ai-usage.js';
import { callPythonAi, pythonUsageSchema } from '../../../src/shared/ai/python-ai-call.js';
import { PythonAiError, type PythonAiClient } from '../../../src/shared/ai/python-ai-client.js';
import type { GeminiFeature } from '../../../src/shared/ai/gemini-feature.js';
import { AppError, isAppError } from '../../../src/shared/errors/app-error.js';
import { InMemoryAiUsageStore } from '../../helpers/ai-usage-gate.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';

const ALL_ON: FeatureFlagsSettingValue = {
  aiCoach: true,
  mealPhotoScanner: true,
  voiceMealEntry: true,
  workoutGenerator: true,
};
const LIMITS: AiLimitsSettingValue = {
  dailyGlobalLimit: 50,
  coachChatDailyLimit: 20,
  mealPhotoDailyLimit: 10,
  voiceMealDailyLimit: 10,
  workoutGeneratorDailyLimit: 10,
};

/** Settings are read on every call, exactly like the PostgreSQL repository does. */
class FakeSettingsRepo {
  flags: unknown = { ...ALL_ON };
  limits: unknown = { ...LIMITS };
  readonly store = new InMemoryAiUsageStore();
  settingsReads = 0;
  failSettingsRead = false;

  async getSettingByKey(key: string) {
    this.settingsReads += 1;
    if (this.failSettingsRead) throw new Error('database unavailable');
    const value = key === 'features.flags' ? this.flags : key === 'ai.limits' ? this.limits : undefined;
    return value === undefined || value === null ? null : { key, value };
  }
  reserveAiUsage = (input: Parameters<InMemoryAiUsageStore['reserveAiUsage']>[0]) =>
    this.store.reserveAiUsage(input);
  releaseAiUsage = (input: Parameters<InMemoryAiUsageStore['releaseAiUsage']>[0]) =>
    this.store.releaseAiUsage(input);
}

const caught = async (promise: Promise<unknown>): Promise<AppError> => {
  try {
    await promise;
  } catch (error) {
    if (isAppError(error)) return error;
    throw error;
  }
  throw new Error('expected the call to be rejected');
};

describe('AI usage gate: feature flags, per-user quota and total quota', () => {
  let repo: FakeSettingsRepo;
  let gate: AiUsageGateService;
  let work: Mock<() => Promise<string>>;

  beforeEach(() => {
    repo = new FakeSettingsRepo();
    gate = new AiUsageGateService(new CheckAndRecordAiQuotaUseCase(repo as unknown as AppSettingsRepository));
    work = vi.fn().mockResolvedValue('ok');
  });

  describe('feature enabled', () => {
    it('admits the request, runs the work once and charges exactly one unit to the user and action', async () => {
      await expect(gate.run({ userId: USER, action: 'meal_photo' }, work)).resolves.toBe('ok');

      expect(work).toHaveBeenCalledTimes(1);
      expect(repo.store.actionCount(USER, 'meal_photo')).toBe(1);
      expect(repo.store.totalCount(USER)).toBe(1);
      expect(repo.store.actionCount(OTHER_USER, 'meal_photo')).toBe(0);
    });
  });

  describe('feature disabled (admin kill switch)', () => {
    const cases: [AiUsageAction, keyof FeatureFlagsSettingValue][] = [
      ['coach_chat', 'aiCoach'],
      ['meal_photo', 'mealPhotoScanner'],
      ['voice_meal', 'voiceMealEntry'],
      ['workout_generator', 'workoutGenerator'],
    ];

    it.each(cases)(
      '%s is rejected with FEATURE_DISABLED, never runs the work and is not charged',
      async (action, flag) => {
        repo.flags = { ...ALL_ON, [flag]: false };

        const error = await caught(gate.run({ userId: USER, action }, work));

        expect(error.code).toBe('FEATURE_DISABLED');
        expect(STATUS_BY_KIND[error.kind]).toBe(422);
        expect(work).not.toHaveBeenCalled();
        expect(repo.store.reserveCalls).toBe(0);
        expect(repo.store.totalCount(USER)).toBe(0);
      },
    );

    it('turning a feature off affects only that feature', async () => {
      repo.flags = { ...ALL_ON, mealPhotoScanner: false };

      await expect(gate.run({ userId: USER, action: 'coach_chat' }, work)).resolves.toBe('ok');
      expect((await caught(gate.run({ userId: USER, action: 'meal_photo' }, work))).code).toBe(
        'FEATURE_DISABLED',
      );
    });

    it('assertEnabled rejects a disabled feature without reserving anything', async () => {
      repo.flags = { ...ALL_ON, aiCoach: false };

      expect((await caught(gate.assertEnabled('coach_chat'))).code).toBe('FEATURE_DISABLED');
      await expect(gate.assertEnabled('meal_photo')).resolves.toBeUndefined();
      expect(repo.store.reserveCalls).toBe(0);
    });

    it('a corrupt stored flag value fails closed instead of enabling the feature', async () => {
      repo.flags = { ...ALL_ON, voiceMealEntry: 'false' };

      expect((await caught(gate.run({ userId: USER, action: 'voice_meal' }, work))).code).toBe(
        'FEATURE_DISABLED',
      );
      expect(work).not.toHaveBeenCalled();
    });
  });

  describe('admin configuration changes apply to the very next request', () => {
    it('the kill switch can be flipped off and on without a restart', async () => {
      await expect(gate.run({ userId: USER, action: 'coach_chat' }, work)).resolves.toBe('ok');

      repo.flags = { ...ALL_ON, aiCoach: false };
      expect((await caught(gate.run({ userId: USER, action: 'coach_chat' }, work))).code).toBe(
        'FEATURE_DISABLED',
      );

      repo.flags = { ...ALL_ON };
      await expect(gate.run({ userId: USER, action: 'coach_chat' }, work)).resolves.toBe('ok');
      expect(work).toHaveBeenCalledTimes(2);
    });

    it('lowering a limit below current usage blocks immediately, raising it re-opens', async () => {
      repo.limits = { ...LIMITS, mealPhotoDailyLimit: 3 };
      for (let i = 0; i < 3; i += 1) await gate.run({ userId: USER, action: 'meal_photo' }, work);
      expect((await caught(gate.run({ userId: USER, action: 'meal_photo' }, work))).code).toBe(
        'AI_QUOTA_EXCEEDED',
      );

      repo.limits = { ...LIMITS, mealPhotoDailyLimit: 2 };
      expect((await caught(gate.run({ userId: USER, action: 'meal_photo' }, work))).code).toBe(
        'AI_QUOTA_EXCEEDED',
      );

      repo.limits = { ...LIMITS, mealPhotoDailyLimit: 5 };
      await expect(gate.run({ userId: USER, action: 'meal_photo' }, work)).resolves.toBe('ok');
      expect(repo.store.actionCount(USER, 'meal_photo')).toBe(4);
    });
  });

  describe('per-user daily quota', () => {
    it('rejects the request that exceeds the limit with a consistent 429 AI_QUOTA_EXCEEDED and does not run the work', async () => {
      repo.limits = { ...LIMITS, mealPhotoDailyLimit: 2 };
      await gate.run({ userId: USER, action: 'meal_photo' }, work);
      await gate.run({ userId: USER, action: 'meal_photo' }, work);

      const error = await caught(gate.run({ userId: USER, action: 'meal_photo' }, work));

      expect(error.code).toBe('AI_QUOTA_EXCEEDED');
      expect(error.kind).toBe('rate_limited');
      expect(STATUS_BY_KIND[error.kind]).toBe(429);
      expect(error.message).toContain('Daily limit for this AI feature (2 requests) has been reached.');
      expect(error.details).toMatchObject({ scope: 'feature', action: 'meal_photo', limit: 2, used: 2 });
      expect(error.details).toHaveProperty('resetsAt', '2026-11-13T00:00:00.000Z');
      expect(work).toHaveBeenCalledTimes(2);
      expect(repo.store.actionCount(USER, 'meal_photo')).toBe(2);
    });

    it('is tracked per user and per action', async () => {
      repo.limits = { ...LIMITS, mealPhotoDailyLimit: 1 };
      await gate.run({ userId: USER, action: 'meal_photo' }, work);

      expect((await caught(gate.run({ userId: USER, action: 'meal_photo' }, work))).code).toBe(
        'AI_QUOTA_EXCEEDED',
      );
      await expect(gate.run({ userId: OTHER_USER, action: 'meal_photo' }, work)).resolves.toBe('ok');
      await expect(gate.run({ userId: USER, action: 'voice_meal' }, work)).resolves.toBe('ok');
    });
  });

  describe('total (global) daily quota', () => {
    it('caps the sum of all AI actions per user, even when every individual limit still has room', async () => {
      repo.limits = { ...LIMITS, dailyGlobalLimit: 3 };
      await gate.run({ userId: USER, action: 'coach_chat' }, work);
      await gate.run({ userId: USER, action: 'coach_chat' }, work);
      await gate.run({ userId: USER, action: 'meal_photo' }, work);

      const error = await caught(gate.run({ userId: USER, action: 'voice_meal' }, work));

      expect(error.code).toBe('AI_QUOTA_EXCEEDED');
      expect(STATUS_BY_KIND[error.kind]).toBe(429);
      expect(error.message).toContain('Daily limit for AI usage (3 requests across all AI features)');
      expect(error.details).toMatchObject({ scope: 'total', limit: 3, used: 3 });
      expect(work).toHaveBeenCalledTimes(3);
      expect(repo.store.totalCount(USER)).toBe(3);
    });

    it('does not affect other users', async () => {
      repo.limits = { ...LIMITS, dailyGlobalLimit: 1 };
      await gate.run({ userId: USER, action: 'coach_chat' }, work);

      expect((await caught(gate.run({ userId: USER, action: 'meal_photo' }, work))).code).toBe(
        'AI_QUOTA_EXCEEDED',
      );
      await expect(gate.run({ userId: OTHER_USER, action: 'meal_photo' }, work)).resolves.toBe('ok');
    });
  });

  describe('missing or corrupt limit configuration never means unlimited', () => {
    it('falls back to the documented defaults when the ai.limits row is missing', async () => {
      repo.limits = null;
      for (let i = 0; i < 10; i += 1) await gate.run({ userId: USER, action: 'meal_photo' }, work);

      expect((await caught(gate.run({ userId: USER, action: 'meal_photo' }, work))).code).toBe(
        'AI_QUOTA_EXCEEDED',
      );
    });

    it.each([-1, 2.5, 'lots', null, Number.NaN])('ignores the invalid stored limit %s', async (bad) => {
      repo.limits = { ...LIMITS, mealPhotoDailyLimit: bad };
      for (let i = 0; i < 10; i += 1) await gate.run({ userId: USER, action: 'meal_photo' }, work);

      expect((await caught(gate.run({ userId: USER, action: 'meal_photo' }, work))).code).toBe(
        'AI_QUOTA_EXCEEDED',
      );
    });

    it('a stored limit of 0 blocks the feature', async () => {
      repo.limits = { ...LIMITS, coachChatDailyLimit: 0 };

      expect((await caught(gate.run({ userId: USER, action: 'coach_chat' }, work))).code).toBe(
        'AI_QUOTA_EXCEEDED',
      );
      expect(work).not.toHaveBeenCalled();
    });

    it('fails closed (work never runs) when settings cannot be read', async () => {
      repo.failSettingsRead = true;

      await expect(gate.run({ userId: USER, action: 'coach_chat' }, work)).rejects.toThrow(
        'database unavailable',
      );
      expect(work).not.toHaveBeenCalled();
      expect(repo.store.reserveCalls).toBe(0);
    });
  });

  describe('concurrent requests cannot bypass a quota', () => {
    it('admits exactly `limit` of 40 parallel requests for the same user and action', async () => {
      repo.limits = { ...LIMITS, mealPhotoDailyLimit: 10 };

      const results = await Promise.allSettled(
        Array.from({ length: 40 }, () => gate.run({ userId: USER, action: 'meal_photo' }, work)),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(10);
      expect(rejected).toHaveLength(30);
      expect(rejected.every((r) => isAppError(r.reason) && r.reason.code === 'AI_QUOTA_EXCEEDED')).toBe(true);
      expect(work).toHaveBeenCalledTimes(10);
      expect(repo.store.actionCount(USER, 'meal_photo')).toBe(10);
    });

    it('admits exactly `dailyGlobalLimit` of 40 parallel requests spread across all actions', async () => {
      repo.limits = { ...LIMITS, dailyGlobalLimit: 7 };
      const actions: AiUsageAction[] = ['coach_chat', 'meal_photo', 'voice_meal', 'workout_generator'];

      const results = await Promise.allSettled(
        Array.from({ length: 40 }, (_, i) => gate.run({ userId: USER, action: actions[i % 4]! }, work)),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(7);
      expect(work).toHaveBeenCalledTimes(7);
      expect(repo.store.totalCount(USER)).toBe(7);
    });

    it('parallel requests of different users do not consume each other’s quota', async () => {
      repo.limits = { ...LIMITS, coachChatDailyLimit: 5 };

      const results = await Promise.allSettled([
        ...Array.from({ length: 12 }, () => gate.run({ userId: USER, action: 'coach_chat' }, work)),
        ...Array.from({ length: 12 }, () => gate.run({ userId: OTHER_USER, action: 'coach_chat' }, work)),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
      expect(repo.store.actionCount(USER, 'coach_chat')).toBe(5);
      expect(repo.store.actionCount(OTHER_USER, 'coach_chat')).toBe(5);
    });
  });

  describe('billing policy: what consumes quota', () => {
    it('refunds the unit when the work fails before the provider was called', async () => {
      const failing = vi
        .fn()
        .mockRejectedValue(new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'not configured'));

      await expect(gate.run({ userId: USER, action: 'meal_photo' }, failing)).rejects.toThrow(
        'not configured',
      );

      expect(repo.store.actionCount(USER, 'meal_photo')).toBe(0);
      expect(repo.store.totalCount(USER)).toBe(0);
    });

    it('keeps the unit when the provider call was dispatched and then failed', async () => {
      const providerFailure = vi.fn().mockImplementation(async () => {
        markAiRequestDispatched();
        throw new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'provider timed out');
      });

      await expect(gate.run({ userId: USER, action: 'meal_photo' }, providerFailure)).rejects.toThrow(
        'provider timed out',
      );

      expect(repo.store.actionCount(USER, 'meal_photo')).toBe(1);
    });

    it('keeps the unit on success', async () => {
      await gate.run({ userId: USER, action: 'voice_meal' }, work);

      expect(repo.store.actionCount(USER, 'voice_meal')).toBe(1);
    });

    it('a failed refund never masks the original error', async () => {
      repo.releaseAiUsage = () => Promise.reject(new Error('refund failed'));
      const failing = vi.fn().mockRejectedValue(new Error('original failure'));

      await expect(gate.run({ userId: USER, action: 'meal_photo' }, failing)).rejects.toThrow(
        'original failure',
      );
    });

    it('repeated failures before dispatch cannot be used to exhaust or bypass the quota', async () => {
      repo.limits = { ...LIMITS, mealPhotoDailyLimit: 2 };
      const failing = vi.fn().mockRejectedValue(new Error('boom'));

      for (let i = 0; i < 6; i += 1)
        await expect(gate.run({ userId: USER, action: 'meal_photo' }, failing)).rejects.toThrow('boom');

      expect(repo.store.actionCount(USER, 'meal_photo')).toBe(0);
      await expect(gate.run({ userId: USER, action: 'meal_photo' }, work)).resolves.toBe('ok');
    });
  });

  describe('user attribution', () => {
    it('exposes the authenticated user and action to provider adapters while the work runs', async () => {
      let seen: ReturnType<typeof currentAiRequestContext>;

      await gate.run({ userId: USER, action: 'voice_meal' }, async () => {
        seen = currentAiRequestContext();
        return 'ok';
      });

      expect(seen).toMatchObject({ userId: USER, action: 'voice_meal', dispatched: false });
      expect(currentAiRequestContext()).toBeUndefined();
    });

    it('keeps concurrent requests of different users isolated from each other', async () => {
      const seen: string[] = [];
      await Promise.all(
        [USER, OTHER_USER, USER, OTHER_USER].map((userId) =>
          gate.run({ userId, action: 'coach_chat' }, async () => {
            await new Promise((resolve) => setImmediate(resolve));
            seen.push(`${userId}->${currentAiRequestContext()?.userId}`);
          }),
        ),
      );

      expect(seen.every((entry) => entry.split('->')[0] === entry.split('->')[1])).toBe(true);
    });
  });
});

describe('Python-served AI usage is recorded for the authenticated user', () => {
  const geminiConfig = (): GeminiConfigRecord => ({
    provider: 'google_gemini',
    encryptedApiKey: null,
    keyMask: null,
    previousEncryptedApiKey: null,
    previousKeyMask: null,
    defaultModel: 'gemini-2.5-flash',
    fallbackModel: 'gemini-3.1-flash-lite',
    coachModel: 'gemini-2.5-flash',
    mealPhotoModel: 'gemini-2.5-flash',
    voiceMealModel: 'gemini-2.5-flash',
    workoutGeneratorModel: 'gemini-2.5-flash',
    version: 1,
    updatedBy: null,
    updatedAt: new Date().toISOString(),
  });

  const pythonReply = {
    outcome: 'ok',
    usage: {
      model: 'gemini-2.5-flash',
      isFallback: false,
      inputTokens: 10,
      outputTokens: 5,
      cachedTokens: 0,
      thinkingTokens: 0,
      totalTokens: 15,
      durationMs: 42,
    },
  };

  const build = (postJson: Mock) => {
    const settings = new FakeSettingsRepo();
    const recorded: { userId: string | null; feature: string; status: string }[] = [];
    const repo = Object.assign(settings, {
      getGeminiConfig: async () => geminiConfig(),
      getGeminiModelsWithPricing: async () => [],
      recordGeminiUsage: async (event: { userId: string | null; feature: string; status: string }) => {
        recorded.push({ userId: event.userId, feature: event.feature, status: event.status });
      },
    });
    const runtime = new GeminiRuntimeService({
      repo: repo as unknown as AppSettingsRepository,
      encryptionKey: 'unit-test-encryption-key-unit-test-key',
    });
    const gate = new AiUsageGateService(
      new CheckAndRecordAiQuotaUseCase(repo as unknown as AppSettingsRepository),
    );
    const call = (feature: GeminiFeature, requestId: string) =>
      callPythonAi({
        client: { postJson } as unknown as PythonAiClient,
        path: '/internal/v1/ai/test',
        scope: 'ai:test',
        userId: currentAiRequestContext()?.userId ?? '',
        requestId,
        timeoutMs: 1_000,
        body: {},
        schema: z.object({ outcome: z.string(), usage: pythonUsageSchema }),
        feature,
        usageRecorder: runtime,
        label: 'Python test call',
        unavailableMessage: 'AI is unavailable.',
      });
    return { settings, gate, recorded, call };
  };

  it('stores the user id of the admitted request on a successful Python call', async () => {
    const { gate, recorded, call } = build(vi.fn().mockResolvedValue(pythonReply));

    await gate.run({ userId: USER, action: 'meal_photo' }, () => call('meal_photo', 'req-1'));

    await vi.waitFor(() =>
      expect(recorded).toEqual([{ userId: USER, feature: 'meal_photo', status: 'success' }]),
    );
  });

  it('records no event for a failed Python call, and a dispatched failure keeps the quota unit', async () => {
    const postJson = vi
      .fn()
      .mockRejectedValue(
        new PythonAiError('provider_unavailable', 'Gemini overloaded', { dispatched: true }),
      );
    const { settings, gate, recorded, call } = build(postJson);

    await expect(
      gate.run({ userId: USER, action: 'coach_chat' }, () => call('coach_chat', 'req-2')),
    ).rejects.toBeInstanceOf(AppError);

    expect(recorded).toEqual([]);
    expect(settings.store.actionCount(USER, 'coach_chat')).toBe(1);
  });

  it('refunds the unit when Python was never reached, because Gemini was never called', async () => {
    const postJson = vi
      .fn()
      .mockRejectedValue(new PythonAiError('unreachable', 'connection refused', { dispatched: false }));
    const { settings, gate, recorded, call } = build(postJson);

    await expect(
      gate.run({ userId: USER, action: 'meal_photo' }, () => call('meal_photo', 'req-3')),
    ).rejects.toBeInstanceOf(AppError);

    expect(recorded).toEqual([]);
    expect(settings.store.actionCount(USER, 'meal_photo')).toBe(0);
  });

  it('attributes concurrent calls of different users to the right user', async () => {
    const { gate, recorded, call } = build(vi.fn().mockResolvedValue(pythonReply));

    await Promise.all(
      [USER, OTHER_USER, USER, OTHER_USER].map((userId, index) =>
        gate.run({ userId, action: 'coach_chat' }, async () => {
          await new Promise((resolve) => setImmediate(resolve));
          return call('coach_chat', `req-c-${index}`);
        }),
      ),
    );

    await vi.waitFor(() => expect(recorded).toHaveLength(4));
    expect(recorded.filter((r) => r.userId === USER)).toHaveLength(2);
    expect(recorded.filter((r) => r.userId === OTHER_USER)).toHaveLength(2);
  });
});
