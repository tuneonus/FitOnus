import { decryptSecret } from '../../../../shared/security/encryption.js';
import { defaultAiMetrics } from '../../../../shared/ai/ai-metrics.js';
import type { AppSettingsRepository } from '../ports.js';
import type { GeminiConfigRecord, GeminiFeature, GeminiModelInfo } from '../../domain/gemini-config.js';
import { AppError } from '../../../../shared/errors/app-error.js';

export interface GeminiRuntimeConfig {
  repo: AppSettingsRepository;
  encryptionKey: string;
  fallbackApiKey?: string;
  fallbackModel?: string;
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
   * Resolves the active decrypted API key and feature-specific primary and fallback models.
   */
  async resolveExecutionTarget(feature: GeminiFeature): Promise<{
    apiKey: string;
    model: string;
    primaryModel: string;
    fallbackModel: string;
  }> {
    const config = await this.ensureFreshConfig();

    let apiKey: string;
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

    const { primaryModel, fallbackModel } = this.selectModels(config, feature);
    return { apiKey, model: primaryModel, primaryModel, fallbackModel };
  }

  /**
   * The configured primary/fallback model names for a feature. Unlike `resolveExecutionTarget` this
   * needs no API key, so callers that only forward model names (the Python AI backend holds its own
   * key) still follow the admin console's model settings.
   */
  async resolveModelNames(feature: GeminiFeature): Promise<{ primaryModel: string; fallbackModel: string }> {
    return this.selectModels(await this.ensureFreshConfig(), feature);
  }

  private selectModels(
    config: GeminiConfigRecord,
    feature: GeminiFeature,
  ): { primaryModel: string; fallbackModel: string } {
    let primaryModel = config.defaultModel || this.config.fallbackModel || 'gemini-3.5-flash-lite';
    if (feature === 'coach_chat' || feature === 'coach_insights') {
      primaryModel = config.coachModel || primaryModel;
    } else if (feature === 'meal_photo') {
      primaryModel = config.mealPhotoModel || primaryModel;
    } else if (feature === 'voice_meal') {
      primaryModel = config.voiceMealModel || primaryModel;
    } else if (feature === 'workout_generator') {
      primaryModel = config.workoutGeneratorModel || primaryModel;
    }

    const fallbackModel =
      config.fallbackModel ||
      (primaryModel === 'gemini-3.5-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-3.5-flash-lite');

    return { primaryModel, fallbackModel };
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
   * Records a call that was served outside this process (the Python AI backend). The provider call
   * and its timing happened elsewhere; this only writes the usage-ledger row, with cost computed
   * from the admin-managed pricing table.
   */
  async recordExternalUsage(event: {
    requestId: string;
    userId: string | null;
    feature: GeminiFeature;
    model: string;
    status?: 'success' | 'failed';
    isFallback: boolean;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
    durationMs: number;
    errorCategory?: string | null;
  }): Promise<void> {
    await this.ensureFreshConfig().catch(() => undefined); // pricing is optional; defaults apply
    const estimatedCostUsd = this.calculateCostUsd(
      event.model,
      event.inputTokens,
      event.outputTokens,
      event.cachedTokens,
    );
    try {
      defaultAiMetrics.recordCostUsd(event.feature, event.model, estimatedCostUsd);
    } catch {
      // Fail-open observability
    }
    await this.config.repo.recordGeminiUsage({
      requestId: event.requestId,
      userId: event.userId,
      feature: event.feature,
      model: event.model,
      status: event.status ?? 'success',
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cachedTokens: event.cachedTokens,
      totalTokens: event.totalTokens,
      estimatedCostUsd,
      durationMs: event.durationMs,
      errorCategory: event.errorCategory ?? (event.isFallback ? 'FALLBACK_SUCCESS' : null),
      providerRequestId: null,
    });
  }
}
