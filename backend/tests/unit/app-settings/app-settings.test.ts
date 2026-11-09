import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import {
  createAppSettingsController,
  createAdminAppSettingsRoutes,
  createPublicAppConfigRoutes,
  type AppSettingsRepository,
  type AppSettingRecord,
  type PublicAppConfig,
  type AiUsageStats,
  type AppSettingKey,
  type AppSettingValueMap,
  type AiUsageActionType,
  GetAppSettingsUseCase,
  UpdateAppSettingsUseCase,
  GetPublicAppConfigUseCase,
  CheckAndRecordAiQuotaUseCase,
  GetGeminiConfigUseCase,
  UpdateGeminiConfigUseCase,
  TestGeminiConnectionUseCase,
  RollbackGeminiKeyUseCase,
  GetGeminiUsageAnalyticsUseCases,
} from '../../../src/modules/app-settings/index.js';

class InMemoryAppSettingsRepository implements AppSettingsRepository {
  private readonly store = new Map<string, AppSettingRecord>();
  private readonly usage = new Map<string, number>();

  constructor() {
    this.resetDefaults();
  }

  resetDefaults() {
    this.store.clear();
    this.usage.clear();

    const now = new Date().toISOString();
    const defaults: AppSettingRecord[] = [
      {
        key: 'app.maintenance',
        category: 'app',
        value: {
          enabled: false,
          message: 'FitOnus is currently undergoing scheduled maintenance. Please check back shortly.',
          expectedEndTime: null,
        },
        description: 'Maintenance mode control',
        updatedBy: null,
        updatedAt: now,
        version: 1,
      },
      {
        key: 'app.min_version',
        category: 'app',
        value: { androidMinVersion: '1.0.0' },
        description: 'Minimum supported app version',
        updatedBy: null,
        updatedAt: now,
        version: 1,
      },
      {
        key: 'app.force_update',
        category: 'app',
        value: {
          enabled: false,
          updateMessage: 'A new version of FitOnus is required to continue.',
          storeUrl: 'https://play.google.com/store/apps/details?id=com.fitonus.app',
        },
        description: 'Force update settings',
        updatedBy: null,
        updatedAt: now,
        version: 1,
      },
      {
        key: 'app.support',
        category: 'app',
        value: { email: 'support@fitonus.com', website: 'https://fitonus.com/support', contactInfo: 'Available Mon-Fri' },
        description: 'Support contact details',
        updatedBy: null,
        updatedAt: now,
        version: 1,
      },
      {
        key: 'app.legal',
        category: 'app',
        value: { privacyPolicyUrl: 'https://fitonus.com/privacy', termsOfServiceUrl: 'https://fitonus.com/terms' },
        description: 'Legal links',
        updatedBy: null,
        updatedAt: now,
        version: 1,
      },
      {
        key: 'features.flags',
        category: 'features',
        value: {
          aiCoach: true,
          mealPhotoScanner: true,
          voiceMealEntry: true,
          workoutGenerator: true,
        },
        description: 'Remote feature toggles',
        updatedBy: null,
        updatedAt: now,
        version: 1,
      },
      {
        key: 'ai.limits',
        category: 'ai',
        value: {
          dailyGlobalLimit: 50,
          coachChatDailyLimit: 20,
          mealPhotoDailyLimit: 10,
          voiceMealDailyLimit: 10,
          workoutGeneratorDailyLimit: 10,
        },
        description: 'Daily AI quotas',
        updatedBy: null,
        updatedAt: now,
        version: 1,
      },
    ];

    for (const d of defaults) {
      this.store.set(d.key, d);
    }
  }

  async getAllSettings(): Promise<AppSettingRecord[]> {
    return Array.from(this.store.values());
  }

  async getSettingByKey<K extends AppSettingKey>(key: K): Promise<AppSettingRecord<K> | null> {
    return (this.store.get(key) as AppSettingRecord<K>) ?? null;
  }

