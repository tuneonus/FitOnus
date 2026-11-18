import { GoogleGenAI } from '@google/genai';
import { decryptSecret } from '../../../../shared/security/encryption.js';
import type { AppSettingsRepository } from '../ports.js';
import type { GeminiConfigRecord, GeminiFeature, GeminiModelInfo } from '../../domain/gemini-config.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import { isAiTimeoutError } from '../../../../shared/ai/ai-timeout.js';
import { currentAiRequestContext, markAiRequestDispatched } from '../../../../shared/ai/ai-usage.js';
import { classifyGeminiError } from '../../../../shared/ai/ai-error-classifier.js';
import { ModelCooldownTracker } from '../../../../shared/ai/model-cooldown-tracker.js';

export interface GeminiRuntimeConfig {
  repo: AppSettingsRepository;
  encryptionKey: string;
  fallbackApiKey?: string;
  fallbackModel?: string;
  cooldownTracker?: ModelCooldownTracker;
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
    isFallback?: boolean;
  };
}

export class GeminiRuntimeService {
  private cachedConfig: GeminiConfigRecord | null = null;
  private cachedModels: Map<string, GeminiModelInfo> = new Map();
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 20_000; // 20 seconds
  private readonly cooldownTracker: ModelCooldownTracker;

  constructor(private readonly config: GeminiRuntimeConfig) {
    this.cooldownTracker = config.cooldownTracker ?? new ModelCooldownTracker();
  }

  getCooldownTracker(): ModelCooldownTracker {
    return this.cooldownTracker;
  }

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

