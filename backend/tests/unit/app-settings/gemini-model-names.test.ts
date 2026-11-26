import { describe, expect, it } from 'vitest';
import { GeminiRuntimeService } from '../../../src/modules/app-settings/application/services/gemini-runtime-service.js';
import type { AppSettingsRepository } from '../../../src/modules/app-settings/index.js';
import type { GeminiConfigRecord } from '../../../src/modules/app-settings/domain/gemini-config.js';

const config = (overrides: Partial<GeminiConfigRecord> = {}): GeminiConfigRecord =>
  ({
    provider: 'google_gemini',
    encryptedApiKey: null, // no key stored in Node: Python holds its own
    keyMask: null,
    previousEncryptedApiKey: null,
    previousKeyMask: null,
    defaultModel: 'default-model',
    fallbackModel: 'backup-model',
    coachModel: 'coach-model',
    mealPhotoModel: 'photo-model',
    voiceMealModel: 'voice-model',
    workoutGeneratorModel: 'workout-model',
    version: 1,
    updatedBy: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }) as GeminiConfigRecord;

const runtime = (cfg: GeminiConfigRecord, fallbackApiKey?: string) =>
  new GeminiRuntimeService({
    repo: {
      getGeminiConfig: () => Promise.resolve(cfg),
      getGeminiModelsWithPricing: () => Promise.resolve([]),
    } as unknown as AppSettingsRepository,
    encryptionKey: 'k'.repeat(32),
    ...(fallbackApiKey ? { fallbackApiKey } : {}),
    fallbackModel: 'env-backup-model',
  });

describe('GeminiRuntimeService.resolveModelNames', () => {
  it('returns the admin-configured coach models even when Node has no API key', async () => {
    const service = runtime(config());

    await expect(service.resolveModelNames('coach_chat')).resolves.toEqual({
      primaryModel: 'coach-model',
      fallbackModel: 'backup-model',
    });
    // The key-requiring variant still refuses, exactly as before.
    await expect(service.resolveExecutionTarget('coach_chat')).rejects.toThrow(/not configured/i);
  });

  it('picks each feature its own model and falls back to the default model', async () => {
    const service = runtime(config({ coachModel: '' as never }));
    expect((await service.resolveModelNames('coach_chat')).primaryModel).toBe('default-model');
    expect((await service.resolveModelNames('meal_photo')).primaryModel).toBe('photo-model');
  });

  it('resolveExecutionTarget keeps returning the same models plus the key', async () => {
    const service = runtime(config(), 'env-key');
    const target = await service.resolveExecutionTarget('coach_chat');
    expect(target).toMatchObject({
      apiKey: 'env-key',
      primaryModel: 'coach-model',
      fallbackModel: 'backup-model',
    });
  });
});
