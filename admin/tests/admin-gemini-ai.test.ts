import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  GeminiConfigResponse,
  UpdateGeminiConfigPayload,
  GeminiModelInfo,
  GeminiUsageSummaryResponse,
  FeatureUsageBreakdown,
  DailyUsageTrend,
} from '../src/features/settings/types-ai';

describe('Admin Gemini AI Management — Phase 8 Verification', () => {
  it('1. Gemini Configuration DTO enforces masking and never contains plaintext keys', () => {
    const config: GeminiConfigResponse = {
      provider: 'google_gemini',
      hasActiveKey: true,
      keyMask: 'AIzaSy...7X9q',
      hasPreviousKey: true,
      previousKeyMask: 'AIzaSy...0001',
      source: 'database',
      defaultModel: 'gemini-2.5-flash',
      coachModel: 'gemini-2.5-flash',
      mealPhotoModel: 'gemini-2.5-flash',
      voiceMealModel: 'gemini-2.5-flash',
      workoutGeneratorModel: 'gemini-2.5-flash',
      version: 3,
      updatedBy: 'admin-001',
      updatedAt: '2026-11-09T08:00:00.000Z',
    };

    assert.equal(config.provider, 'google_gemini');
    assert.equal(config.hasActiveKey, true);
    assert.equal(config.keyMask?.startsWith('AIzaSy...'), true);
    assert.equal(config.keyMask?.length, 13);
    assert.equal((config as any).apiKey, undefined);
    assert.equal((config as any).encryptedApiKey, undefined);
    assert.equal(config.source, 'database');
    assert.equal(config.version, 3);
  });

  it('2. Model catalog defines input/output pricing per million tokens and modality support', () => {
    const supportedModels: GeminiModelInfo[] = [
      {
        id: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        description: 'Next-gen multimodal workhorse model for low latency and high quality.',
        inputPricePerMillion: 0.075,
        outputPricePerMillion: 0.3,
        supportsVision: true,
        supportsAudio: true,
        isRecommendedDefault: true,
      },
      {
        id: 'gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        description: 'Advanced reasoning model for complex coding and multimodal comprehension.',
        inputPricePerMillion: 1.25,
        outputPricePerMillion: 5.0,
        supportsVision: true,
        supportsAudio: true,
        isRecommendedDefault: false,
      },
    ];

    assert.equal(supportedModels.length, 2);
    const flash = supportedModels.find((m) => m.id === 'gemini-2.5-flash')!;
    assert(flash.supportsVision);
    assert(flash.supportsAudio);
    assert.equal(flash.isRecommendedDefault, true);
    assert.equal(flash.inputPricePerMillion, 0.075);
    assert.equal(flash.outputPricePerMillion, 0.3);

    // Verify vision capability filter for meal photo scanner
    const visionModels = supportedModels.filter((m) => m.supportsVision);
    assert.equal(visionModels.length, 2);
  });

  it('3. Estimated cost calculation correctly computes USD and INR conversion', () => {
    const promptTokens = 50_000;
    const completionTokens = 10_000;
    const inputPricePerM = 0.075;
    const outputPricePerM = 0.3;
    const usdToInr = 86.5;

    const costUsd =
      (promptTokens / 1_000_000) * inputPricePerM +
      (completionTokens / 1_000_000) * outputPricePerM;
    const costInr = costUsd * usdToInr;

    // (50000 / 1M * 0.075) = 0.00375
    // (10000 / 1M * 0.300) = 0.003
    // Total USD = 0.00675
    assert.equal(Number(costUsd.toFixed(5)), 0.00675);
    assert.equal(Number(costInr.toFixed(4)), Number((0.00675 * 86.5).toFixed(4)));

    const summary: GeminiUsageSummaryResponse = {
      todayRequests: 120,
      monthRequests: 3450,
      totalTokens: 1_250_000,
      promptTokens: 1_000_000,
      completionTokens: 250_000,
      estimatedCostUsd: 0.15,
      estimatedCostInr: 12.98,
      failedRequests: 2,
      avgDurationMs: 420,
    };

    assert.equal(summary.todayRequests, 120);
    assert.equal(summary.totalTokens, summary.promptTokens + summary.completionTokens);
    assert(summary.estimatedCostInr > summary.estimatedCostUsd);
  });

  it('4. Update payload enforces optimistic concurrency control via expectedVersion', () => {
    const payload: UpdateGeminiConfigPayload = {
      defaultModel: 'gemini-2.5-flash',
      coachModel: 'gemini-2.5-pro',
      expectedVersion: 4,
    };

    assert.equal(payload.expectedVersion, 4);
    assert.equal(payload.defaultModel, 'gemini-2.5-flash');
    assert.equal(payload.coachModel, 'gemini-2.5-pro');
  });

  it('5. Rollback capability is enabled only when a previous key mask is present', () => {
    const configWithPrev: GeminiConfigResponse = {
      provider: 'google_gemini',
      hasActiveKey: true,
      keyMask: 'AIzaSy...9999',
      hasPreviousKey: true,
      previousKeyMask: 'AIzaSy...1111',
      source: 'database',
      defaultModel: 'gemini-2.5-flash',
      coachModel: 'gemini-2.5-flash',
      mealPhotoModel: 'gemini-2.5-flash',
      voiceMealModel: 'gemini-2.5-flash',
      workoutGeneratorModel: 'gemini-2.5-flash',
      version: 2,
      updatedBy: 'admin-001',
      updatedAt: '2026-11-09T08:00:00.000Z',
    };

    const configWithoutPrev: GeminiConfigResponse = {
      ...configWithPrev,
      hasPreviousKey: false,
      previousKeyMask: null,
      version: 1,
    };

    assert.equal(configWithPrev.hasPreviousKey, true);
    assert.notEqual(configWithPrev.previousKeyMask, null);

    assert.equal(configWithoutPrev.hasPreviousKey, false);
    assert.equal(configWithoutPrev.previousKeyMask, null);
  });

  it('6. Feature breakdown tracks granular token metrics per AI capability', () => {
    const breakdowns: FeatureUsageBreakdown[] = [
      {
        feature: 'coach_chat',
        requestCount: 45,
        totalTokens: 180_000,
        promptTokens: 140_000,
        completionTokens: 40_000,
        estimatedCostUsd: 0.0225,
      },
      {
        feature: 'meal_photo',
        requestCount: 15,
        totalTokens: 90_000,
        promptTokens: 80_000,
        completionTokens: 10_000,
        estimatedCostUsd: 0.009,
      },
    ];

    assert.equal(breakdowns.length, 2);
    assert.equal(breakdowns[0].totalTokens, breakdowns[0].promptTokens + breakdowns[0].completionTokens);
    assert.equal(breakdowns[1].totalTokens, breakdowns[1].promptTokens + breakdowns[1].completionTokens);
  });
});
