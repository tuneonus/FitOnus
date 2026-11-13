import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createAppSettingsController } from '../../../src/modules/app-settings/interface/app-settings.controller.js';
import {
  createAdminAiRoutes,
} from '../../../src/modules/app-settings/interface/app-settings.routes.js';
import { GetAppSettingsUseCase } from '../../../src/modules/app-settings/application/use-cases/get-app-settings.js';
import { UpdateAppSettingsUseCase } from '../../../src/modules/app-settings/application/use-cases/update-app-settings.js';
import { GetPublicAppConfigUseCase } from '../../../src/modules/app-settings/application/use-cases/get-public-app-config.js';
import { GetGeminiConfigUseCase } from '../../../src/modules/app-settings/application/use-cases/get-gemini-config.js';
import { UpdateGeminiConfigUseCase } from '../../../src/modules/app-settings/application/use-cases/update-gemini-config.js';
import { TestGeminiConnectionUseCase } from '../../../src/modules/app-settings/application/use-cases/test-gemini-connection.js';
import { RollbackGeminiKeyUseCase } from '../../../src/modules/app-settings/application/use-cases/rollback-gemini-key.js';
import { GetGeminiUsageAnalyticsUseCases } from '../../../src/modules/app-settings/application/use-cases/get-gemini-usage.js';
import { GeminiRuntimeService } from '../../../src/modules/app-settings/application/services/gemini-runtime-service.js';
import type { AppSettingsRepository } from '../../../src/modules/app-settings/application/ports.js';
import type {
  GeminiConfigRecord,
  GeminiModelInfo,
  GeminiUsageEvent,
  GeminiUsageSummary,
} from '../../../src/modules/app-settings/domain/gemini-config.js';
import type { Actor } from '../../../src/shared/auth/actor.js';
import { decryptSecret } from '../../../src/shared/security/encryption.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { createLogger } from '../../../src/shared/logging/logger.js';

const TEST_ENCRYPTION_KEY = 'test-secret-key-12345678901234567890';

class InMemoryAppSettingsRepo implements AppSettingsRepository {
  public geminiConfig: GeminiConfigRecord = {
    provider: 'google_gemini',
    encryptedApiKey: null,
    keyMask: null,
    previousEncryptedApiKey: null,
    previousKeyMask: null,
    defaultModel: 'gemini-2.5-flash',
    coachModel: 'gemini-2.5-flash',
    mealPhotoModel: 'gemini-2.5-flash',
    voiceMealModel: 'gemini-2.5-flash',
    workoutGeneratorModel: 'gemini-2.5-flash',
    version: 1,
    updatedBy: null,
    updatedAt: new Date().toISOString(),
  };

  public models: GeminiModelInfo[] = [
    {
      model: 'gemini-2.5-flash',
      displayName: 'Gemini 2.5 Flash',
      capabilities: { text: true, vision: true, audio: true },
      inputPricePerMillion: 0.075,
      outputPricePerMillion: 0.3,
      cachedInputPricePerMillion: 0.01875,
      isDefault: true,
    },
    {
      model: 'gemini-2.5-flash-lite',
      displayName: 'Gemini 2.5 Flash Lite',
      capabilities: { text: true, vision: true, audio: false },
      inputPricePerMillion: 0.0375,
      outputPricePerMillion: 0.15,
      cachedInputPricePerMillion: 0.009375,
      isDefault: false,
    },
    {
      model: 'gemini-2.5-pro',
      displayName: 'Gemini 2.5 Pro',
      capabilities: { text: true, vision: true, audio: true },
      inputPricePerMillion: 1.25,
      outputPricePerMillion: 5.0,
      cachedInputPricePerMillion: 0.3125,
      isDefault: false,
    },
  ];

  public usageEvents: GeminiUsageEvent[] = [];

  // Implement required ports
  async getAllSettings() {
    return [];
  }
  async getSettingByKey() {
    return null;
  }
  async updateSetting() {
    return {} as any;
  }
  async getPublicConfig() {
    return {} as any;
  }
  async getTodayAiUsageStats() {
    return {
      todayTotalRequests: 0,
      todayActiveAiUsers: 0,
      breakdownByAction: { coach_chat: 0, meal_photo: 0, voice_meal: 0, workout_generator: 0 },
    };
  }
  async getUserTodayAiUsage() {
    return 0;
  }
  async reserveAiUsage() {
    return { allowed: true as const, usageDate: '2026-11-12', actionCount: 1, totalCount: 1 };
  }
  async releaseAiUsage() {}

  // Gemini Ports
  async getGeminiConfig(): Promise<GeminiConfigRecord> {
    return { ...this.geminiConfig };
  }