  async updateSetting<K extends AppSettingKey>(
    key: K,
    value: AppSettingValueMap[K],
    expectedVersion?: number,
    updatedBy?: string,
  ): Promise<AppSettingRecord<K>> {
    const existing = this.store.get(key);
    if (!existing) {
      throw new AppError('not_found', 'NOT_FOUND', `Setting '${key}' not found.`);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new AppError(
        'conflict',
        'VERSION_CONFLICT',
        `Setting '${key}' was modified by another administrator (current version ${existing.version}, expected ${expectedVersion}). Please refresh and try again.`,
      );
    }

    const updated: AppSettingRecord<K> = {
      key,
      category: existing.category,
      value,
      description: existing.description,
      updatedBy: updatedBy ?? null,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    };

    this.store.set(key, updated as AppSettingRecord);
    return updated;
  }

  async getPublicConfig(): Promise<PublicAppConfig> {
    const all = await this.getAllSettings();
    const map = new Map<string, any>(all.map((s) => [s.key, s.value]));

    return {
      maintenance: map.get('app.maintenance')!,
      minVersion: map.get('app.min_version')!,
      forceUpdate: map.get('app.force_update')!,
      support: map.get('app.support')!,
      legal: map.get('app.legal')!,
      features: map.get('features.flags')!,
      aiLimits: map.get('ai.limits')!,
    };
  }

  async getTodayAiUsageStats(): Promise<AiUsageStats> {
    return {
      todayTotalRequests: 14,
      todayActiveAiUsers: 3,
      breakdownByAction: {
        coach_chat: 8,
        meal_photo: 3,
        voice_meal: 2,
        workout_generator: 1,
      },
    };
  }

  async getUserTodayAiUsage(userId: string, actionType: AiUsageActionType): Promise<number> {
    return this.usage.get(`${userId}:${actionType}`) ?? 0;
  }

  async incrementUserAiUsage(userId: string, actionType: AiUsageActionType): Promise<number> {
    const key = `${userId}:${actionType}`;
    const next = (this.usage.get(key) ?? 0) + 1;
    this.usage.set(key, next);
    return next;
  }

  // Gemini Ports
  async getGeminiConfig(): Promise<any> {
    return {
      provider: 'google_gemini',
      encryptedApiKey: null,
      keyMask: null,
      previousEncryptedApiKey: null,
      previousKeyMask: null,
      defaultModel: 'gemini-2.5-flash',
      coachModel: null,
      mealPhotoModel: null,
      voiceMealModel: null,
      workoutGeneratorModel: null,
      version: 1,
      updatedBy: null,
      updatedAt: new Date().toISOString(),
    };
  }

  async updateGeminiConfig(updates: any): Promise<any> {
    return {
      provider: 'google_gemini',
      encryptedApiKey: null,
      keyMask: null,
      previousEncryptedApiKey: null,
      previousKeyMask: null,
      defaultModel: 'gemini-2.5-flash',
      coachModel: null,
      mealPhotoModel: null,
      voiceMealModel: null,
      workoutGeneratorModel: null,
      version: 1,
      updatedBy: null,
      updatedAt: new Date().toISOString(),
      ...updates,
    };
  }

  async rollbackGeminiApiKey(): Promise<any> {
    return this.getGeminiConfig();
  }

  async getGeminiModelsWithPricing(): Promise<any[]> {
    return [];
  }

  async recordGeminiUsage(): Promise<void> {}

  async getGeminiUsageEvents(): Promise<{ items: any[]; total: number }> {
    return { items: [], total: 0 };
  }

  async getGeminiUsageSummary(): Promise<any> {
    return {
      todayTotalRequests: 0,
      monthTotalRequests: 0,
      totalTokens: 0,
      estimatedMonthCostUsd: 0,
      averageLatencyMs: 0,
      errorCount: 0,
    };
  }

  async getGeminiUsageByFeature(): Promise<any[]> {
    return [];
  }

  async getGeminiUsageByModel(): Promise<any[]> {
    return [];
  }

  async getGeminiDailyTrends(): Promise<any[]> {
    return [];
  }
}