    return { apiKey, model: primaryModel, primaryModel, fallbackModel };
  }

  /**
   * Verifies if a model supports the requested modality.
   */
  supportsModality(model: string, modality: 'text' | 'vision' | 'audio'): boolean {
    const info = this.cachedModels.get(model);
    if (!info) {
      // Default: flash/flash-lite models support text, vision, audio
      return true;
    }
    if (modality === 'text') return info.capabilities.text;
    if (modality === 'vision') return info.capabilities.vision;
    if (modality === 'audio') return info.capabilities.audio;
    return true;
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
   * Executes a Gemini API call with smart error classification, cooldown tracking,
   * single-turn fallback failover, and telemetry.
   */
  async executeWithTelemetry(params: {
    requestId: string;
    userId?: string;
    feature: GeminiFeature;
    modality?: 'text' | 'vision' | 'audio';
    execute: (client: GoogleGenAI, model: string) => Promise<any>;
  }): Promise<ExecutedGeminiResult> {
    const { apiKey, primaryModel, fallbackModel } = await this.resolveExecutionTarget(params.feature);
    const client = new GoogleGenAI({ apiKey });
    const userId = params.userId ?? currentAiRequestContext()?.userId ?? null;
    const modality =
      params.modality ||
      (params.feature === 'meal_photo'
        ? 'vision'
        : params.feature === 'voice_meal'
        ? 'audio'
        : 'text');

    const isPrimaryAvailable = this.cooldownTracker.isAvailable(primaryModel);
    const isFallbackEligible =
      fallbackModel &&
      fallbackModel !== primaryModel &&
      this.supportsModality(fallbackModel, modality) &&
      this.cooldownTracker.isAvailable(fallbackModel);

    // If primary model is cooling down and fallback is available, run fallback directly
    if (!isPrimaryAvailable) {
      if (isFallbackEligible) {
        return this.attemptExecution({
          client,
          model: fallbackModel,
          isFallback: true,
          feature: params.feature,
          requestId: params.requestId,
          userId,
          execute: params.execute,
        });
      }

      // Both models in cooldown: fast reject without making doomed network calls
      const remainingSec = Math.max(
        this.cooldownTracker.getRemainingCooldownSeconds(primaryModel),
        this.cooldownTracker.getRemainingCooldownSeconds(fallbackModel),
      );
      throw new AppError(
        'unavailable',
        'AI_UNAVAILABLE',
        'The AI Coach is experiencing high demand right now. Please wait a moment and try again.',
        { retryAfterSeconds: remainingSec || 20, reason: 'rate_limited' },
      );
    }

    // Attempt primary model
    try {
      return await this.attemptExecution({
        client,
        model: primaryModel,
        isFallback: false,
        feature: params.feature,
        requestId: params.requestId,
        userId,
        execute: params.execute,
      });
    } catch (primaryErr: unknown) {
      if (primaryErr instanceof AppError && primaryErr.code === 'UNAUTHENTICATED') {
        throw primaryErr;
      }

      const classified = classifyGeminiError(primaryErr);
      // Record cooldown on the exhausted primary model
      this.cooldownTracker.recordFailure(
        primaryModel,
        classified.technicalReason,
        classified.retryAfterSeconds,
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
      );

      // Check if fallback is eligible:
      // Must be retryable (RPM, 503, model-specific RPD), NOT project-wide, supported modality, and not cooling down
      if (
        classified.isRetryable &&
        !classified.isProjectWide &&
        isFallbackEligible
      ) {
        try {
          return await this.attemptExecution({
            client,
            model: fallbackModel,
            isFallback: true,
            feature: params.feature,
            requestId: `${params.requestId}-fb`,
            userId,
            execute: params.execute,
          });
        } catch (fallbackErr: unknown) {
          const fallbackClassified = classifyGeminiError(fallbackErr);
          this.cooldownTracker.recordFailure(
            fallbackModel,
            fallbackClassified.technicalReason,
            fallbackClassified.retryAfterSeconds,
            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          );

          throw new AppError(
            'unavailable',
            'AI_UNAVAILABLE',
            fallbackClassified.userFriendlyMessage,
            {
              retryAfterSeconds: Math.min(classified.retryAfterSeconds, fallbackClassified.retryAfterSeconds),
              reason: fallbackClassified.kind,
            },
          );
        }
      }

      // Project-wide quota or auth errors are converted to structured AppError
      if (classified.kind === 'AUTH_ERROR') {
        throw new AppError('unavailable', 'SERVICE_UNAVAILABLE', classified.userFriendlyMessage, {
          reason: classified.kind,
        });
      }
      if (classified.kind === 'QUOTA_EXHAUSTED_RPD' && classified.isProjectWide) {
        throw new AppError('rate_limited', 'AI_QUOTA_EXCEEDED', classified.userFriendlyMessage, {
          retryAfterSeconds: classified.retryAfterSeconds,
          reason: classified.kind,
        });
      }
      if (classified.isRateLimited) {
        throw new AppError('rate_limited', 'RATE_LIMITED', classified.userFriendlyMessage, {
          retryAfterSeconds: classified.retryAfterSeconds,
          reason: classified.kind,
        });
      }

      // Re-throw primary error to let client/usage-gate/timeout handler process it safely
      throw primaryErr;
    }
  }

  private async attemptExecution(params: {
    client: GoogleGenAI;
    model: string;
    isFallback: boolean;
    feature: GeminiFeature;
    requestId: string;
    userId: string | null;
    execute: (client: GoogleGenAI, model: string) => Promise<any>;
  }): Promise<ExecutedGeminiResult> {
    const startTime = Date.now();
    try {
      // Mark dispatched for user quota tracking
      markAiRequestDispatched();
      const response = await params.execute(params.client, params.model);
      const durationMs = Date.now() - startTime;

      // Success: clear cooldown for this model
      this.cooldownTracker.recordSuccess(params.model);

      const meta = response?.usageMetadata;
      const inputTokens = meta?.promptTokenCount ?? 0;
      const outputTokens = meta?.candidatesTokenCount ?? 0;
      const cachedTokens = meta?.cachedContentTokenCount ?? 0;
      const totalTokens = meta?.totalTokenCount ?? inputTokens + outputTokens;
      const estimatedCostUsd = this.calculateCostUsd(params.model, inputTokens, outputTokens, cachedTokens);

      this.config.repo
        .recordGeminiUsage({
          requestId: params.requestId,
          userId: params.userId,
          feature: params.feature,
          model: params.model,
          status: 'success',
          inputTokens,
          outputTokens,
          cachedTokens,
          totalTokens,
          estimatedCostUsd,
          durationMs,
          errorCategory: params.isFallback ? 'FALLBACK_SUCCESS' : null,
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
          model: params.model,
          isFallback: params.isFallback,
        },
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      let status: 'failed' | 'rate_limited' | 'timeout' = 'failed';
      let errorCategory = 'PROVIDER_ERROR';

      if (isAiTimeoutError(err)) {
        status = 'timeout';
        errorCategory = 'TIMEOUT';
      } else if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
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
          userId: params.userId,
          feature: params.feature,
          model: params.model,
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