  async updateGeminiConfig(
    updates: Partial<GeminiConfigRecord>,
    expectedVersion?: number,
    updatedBy?: string,
  ): Promise<GeminiConfigRecord> {
    if (expectedVersion !== undefined && expectedVersion !== this.geminiConfig.version) {
      throw new AppError(
        'conflict',
        'VERSION_CONFLICT',
        `Gemini config version conflict (expected ${expectedVersion}, current ${this.geminiConfig.version})`,
      );
    }

    this.geminiConfig = {
      ...this.geminiConfig,
      ...updates,
      version: this.geminiConfig.version + 1,
      updatedBy: updatedBy ?? this.geminiConfig.updatedBy,
      updatedAt: new Date().toISOString(),
    };
    return { ...this.geminiConfig };
  }

  async rollbackGeminiApiKey(
    expectedVersion?: number,
    updatedBy?: string,
  ): Promise<GeminiConfigRecord> {
    if (!this.geminiConfig.previousEncryptedApiKey) {
      const err = new Error('No previous key') as any;
      err.status = 400;
      err.code = 'BAD_REQUEST';
      throw err;
    }

    return this.updateGeminiConfig(
      {
        encryptedApiKey: this.geminiConfig.previousEncryptedApiKey,
        keyMask: this.geminiConfig.previousKeyMask,
        previousEncryptedApiKey: this.geminiConfig.encryptedApiKey,
        previousKeyMask: this.geminiConfig.keyMask,
      },
      expectedVersion,
      updatedBy,
    );
  }

  async getGeminiModelsWithPricing(): Promise<GeminiModelInfo[]> {
    return [...this.models];
  }

  async recordGeminiUsage(event: Omit<GeminiUsageEvent, 'id' | 'createdAt'>): Promise<void> {
    this.usageEvents.push({
      ...event,
      id: `evt-${this.usageEvents.length + 1}`,
      createdAt: new Date().toISOString(),
    });
  }

  async getGeminiUsageEvents() {
    return {
      items: [...this.usageEvents],
      total: this.usageEvents.length,
    };
  }

  async getGeminiUsageSummary(): Promise<GeminiUsageSummary> {
    const totalRequests = this.usageEvents.length;
    const totalTokens = this.usageEvents.reduce((acc, e) => acc + e.totalTokens, 0);
    const inputTokens = this.usageEvents.reduce((acc, e) => acc + e.inputTokens, 0);
    const outputTokens = this.usageEvents.reduce((acc, e) => acc + e.outputTokens, 0);
    const cachedTokens = this.usageEvents.reduce((acc, e) => acc + e.cachedTokens, 0);
    const estimatedCostUsd = this.usageEvents.reduce((acc, e) => acc + e.estimatedCostUsd, 0);
    const failedRequests = this.usageEvents.filter((e) => e.status !== 'success').length;

    return {
      todayRequests: totalRequests,
      monthlyRequests: totalRequests,
      totalTokens,
      inputTokens,
      outputTokens,
      cachedTokens,
      estimatedMonthlyCostUsd: Number(estimatedCostUsd.toFixed(6)),
      failedRequests,
      avgDurationMs: 350,
    };
  }

  async getGeminiUsageByFeature() {
    return [
      { feature: 'coach_chat', requestCount: 10, totalTokens: 5000, estimatedCostUsd: 0.0015 },
      { feature: 'meal_photo', requestCount: 5, totalTokens: 4000, estimatedCostUsd: 0.0012 },
    ];
  }

  async getGeminiUsageByModel() {
    return [
      { model: 'gemini-2.5-flash', requestCount: 15, totalTokens: 9000, estimatedCostUsd: 0.0027 },
    ];
  }

  async getGeminiDailyTrends() {
    return [
      { date: '2026-11-09', requestCount: 15, totalTokens: 9000, estimatedCostUsd: 0.0027 },
    ];
  }
}