describe('FitOnus Admin Application Settings & Public Config Endpoints', () => {
  let repo: InMemoryAppSettingsRepository;
  let auditLogs: Array<{ adminId: string; action: string; details?: Record<string, unknown> }>;

  const adminId = randomUUID();
  const memberId = randomUUID();

  beforeEach(() => {
    repo = new InMemoryAppSettingsRepository();
    auditLogs = [];
  });

  function createTestApp(options?: { role?: 'admin' | 'member'; authenticated?: boolean }) {
    const app = express();
    app.use(requestContext(createLogger({ level: 'error', pretty: false })));
    app.use(express.json());

    const isAuth = options?.authenticated ?? true;
    const role = options?.role ?? 'admin';
    const userId = role === 'admin' ? adminId : memberId;

    const authenticate: express.RequestHandler = (req, _res, next) => {
      if (!isAuth) {
        throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication required.');
      }
      req.actor = createActor({ userId, sessionId: 's1', role });
      next();
    };

    const auditLogger = {
      recordAuditLog: async (entry: any) => {
        auditLogs.push(entry);
      },
    };

    const getAppSettings = new GetAppSettingsUseCase(repo);
    const updateAppSettings = new UpdateAppSettingsUseCase({ repo, auditLogger });
    const getPublicAppConfig = new GetPublicAppConfigUseCase(repo);
    const getGeminiConfig = new GetGeminiConfigUseCase({ repo, fallbackApiKey: 'test-key', fallbackModel: 'gemini-2.5-flash' });
    const updateGeminiConfig = new UpdateGeminiConfigUseCase({ repo, encryptionKey: 'test-key-32-chars-long-secret-key!!', auditLogger });
    const testGeminiConnection = new TestGeminiConnectionUseCase({ repo, encryptionKey: 'test-key-32-chars-long-secret-key!!', fallbackApiKey: 'test-key', fallbackModel: 'gemini-2.5-flash' });
    const rollbackGeminiKey = new RollbackGeminiKeyUseCase({ repo, auditLogger });
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

    const adminRoutes = createAdminAppSettingsRoutes('/api/v1/admin/application-settings', controller);
    const publicRoutes = createPublicAppConfigRoutes('/api/v1/app', controller);

    app.use('/api/v1/admin/application-settings', buildRouter(adminRoutes.routes, { authenticate }));
    app.use('/api/v1/app', buildRouter(publicRoutes.routes, { authenticate }));

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
  }

  // 1. GET /api/v1/admin/application-settings
  it('1. GET /api/v1/admin/application-settings returns all settings categories and live AI stats for admin', async () => {
    const app = createTestApp({ role: 'admin' });
    const res = await request(app).get('/api/v1/admin/application-settings');
    if (res.status !== 200) console.log('DEBUG TEST 1 RES BODY:', res.body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.settings).toHaveLength(7);
    expect(res.body.data.aiUsageStats.todayTotalRequests).toBe(14);
    expect(res.body.data.aiUsageStats.todayActiveAiUsers).toBe(3);
  });

  it('1b. rejects member access to GET /api/v1/admin/application-settings with 403 Forbidden', async () => {
    const app = createTestApp({ role: 'member' });
    const res = await request(app).get('/api/v1/admin/application-settings');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('1c. rejects unauthenticated access with 401', async () => {
    const app = createTestApp({ authenticated: false });
    const res = await request(app).get('/api/v1/admin/application-settings');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  // 2. PATCH /api/v1/admin/application-settings
  it('2. PATCH /api/v1/admin/application-settings updates maintenance mode, writes audit log, and increments version', async () => {
    const app = createTestApp({ role: 'admin' });
    const res = await request(app)
      .patch('/api/v1/admin/application-settings')
      .send({
        settings: [
          {
            key: 'app.maintenance',
            value: {
              enabled: true,
              message: 'Maintenance ongoing until 18:00 UTC.',
              expectedEndTime: '2026-11-09T18:00:00.000Z',
            },
            expectedVersion: 1,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0].key).toBe('app.maintenance');
    expect(res.body.data[0].version).toBe(2);
    expect(res.body.data[0].value.enabled).toBe(true);

    // Verify audit log
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]!.action).toBe('admin.settings_update');
    expect(auditLogs[0]!.details?.updatedKeys).toEqual(['app.maintenance']);
  });

  it('2b. PATCH enforces optimistic concurrency and rejects stale version with 409 VERSION_CONFLICT', async () => {
    const app = createTestApp({ role: 'admin' });
    const res = await request(app)
      .patch('/api/v1/admin/application-settings')
      .send({
        settings: [
          {
            key: 'app.maintenance',
            value: {
              enabled: true,
              message: 'Another update.',
              expectedEndTime: null,
            },
            expectedVersion: 99, // Stale version
          },
        ],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('2c. PATCH rejects invalid inputs and unknown fields with 400 VALIDATION_FAILED', async () => {
    const app = createTestApp({ role: 'admin' });
    const res = await request(app)
      .patch('/api/v1/admin/application-settings')
      .send({
        settings: [
          {
            key: 'app.min_version',
            value: { androidMinVersion: 'invalid-semver' },
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  // 3. GET /api/v1/app/config
  it('3. GET /api/v1/app/config is publicly accessible and returns clean allowlisted mobile config', async () => {
    const app = createTestApp({ authenticated: false });
    const res = await request(app).get('/api/v1/app/config');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.maintenance.enabled).toBe(false);
    expect(res.body.data.minVersion.androidMinVersion).toBe('1.0.0');
    expect(res.body.data.features.aiCoach).toBe(true);
    expect(res.body.data.aiLimits.coachChatDailyLimit).toBe(20);

    // Verify zero secret leakage
    expect(res.body.data).not.toHaveProperty('databaseUrl');
    expect(res.body.data).not.toHaveProperty('jwtSecret');
    expect(res.body.data).not.toHaveProperty('apiKey');
  });

  // 4. CheckAndRecordAiQuotaUseCase
  it('4. enforces feature flag gating and daily quota limits on AI operations', async () => {
    const quotaUseCase = new CheckAndRecordAiQuotaUseCase(repo);

    // Initial usage should succeed
    const firstUse = await quotaUseCase.execute({ userId: memberId, actionType: 'meal_photo' });
    expect(firstUse.currentUsage).toBe(1);
    expect(firstUse.limit).toBe(10);
    expect(firstUse.remaining).toBe(9);

    // Disable meal photo scanner feature flag
    await repo.updateSetting('features.flags', {
      aiCoach: true,
      mealPhotoScanner: false,
      voiceMealEntry: true,
      workoutGenerator: true,
    });

    // Requesting meal_photo must now be rejected with FEATURE_DISABLED
    await expect(quotaUseCase.execute({ userId: memberId, actionType: 'meal_photo' })).rejects.toThrow(
      'AI Meal Photo Scanner is currently disabled by system administrators.',
    );

    // Re-enable and test quota exhaustion
    await repo.updateSetting('features.flags', {
      aiCoach: true,
      mealPhotoScanner: true,
      voiceMealEntry: true,
      workoutGenerator: true,
    });
    await repo.updateSetting('ai.limits', {
      dailyGlobalLimit: 50,
      coachChatDailyLimit: 20,
      mealPhotoDailyLimit: 2, // Set limit to 2
      voiceMealDailyLimit: 10,
      workoutGeneratorDailyLimit: 10,
    });

    // Second request reaches limit 2
    const secondUse = await quotaUseCase.execute({ userId: memberId, actionType: 'meal_photo' });
    expect(secondUse.currentUsage).toBe(2);

    // Third request exceeds limit and throws RATE_LIMITED
    await expect(quotaUseCase.execute({ userId: memberId, actionType: 'meal_photo' })).rejects.toThrow(
      'Daily limit for this AI feature (2 requests) has been reached.',
    );
  });
});
