import { GoogleGenAI } from '@google/genai';
import { decryptSecret } from '../../../../shared/security/encryption.js';
import type { AppSettingsRepository } from '../ports.js';
import type { GeminiConfigRecord, GeminiFeature, GeminiModelInfo } from '../../domain/gemini-config.js';
import { AppError } from '../../../../shared/errors/app-error.js';

export interface GeminiRuntimeConfig {
  repo: AppSettingsRepository;
  encryptionKey: string;
  fallbackApiKey?: string;
  fallbackModel?: string;
}

export interface ExecutedGeminiResult {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    durationMs: number;
    model: string;
  };
}

export class GeminiRuntimeService {
  private cachedConfig: GeminiConfigRecord | null = null;
  private cachedModels: Map<string, GeminiModelInfo> = new Map();
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 20_000; // 20 seconds

  constructor(private readonly config: GeminiRuntimeConfig) {}

  /**
   * Refreshes in-memory configuration cache from PostgreSQL.
   */
  async refreshCache(): Promise<void> {
    const [cfg, models] = await Promise.all([
      this.config.repo.getGeminiConfig(),
      this.config.repo.getGeminiModelsWithPricing(),
    ]);

    this.cachedConfig = cfg;
    this.cachedModels = new Map(models.map((m) => [m.model, m]));
    this.lastFetchTime = Date.now();
  }

  private async ensureFreshConfig(): Promise<GeminiConfigRecord> {
    if (!this.cachedConfig || Date.now() - this.lastFetchTime > this.CACHE_TTL_MS) {
      await this.refreshCache();
    }
    return this.cachedConfig!;
  }

  /**
   * Resolves the active decrypted API key and feature-specific model.
   */
  async resolveExecutionTarget(feature: GeminiFeature): Promise<{
    apiKey: string;
    model: string;
  }> {
    const config = await this.ensureFreshConfig();

    let apiKey = '';
    if (config.encryptedApiKey) {
      try {
        apiKey = decryptSecret(config.encryptedApiKey, this.config.encryptionKey);
      } catch {
        apiKey = this.config.fallbackApiKey || '';
      }
    } else {
      apiKey = this.config.fallbackApiKey || '';
    }

    if (!apiKey) {
      throw new AppError(
        'unavailable',
        'SERVICE_UNAVAILABLE',
        'Gemini AI service is not configured. Please set an API key in Admin Settings.',
      );
    }

    let model = config.defaultModel || this.config.fallbackModel || 'gemini-2.5-flash';
    if (feature === 'coach_chat' || feature === 'coach_insights') {
      model = config.coachModel || model;
    } else if (feature === 'meal_photo') {
      model = config.mealPhotoModel || model;
    } else if (feature === 'voice_meal') {
      model = config.voiceMealModel || model;
    } else if (feature === 'workout_generator') {
      model = config.workoutGeneratorModel || model;
    }

    return { apiKey, model };
  }

  /**
   * Calculates estimated cost in USD based on input, output, and cached tokens.
   */
  calculateCostUsd(model: string, inputTokens: number, outputTokens: number, cachedTokens = 0): number {
    const info = this.cachedModels.get(model);
    const inputRate = info?.inputPricePerMillion ?? 0.075;
    const outputRate = info?.outputPricePerMillion ?? 0.30;
    const cachedRate = info?.cachedInputPricePerMillion ?? 0.01875;

    const inputCost = (inputTokens * inputRate) / 1_000_000;
    const outputCost = (outputTokens * outputRate) / 1_000_000;
    const cachedCost = (cachedTokens * cachedRate) / 1_000_000;

    return Number((inputCost + outputCost + cachedCost).toFixed(6));
  }

  /**
   * Executes a Gemini API call with automatic usage telemetry and error recording.
   */
  async executeWithTelemetry(params: {
    requestId: string;
    userId?: string;
    feature: GeminiFeature;
    execute: (client: GoogleGenAI, model: string) => Promise<any>;
  }): Promise<ExecutedGeminiResult> {
    const { apiKey, model } = await this.resolveExecutionTarget(params.feature);
    const client = new GoogleGenAI({ apiKey });
    const startTime = Date.now();

    try {
      const response = await params.execute(client, model);
      const durationMs = Date.now() - startTime;

      const meta = response?.usageMetadata;
      const inputTokens = meta?.promptTokenCount ?? 0;
      const outputTokens = meta?.candidatesTokenCount ?? 0;
      const cachedTokens = meta?.cachedContentTokenCount ?? 0;
      const totalTokens = meta?.totalTokenCount ?? inputTokens + outputTokens;

      const estimatedCostUsd = this.calculateCostUsd(model, inputTokens, outputTokens, cachedTokens);

      // Asynchronously record telemetry
      this.config.repo
        .recordGeminiUsage({
          requestId: params.requestId,
          userId: params.userId ?? null,
          feature: params.feature,
          model,
          status: 'success',
          inputTokens,
          outputTokens,
          cachedTokens,
          totalTokens,
          estimatedCostUsd,
          durationMs,
          errorCategory: null,
          providerRequestId: null,
        })
        .catch(() => {});

      return {
        text: response?.text?.trim() || '',
        usage: {
          inputTokens,
          outputTokens,
          cachedTokens,
          totalTokens,
          estimatedCostUsd,
          durationMs,
          model,
        },
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      let status: 'failed' | 'rate_limited' | 'timeout' = 'failed';
      let errorCategory = 'PROVIDER_ERROR';

      if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        status = 'rate_limited';
        errorCategory = 'RATE_LIMITED';
      } else if (errorMsg.includes('timed out') || errorMsg.includes('timeout')) {
        status = 'timeout';
        errorCategory = 'TIMEOUT';
      } else if (errorMsg.includes('404') || errorMsg.includes('NOT_FOUND')) {
        errorCategory = 'MODEL_NOT_FOUND';
      }

      this.config.repo
        .recordGeminiUsage({
          requestId: params.requestId,
          userId: params.userId ?? null,
          feature: params.feature,
          model,
          status,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          durationMs,
          errorCategory,
          providerRequestId: null,
        })
        .catch(() => {});

      throw err;
    }
  }
}
