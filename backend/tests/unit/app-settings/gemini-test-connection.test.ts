import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { TestGeminiConnectionUseCase } from '../../../src/modules/app-settings/application/use-cases/test-gemini-connection.js';
import { createAppSettingsController } from '../../../src/modules/app-settings/interface/app-settings.controller.js';
import { createAdminAiRoutes } from '../../../src/modules/app-settings/interface/app-settings.routes.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { encryptSecret } from '../../../src/shared/security/encryption.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import { notFoundHandler } from '../../../src/middleware/error-handler.js';
import type { Actor } from '../../../src/shared/auth/actor.js';
import type {
  GeminiConfigRecord,
  GeminiModelInfo,
} from '../../../src/modules/app-settings/domain/gemini-config.js';

const TEST_SECRET = 'test-secret-key-32-chars-long!!';
const TEST_ACTOR: Actor = {
  userId: 'admin-001',
  sessionId: 'sess-001',
  role: 'admin',
  permissions: new Set(['admin:access']),
};

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      apiKey: string;
      models: { generateContent: any };

      constructor(opts: { apiKey: string }) {
        this.apiKey = opts.apiKey;
        this.models = {
          generateContent: vi.fn().mockImplementation(async (params: { model: string; contents: string }) => {
            if (this.apiKey === 'INVALID_KEY') {
              throw new Error('API_KEY_INVALID: API key not valid');
            }
            if (this.apiKey === 'RATE_LIMITED_KEY') {
              throw new Error('RESOURCE_EXHAUSTED: Daily quota exceeded');
            }
            if (params.model === 'UNSUPPORTED_MODEL') {
              throw new Error('NOT_FOUND: models/UNSUPPORTED_MODEL is not found');
            }
            return { text: 'OK' };
          }),
        };
      }
    },
  };
});

class MockAppSettingsRepo {
  public geminiConfig: GeminiConfigRecord = {
    provider: 'google_gemini',
    encryptedApiKey: null,
    keyMask: null,
    previousEncryptedApiKey: null,
    previousKeyMask: null,
    defaultModel: 'gemini-3.5-flash-lite',
    fallbackModel: 'gemini-3.1-flash-lite',
    coachModel: 'gemini-3.5-flash-lite',
    mealPhotoModel: 'gemini-3.5-flash-lite',
    voiceMealModel: 'gemini-3.5-flash-lite',
    workoutGeneratorModel: 'gemini-3.5-flash-lite',
    version: 24,
    updatedBy: null,
    updatedAt: new Date().toISOString(),
  };

  async getGeminiConfig() {
    return { ...this.geminiConfig };
  }
  async updateGeminiConfig(updates: any) {
    this.geminiConfig = { ...this.geminiConfig, ...updates };
    return { ...this.geminiConfig };
  }
  async getGeminiModelsWithPricing(): Promise<GeminiModelInfo[]> {
    return [];
  }
  async rollbackGeminiApiKey() {
    return this.geminiConfig;
  }
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
    return {} as any;
  }
  async getUserTodayAiUsage() {
    return 0;
  }
  async reserveAiUsage() {
    return { allowed: true as const, usageDate: '2026-11-14', actionCount: 1, totalCount: 1 };
  }
  async releaseAiUsage() {}
  async recordGeminiUsage() {}
  async getGeminiUsageEvents() {
    return { items: [], total: 0 };
  }
  async getGeminiUsageSummary() {
    return {} as any;
  }
  async getGeminiUsageByFeature() {
    return [];
  }
  async getGeminiUsageByModel() {
    return [];
  }
  async getGeminiDailyTrends() {
    return [];
  }
}

