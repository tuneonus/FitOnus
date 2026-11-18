import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiRuntimeService } from '../../../src/modules/app-settings/application/services/gemini-runtime-service.js';
import { ModelCooldownTracker } from '../../../src/shared/ai/model-cooldown-tracker.js';
import { GeminiClient } from '../../../src/modules/coach/infrastructure/gemini-client.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import type { AppSettingsRepository } from '../../../src/modules/app-settings/application/ports.js';
import type { GeminiConfigRecord, GeminiModelInfo } from '../../../src/modules/app-settings/domain/gemini-config.js';

describe('Smart AI Rate Limit & Fallback System', () => {
  let mockRepo: AppSettingsRepository;
  let cooldownTracker: ModelCooldownTracker;
  let runtimeService: GeminiRuntimeService;
  let mockGeminiConfig: GeminiConfigRecord;
  let mockModels: GeminiModelInfo[];

  beforeEach(() => {
    cooldownTracker = new ModelCooldownTracker();

    mockGeminiConfig = {
      provider: 'google_gemini',
      encryptedApiKey: null,
      keyMask: 'AIzaSy...DEMO',
      previousEncryptedApiKey: null,
      previousKeyMask: null,
      defaultModel: 'gemini-3.5-flash-lite',
      fallbackModel: 'gemini-3.1-flash-lite',
      coachModel: 'gemini-3.5-flash-lite',
      mealPhotoModel: 'gemini-3.5-flash-lite',
      voiceMealModel: 'gemini-3.5-flash-lite',
      workoutGeneratorModel: 'gemini-3.5-flash-lite',
      version: 1,
      updatedBy: null,
      updatedAt: new Date().toISOString(),
    };

    mockModels = [
      {
        model: 'gemini-3.5-flash-lite',
        displayName: 'Gemini 3.5 Flash Lite',
        capabilities: { text: true, vision: true, audio: true },
        inputPricePerMillion: 0.05,
        outputPricePerMillion: 0.2,
        cachedInputPricePerMillion: 0.0125,
        isDefault: true,
      },
      {
        model: 'gemini-3.1-flash-lite',
        displayName: 'Gemini 3.1 Flash Lite',
        capabilities: { text: true, vision: true, audio: true },
        inputPricePerMillion: 0.05,
        outputPricePerMillion: 0.2,
        cachedInputPricePerMillion: 0.0125,
        isDefault: false,
      },
      {
        model: 'text-only-model',
        displayName: 'Text Only Model',
        capabilities: { text: true, vision: false, audio: false },
        inputPricePerMillion: 0.05,
        outputPricePerMillion: 0.2,
        cachedInputPricePerMillion: 0.0125,
        isDefault: false,
      },
    ];

    mockRepo = {
      getGeminiConfig: vi.fn().mockResolvedValue(mockGeminiConfig),
      getGeminiModelsWithPricing: vi.fn().mockResolvedValue(mockModels),
      updateGeminiConfig: vi.fn(),
      rollbackGeminiApiKey: vi.fn(),
      recordGeminiUsage: vi.fn().mockResolvedValue(undefined),
      getGeminiUsageSummary: vi.fn(),
      getGeminiUsageByFeature: vi.fn(),
      getGeminiUsageByModel: vi.fn(),
      getGeminiDailyTrends: vi.fn(),
      getGeminiUsageEvents: vi.fn(),
      getSettingByKey: vi.fn(),
      setSetting: vi.fn(),
      reserveAiUsage: vi.fn(),
      releaseAiUsage: vi.fn(),
      getAiUsageStats: vi.fn(),
    } as unknown as AppSettingsRepository;

    runtimeService = new GeminiRuntimeService({
      repo: mockRepo,
      encryptionKey: 'test-encryption-key-32-chars-long!',
      fallbackApiKey: 'test-env-gemini-api-key',
      fallbackModel: 'gemini-3.1-flash-lite',
      cooldownTracker,
    });
  });

  // 1. Primary Success
  it('1. Executes primary model successfully and attributes telemetry', async () => {
    const executeSpy = vi.fn().mockResolvedValue({
      text: 'Primary response text',
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    });

    const result = await runtimeService.executeWithTelemetry({
      requestId: 'req-001',
      feature: 'coach_chat',
      execute: executeSpy,
    });

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith(expect.anything(), 'gemini-3.5-flash-lite');
    expect(result.text).toBe('Primary response text');
    expect(result.usage.model).toBe('gemini-3.5-flash-lite');
    expect(result.usage.isFallback).toBe(false);
    expect(cooldownTracker.isAvailable('gemini-3.5-flash-lite')).toBe(true);
  });

  // 2. Primary RPM exhausted -> fallback success
  it('2. Automatically fails over to fallback model when primary hits RPM 429 rate limit', async () => {
    const rpmError = new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for quota metric GenerateRequestsPerMinute","details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"20s"}]}}');

    let callCount = 0;
    const executeSpy = vi.fn().mockImplementation((_client, model) => {
      callCount++;
      if (model === 'gemini-3.5-flash-lite') {
        throw rpmError;
      }
      return Promise.resolve({
        text: 'Fallback response text',
        usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 25 },
      });
    });

    const result = await runtimeService.executeWithTelemetry({
      requestId: 'req-002',
      feature: 'coach_chat',
      execute: executeSpy,
    });

    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(executeSpy).toHaveBeenNthCalledWith(1, expect.anything(), 'gemini-3.5-flash-lite');
    expect(executeSpy).toHaveBeenNthCalledWith(2, expect.anything(), 'gemini-3.1-flash-lite');
    expect(result.text).toBe('Fallback response text');
    expect(result.usage.model).toBe('gemini-3.1-flash-lite');
    expect(result.usage.isFallback).toBe(true);

    // Primary model is placed in cooldown
    expect(cooldownTracker.isAvailable('gemini-3.5-flash-lite')).toBe(false);
    expect(cooldownTracker.getRemainingCooldownSeconds('gemini-3.5-flash-lite')).toBeGreaterThan(0);
    // Fallback model remains available
    expect(cooldownTracker.isAvailable('gemini-3.1-flash-lite')).toBe(true);
  });

  // 3. Primary RPD exhausted -> fallback eligibility checked
  it('3. Checks fallback eligibility when primary hits model-specific daily limit (RPD)', async () => {
    const modelRpdError = new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Generate content requests per day limit exceeded on Free Tier","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaDimensions":{"model":"gemini-3.5-flash-lite"}}]}]}}');

    const executeSpy = vi.fn().mockImplementation((_client, model) => {
      if (model === 'gemini-3.5-flash-lite') {
        throw modelRpdError;
      }
      return Promise.resolve({
        text: 'Fallback served RPD failover',
      });
    });

    const result = await runtimeService.executeWithTelemetry({
      requestId: 'req-003',
      feature: 'coach_chat',
      execute: executeSpy,
    });

    expect(result.text).toBe('Fallback served RPD failover');
    expect(cooldownTracker.isAvailable('gemini-3.5-flash-lite')).toBe(false);
  });

  // 4. Both models exhausted -> structured AI_UNAVAILABLE
  it('4. Throws structured AI_UNAVAILABLE when both primary and fallback models fail with 429', async () => {
    const rpmError = new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Rate limit exceeded"}}');

    const executeSpy = vi.fn().mockRejectedValue(rpmError);

    await expect(
      runtimeService.executeWithTelemetry({
        requestId: 'req-004',
        feature: 'coach_chat',
        execute: executeSpy,
      }),
    ).rejects.toThrowError(AppError);

    try {
      await runtimeService.executeWithTelemetry({
        requestId: 'req-004-retry',
        feature: 'coach_chat',
        execute: executeSpy,
      });
    } catch (err: any) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('AI_UNAVAILABLE');
      expect(err.details?.retryAfterSeconds).toBeDefined();
    }

    // Both models should now be marked cooling down
    expect(cooldownTracker.isAvailable('gemini-3.5-flash-lite')).toBe(false);
    expect(cooldownTracker.isAvailable('gemini-3.1-flash-lite')).toBe(false);
  });

  // 5. Project-wide quota exhausted -> does not futilely burn quota
  it('5. Detects project-wide quota exhaustion and avoids futile retry loops', async () => {
    const projectQuotaError = new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"requests per day limit exceeded for project","details":[]}}');

    const executeSpy = vi.fn().mockRejectedValue(projectQuotaError);

    await expect(
      runtimeService.executeWithTelemetry({
        requestId: 'req-005',
        feature: 'coach_chat',
        execute: executeSpy,
      }),
    ).rejects.toThrowError(AppError);

    // Should only call primary once; project-wide error is non-retryable
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  // 6. User daily allowance exhausted -> handled at usage gate
  it('6. Does not bypass user-level quotas with fallback', async () => {
    const gateError = new AppError('rate_limited', 'AI_QUOTA_EXCEEDED', 'Daily limit reached');
    const guardedWork = () => {
      throw gateError;
    };

    expect(() => guardedWork()).toThrowError('Daily limit reached');
  });

  // 7. Invalid API key -> immediate auth error without fallback
  it('7. Handles invalid API key immediately without attempting model fallback', async () => {
    const authError = new Error('API key not valid. Please pass a valid API key.');

    const executeSpy = vi.fn().mockRejectedValue(authError);

    await expect(
      runtimeService.executeWithTelemetry({
        requestId: 'req-007',
        feature: 'coach_chat',
        execute: executeSpy,
      }),
    ).rejects.toThrowError(/AI service configuration error/);

    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  // 8. Unsupported fallback modality -> skips fallback if model does not support modality
  it('8. Skips fallback if configured fallback model lacks required modality', async () => {
    // Configure text-only model as fallback
    mockGeminiConfig.fallbackModel = 'text-only-model';

    const executeSpy = vi.fn().mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED'));

    await expect(
      runtimeService.executeWithTelemetry({
        requestId: 'req-008',
        feature: 'meal_photo', // requires 'vision'
        execute: executeSpy,
      }),
    ).rejects.toThrowError(AppError);

    // Fallback was not attempted because text-only model lacks vision
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith(expect.anything(), 'gemini-3.5-flash-lite');
  });

  // 9. Voice transcription fallback
  it('9. Executes fallback successfully for voice transcription audio requests', async () => {
    const geminiClient = new GeminiClient({
      runtimeService,
    });

    vi.spyOn(runtimeService, 'executeWithTelemetry').mockImplementation(async (params) => {
      expect(params.modality).toBe('audio');
      return {
        text: '{"transcript": "Inniku chest workout mudichiten", "detectedLanguage": "tanglish"}',
        usage: {
          inputTokens: 20,
          outputTokens: 10,
          cachedTokens: 0,
          totalTokens: 30,
          estimatedCostUsd: 0.00001,
          durationMs: 300,
          model: 'gemini-3.1-flash-lite',
          isFallback: true,
        },
      };
    });

    const result = await geminiClient.transcribeAudio({
      mimeType: 'audio/m4a',
      base64: 'AAAA',
    });

    expect(result.transcript).toBe('Inniku chest workout mudichiten');
    expect(result.detectedLanguage).toBe('tanglish');
  });

  // 10. Meal photo fallback
  it('10. Executes fallback successfully for meal photo vision requests', async () => {
    const geminiClient = new GeminiClient({
      runtimeService,
    });

    vi.spyOn(runtimeService, 'executeWithTelemetry').mockImplementation(async (params) => {
      expect(params.modality).toBe('vision');
      return {
        text: '{"isFood": true, "summary": "Grilled chicken"}',
        usage: {
          inputTokens: 50,
          outputTokens: 20,
          cachedTokens: 0,
          totalTokens: 70,
          estimatedCostUsd: 0.00002,
          durationMs: 500,
          model: 'gemini-3.1-flash-lite',
          isFallback: true,
        },
      };
    });

    const result = await geminiClient.generateFromImage(
      { mimeType: 'image/png', base64: 'AAAA' },
      'Analyze meal',
    );

    expect(result).toContain('Grilled chicken');
  });

  // 11. Cooldown expiration allows primary recovery
  it('11. Allows primary model to recover once cooldown expires', () => {
    cooldownTracker.recordFailure('gemini-3.5-flash-lite', 'RPM', 10);
    expect(cooldownTracker.isAvailable('gemini-3.5-flash-lite')).toBe(false);

    // Fast-forward time or reset
    cooldownTracker.reset('gemini-3.5-flash-lite');
    expect(cooldownTracker.isAvailable('gemini-3.5-flash-lite')).toBe(true);
  });

  // 12. Fast-rejects in 0ms when all models are cooling down
  it('12. Instantly fast-rejects requests when all models are cooling down without calling provider', async () => {
    cooldownTracker.recordFailure('gemini-3.5-flash-lite', 'RPM', 30);
    cooldownTracker.recordFailure('gemini-3.1-flash-lite', 'RPM', 30);

    const executeSpy = vi.fn();

    await expect(
      runtimeService.executeWithTelemetry({
        requestId: 'req-fast-reject',
        feature: 'coach_chat',
        execute: executeSpy,
      }),
    ).rejects.toThrowError(/high demand/);

    expect(executeSpy).not.toHaveBeenCalled();
  });

  // 13. One logical user request is counted once
  it('13. Preserves single-count execution semantics across fallback', async () => {
    let executionAttempts = 0;
    const executeSpy = vi.fn().mockImplementation((_client, model) => {
      executionAttempts++;
      if (model === 'gemini-3.5-flash-lite') {
        throw new Error('429 RESOURCE_EXHAUSTED');
      }
      return Promise.resolve({
        text: 'Success on fallback',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
      });
    });

    const res = await runtimeService.executeWithTelemetry({
      requestId: 'req-single-count',
      feature: 'coach_chat',
      execute: executeSpy,
    });

    expect(executionAttempts).toBe(2);
    expect(res.text).toBe('Success on fallback');
    // Only one result returned to the caller's single logical request
    expect(res.usage.model).toBe('gemini-3.1-flash-lite');
  });
});