describe('FitOnus Admin Gemini AI Management & Security Suite', () => {
  let repo: InMemoryAppSettingsRepo;
  let auditLogs: any[] = [];

  const fakeAuditLogger = {
    async recordAuditLog(entry: any) {
      auditLogs.push(entry);
    },
  };

  const createTestApp = (actorOverride?: Partial<Actor> | null) => {
    repo = new InMemoryAppSettingsRepo();
    auditLogs = [];

    const getAppSettings = new GetAppSettingsUseCase(repo);
    const updateAppSettings = new UpdateAppSettingsUseCase({ repo, auditLogger: fakeAuditLogger });
    const getPublicAppConfig = new GetPublicAppConfigUseCase(repo);

    const getGeminiConfig = new GetGeminiConfigUseCase({
      repo,
      fallbackApiKey: 'AIzaSyENVFallbackKey12345',
      fallbackModel: 'gemini-2.5-flash',
    });

    const updateGeminiConfig = new UpdateGeminiConfigUseCase({
      repo,
      encryptionKey: TEST_ENCRYPTION_KEY,
      auditLogger: fakeAuditLogger,
    });

    const testGeminiConnection = new TestGeminiConnectionUseCase({
      repo,
      encryptionKey: TEST_ENCRYPTION_KEY,
      fallbackApiKey: 'AIzaSyENVFallbackKey12345',
      fallbackModel: 'gemini-2.5-flash',
    });

    const rollbackGeminiKey = new RollbackGeminiKeyUseCase({
      repo,
      auditLogger: fakeAuditLogger,
    });

    const geminiUsageAnalytics = new GetGeminiUsageAnalyticsUseCases(repo);

    const controller = createAppSettingsController({
      getAppSettings,
      updateAppSettings,
      getPublicAppConfig,
      getGeminiConfig,
      updateGeminiConfig,
      testGeminiConnection,
      rollbackGeminiKey,
      geminiUsageAnalytics,
    });

    const adminAiRoutes = createAdminAiRoutes('/api/v1/admin/ai', controller);

    const app = express();
    app.use(requestContext(createLogger({ level: 'error', pretty: false })));
    app.use(express.json());

    // Middleware to simulate authentication
    const authenticate: express.RequestHandler = (req, _res, next) => {
      if (actorOverride === null) {
        throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication required.');
      }
      req.actor = {
        userId: 'admin-001',
        sessionId: 'sess-001',
        role: 'admin',
        permissions: new Set(['admin:access']),
        ...actorOverride,
      };
      next();
    };

    app.use('/api/v1/admin/ai', buildRouter(adminAiRoutes.routes, { authenticate }));
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
  };

  beforeEach(() => {
    auditLogs = [];
  });

  it('1. GET /api/v1/admin/ai/configuration returns masked API key and never exposes raw secret', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/v1/admin/ai/configuration');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.provider).toBe('google_gemini');
    expect(res.body.data.defaultModel).toBe('gemini-2.5-flash');
    expect(res.body.data.featureModels).toBeDefined();
    // Key is masked (e.g. AIzaSy...2345 (from ENV))
    expect(res.body.data.keyMask).toContain('AIzaSy');
    expect(res.body.data.keyMask).not.toBe('AIzaSyENVFallbackKey12345');
    expect(res.body.data.apiKey).toBeUndefined(); // Raw secret NEVER exposed
  });

  it('1b. GET /api/v1/admin/ai/configuration rejects member requests with 403 Forbidden', async () => {
    const app = createTestApp({ role: 'member', permissions: new Set([]) });
    const res = await request(app).get('/api/v1/admin/ai/configuration');

    expect(res.status).toBe(403);
  });

  it('2. PATCH /api/v1/admin/ai/configuration encrypts API key using AES-256-GCM and logs audit', async () => {
    const app = createTestApp();
    const newKey = 'AIzaSyDuN92J438-SecretKey-4xQ9';

    const res = await request(app)
      .patch('/api/v1/admin/ai/configuration')
      .send({
        apiKey: newKey,
        defaultModel: 'gemini-2.5-pro',
        featureModels: {
          aiCoach: 'gemini-2.5-pro',
          mealPhotoScanner: 'gemini-2.5-flash',
          voiceMealEntry: 'gemini-2.5-flash',
          workoutGenerator: 'gemini-2.5-pro',
        },
        expectedVersion: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(2);
    expect(res.body.data.keyMask).toBe('AIzaSy...4xQ9');
    expect(res.body.data.defaultModel).toBe('gemini-2.5-pro');

    // Verify key was encrypted in DB
    expect(repo.geminiConfig.encryptedApiKey).not.toBeNull();
    expect(repo.geminiConfig.encryptedApiKey).not.toContain(newKey); // NOT in plaintext

    // Verify decryption succeeds with our encryption key
    const decrypted = decryptSecret(repo.geminiConfig.encryptedApiKey!, TEST_ENCRYPTION_KEY);
    expect(decrypted).toBe(newKey);

    // Verify audit log
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].action).toBe('admin.gemini_key_update');
    expect(auditLogs[0].details.newKeyMask).toBe('AIzaSy...4xQ9');
    expect(JSON.stringify(auditLogs[0])).not.toContain(newKey); // Secret never logged
  });

  it('2b. PATCH /api/v1/admin/ai/configuration rejects invalid model name with 400 validation error', async () => {
    const app = createTestApp();
    const res = await request(app)
      .patch('/api/v1/admin/ai/configuration')
      .send({
        defaultModel: 'non-existent-gpt-5-model',
        expectedVersion: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('not supported');
  });

  it('2c. PATCH /api/v1/admin/ai/configuration enforces optimistic concurrency and rejects stale version with 409', async () => {
    const app = createTestApp();
    const res = await request(app)
      .patch('/api/v1/admin/ai/configuration')
      .send({
        defaultModel: 'gemini-2.5-flash-lite',
        expectedVersion: 99, // Stale!
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('3. POST /api/v1/admin/ai/rollback-key restores previous API key', async () => {
    const app = createTestApp();

    // First, rotate key
    await request(app)
      .patch('/api/v1/admin/ai/configuration')
      .send({ apiKey: 'AIzaSyDuN92J438-KeyV1-4xQ9', expectedVersion: 1 });

    // Rotate a second time
    await request(app)
      .patch('/api/v1/admin/ai/configuration')
      .send({ apiKey: 'AIzaSyDuN92J438-KeyV2-9zW1', expectedVersion: 2 });

    expect(repo.geminiConfig.keyMask).toBe('AIzaSy...9zW1');

    // Now Rollback
    const rollbackRes = await request(app)
      .post('/api/v1/admin/ai/rollback-key')
      .send({ expectedVersion: 3 });

    expect(rollbackRes.status).toBe(200);
    expect(rollbackRes.body.data.keyMask).toBe('AIzaSy...4xQ9');

    // Verify audit log has rollback
    const rollbackLogs = auditLogs.filter((l) => l.action === 'admin.gemini_key_rollback');
    expect(rollbackLogs.length).toBe(1);
  });

  it('4. GET /api/v1/admin/ai/models returns supported models and token pricing', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/v1/admin/ai/models');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(3);

    const flash = res.body.data.find((m: any) => m.model === 'gemini-2.5-flash');
    expect(flash).toBeDefined();
    expect(flash.inputPricePerMillion).toBe(0.075);
    expect(flash.outputPricePerMillion).toBe(0.3);
    expect(flash.capabilities.vision).toBe(true);
  });

  it('5. GET /api/v1/admin/ai/usage/summary returns token consumption and cost metrics', async () => {
    const app = createTestApp();

    // Simulate recorded usage events
    repo.usageEvents.push(
      {
        id: '1',
        requestId: 'r1',
        userId: 'u1',
        feature: 'coach_chat',
        model: 'gemini-2.5-flash',
        status: 'success',
        inputTokens: 1000,
        outputTokens: 500,
        cachedTokens: 0,
        totalTokens: 1500,
        estimatedCostUsd: 0.000225,
        durationMs: 400,
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        requestId: 'r2',
        userId: 'u2',
        feature: 'meal_photo',
        model: 'gemini-2.5-flash',
        status: 'success',
        inputTokens: 2000,
        outputTokens: 800,
        cachedTokens: 0,
        totalTokens: 2800,
        estimatedCostUsd: 0.00039,
        durationMs: 650,
        createdAt: new Date().toISOString(),
      },
    );

    const res = await request(app).get('/api/v1/admin/ai/usage/summary');

    expect(res.status).toBe(200);
    expect(res.body.data.todayRequests).toBe(2);
    expect(res.body.data.totalTokens).toBe(4300);
    expect(res.body.data.inputTokens).toBe(3000);
    expect(res.body.data.outputTokens).toBe(1300);
    expect(res.body.data.estimatedMonthlyCostUsd).toBeGreaterThan(0);
  });

  it('6. GeminiRuntimeService correctly calculates estimated cost per token model pricing', () => {
    const runtime = new GeminiRuntimeService({
      repo: new InMemoryAppSettingsRepo(),
      encryptionKey: TEST_ENCRYPTION_KEY,
    });

    // 1,000,000 input tokens at $0.075/1M + 1,000,000 output tokens at $0.30/1M = $0.375
    const cost = runtime.calculateCostUsd('gemini-2.5-flash', 1_000_000, 1_000_000);
    expect(cost).toBe(0.375);

    // 10,000 input tokens + 2,000 output tokens for 2.5 Flash
    // input: 10000 * 0.075 / 1M = 0.00075
    // output: 2000 * 0.30 / 1M = 0.0006
    // total = 0.00135
    const typicalCost = runtime.calculateCostUsd('gemini-2.5-flash', 10_000, 2_000);
    expect(typicalCost).toBe(0.00135);
  });
});