describe('TestGeminiConnectionUseCase & API Contract Suite', () => {
  let repo: MockAppSettingsRepo;

  beforeEach(() => {
    repo = new MockAppSettingsRepo();
  });

  it('1. succeeds using valid database-encrypted API key and reports keySource="database"', async () => {
    const validKey = 'AIzaSyValidKeyInDatabase12345';
    const encrypted = encryptSecret(validKey, TEST_SECRET);
    repo.geminiConfig.encryptedApiKey = JSON.stringify(encrypted);
    repo.geminiConfig.keyMask = 'AIzaSy...2345';

    const useCase = new TestGeminiConnectionUseCase({
      repo,
      encryptionKey: TEST_SECRET,
      fallbackApiKey: 'AIzaSyFallbackKey',
      fallbackModel: 'gemini-2.5-flash',
    });

    const result = await useCase.execute(TEST_ACTOR, {});

    expect(result.success).toBe(true);
    expect(result.keySource).toBe('database');
    expect(result.model).toBe('gemini-3.5-flash-lite');
    expect(result.modelUsed).toBe('gemini-3.5-flash-lite');
    expect(result.message).toContain('Successfully connected to Google Gemini');
    expect(result.error).toBeUndefined();
  });

  it('2. falls back to environment key when database key fails decryption and reports keySource="environment"', async () => {
    // Encrypted with a different key, so decryptSecret will fail
    const wrongEncrypted = encryptSecret('some-key', 'completely-different-secret-key!!');
    repo.geminiConfig.encryptedApiKey = JSON.stringify(wrongEncrypted);

    const useCase = new TestGeminiConnectionUseCase({
      repo,
      encryptionKey: TEST_SECRET,
      fallbackApiKey: 'AIzaSyEnvFallbackKey12345',
      fallbackModel: 'gemini-2.5-flash',
    });

    const result = await useCase.execute(TEST_ACTOR, {});

    expect(result.success).toBe(true);
    expect(result.keySource).toBe('environment');
    expect(result.model).toBe('gemini-3.5-flash-lite');
    expect(result.message).toContain('using environment fallback key');
    expect(result.message).toContain('Database key decryption failed');
  });

  it('3. reports failure cleanly when database decryption fails and no fallback key is configured', async () => {
    const wrongEncrypted = encryptSecret('some-key', 'completely-different-secret-key!!');
    repo.geminiConfig.encryptedApiKey = JSON.stringify(wrongEncrypted);

    const useCase = new TestGeminiConnectionUseCase({
      repo,
      encryptionKey: TEST_SECRET,
      fallbackApiKey: undefined,
    });

    const result = await useCase.execute(TEST_ACTOR, {});

    expect(result.success).toBe(false);
    expect(result.keySource).toBe('unavailable');
    expect(result.latencyMs).toBe(0);
    expect(result.message).toContain(
      'Database API key decryption failed and no environment fallback key is configured',
    );
    expect(result.error).toBeDefined();
  });

  it('4. reports failure cleanly when no API key is provided in DB or environment', async () => {
    repo.geminiConfig.encryptedApiKey = null;

    const useCase = new TestGeminiConnectionUseCase({
      repo,
      encryptionKey: TEST_SECRET,
      fallbackApiKey: undefined,
    });

    const result = await useCase.execute(TEST_ACTOR, {});

    expect(result.success).toBe(false);
    expect(result.keySource).toBe('unavailable');
    expect(result.latencyMs).toBe(0);
    expect(result.message).toContain('No Gemini API key provided or configured');
  });

  it('5. tests candidate key inside modal and reports keySource="candidate"', async () => {
    const useCase = new TestGeminiConnectionUseCase({
      repo,
      encryptionKey: TEST_SECRET,
    });

    const result = await useCase.execute(TEST_ACTOR, {
      apiKey: 'AIzaSyCandidateKey12345',
    });

    expect(result.success).toBe(true);
    expect(result.keySource).toBe('candidate');
    expect(result.message).toContain('Candidate API key verified successfully');
  });

  it('6. handles invalid candidate key without exposing undefined message', async () => {
    const useCase = new TestGeminiConnectionUseCase({
      repo,
      encryptionKey: TEST_SECRET,
    });

    const result = await useCase.execute(TEST_ACTOR, {
      apiKey: 'INVALID_KEY',
    });

    expect(result.success).toBe(false);
    expect(result.keySource).toBe('candidate');
    expect(result.message).toBe('Invalid Gemini API key. Please check the key in Google AI Studio.');
    expect(result.error).toContain('API_KEY_INVALID');
  });

  it('7. handles quota exhaustion without undefined error', async () => {
    const useCase = new TestGeminiConnectionUseCase({
      repo,
      encryptionKey: TEST_SECRET,
    });

    const result = await useCase.execute(TEST_ACTOR, {
      apiKey: 'RATE_LIMITED_KEY',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Gemini daily free tier quota exhausted');
  });

  it('8. priority resolution respects explicit model over database default', async () => {
    repo.geminiConfig.defaultModel = 'gemini-3.5-flash-lite';

    const useCase = new TestGeminiConnectionUseCase({
      repo,
      encryptionKey: TEST_SECRET,
      fallbackApiKey: 'AIzaSyEnvKey',
    });

    const result = await useCase.execute(TEST_ACTOR, {
      model: 'gemini-2.5-pro',
    });

    expect(result.model).toBe('gemini-2.5-pro');
    expect(result.modelUsed).toBe('gemini-2.5-pro');
  });

  it('9. POST /api/v1/admin/ai/test-connection end-to-end response contract verification', async () => {
    const useCase = new TestGeminiConnectionUseCase({
      repo,
      encryptionKey: TEST_SECRET,
      fallbackApiKey: 'AIzaSyEnvKey',
    });

    const controller = createAppSettingsController({
      testGeminiConnection: useCase,
    } as any);

    const routes = createAdminAiRoutes('/api/v1/admin/ai', controller);
    const app = express();
    app.use(requestContext(createLogger({ level: 'error', pretty: false })));
    app.use(express.json());

    const authenticate: express.RequestHandler = (req, _res, next) => {
      req.actor = TEST_ACTOR;
      next();
    };

    app.use('/api/v1/admin/ai', buildRouter(routes.routes, { authenticate }));
    app.use(notFoundHandler);

    const res = await request(app).post('/api/v1/admin/ai/test-connection').send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.model).toBe('gemini-3.5-flash-lite');
    expect(res.body.data.modelUsed).toBe('gemini-3.5-flash-lite');
    expect(res.body.data.keySource).toBe('environment');
    expect(res.body.data.message).toBeDefined();
    expect(typeof res.body.data.message).toBe('string');
    expect(res.body.data.message).not.toContain('undefined');
  });
});
