import { GoogleGenAI, type ContentListUnion, type GenerateContentResponse } from '@google/genai';
import { AppError } from '../errors/app-error.js';
import { classifyGeminiError } from './ai-error-classifier.js';
import type { GeminiFeature } from './gemini-feature.js';
import { runWithAiTimeout } from './ai-timeout.js';
import { markAiRequestDispatched } from './ai-usage.js';

/**
 * What `GeminiClient` needs from the runtime that resolves the API key / model, applies the fallback
 * model and records telemetry. Implemented by `GeminiRuntimeService` (app-settings module); declared
 * here so this shared client does not import a feature module.
 */
export interface GeminiExecutor {
  executeWithTelemetry(params: {
    requestId: string;
    userId?: string;
    feature: GeminiFeature;
    modality?: 'text' | 'vision' | 'audio';
    execute: (client: GoogleGenAI, model: string) => Promise<GenerateContentResponse>;
  }): Promise<{ text: string }>;
}

export interface GeminiClientConfig {
  apiKey?: string;
  model?: string;
  runtimeService?: GeminiExecutor;
}

/**
 * Shared, reusable Gemini API Client wrapper.
 * Provides unified initialization, error mapping, and timeout protection across all AI features.
 */
export class GeminiClient {
  private readonly aiClient: GoogleGenAI | null = null;
  public readonly modelName: string;
  private readonly runtimeService?: GeminiExecutor;

  constructor(config: GeminiClientConfig) {
    this.modelName = config.model || 'gemini-3.5-flash';
    this.runtimeService = config.runtimeService;
    if (config.apiKey && config.apiKey.trim()) {
      this.aiClient = new GoogleGenAI({ apiKey: config.apiKey.trim() });
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.aiClient) || Boolean(this.runtimeService);
  }

  /**
   * Executes a text generation call with a hard timeout and sanitized error handling.
   */
  async generateText(prompt: string, timeoutMs = 20_000, feature: GeminiFeature = 'coach_chat'): Promise<string> {
    return this.generate({
      feature,
      contents: prompt,
      timeoutMs,
      modality: 'text',
      failureMessage: 'Unable to reach AI service right now. Please check your connection and try again.',
      notConfiguredMessage: 'AI coaching service is not configured. Please ensure GEMINI_API_KEY is set.',
    });
  }

  /**
   * Executes a multimodal image + text generation call with a hard timeout.
   */
  async generateFromImage(
    image: { mimeType: string; base64: string },
    prompt: string,
    timeoutMs = 25_000,
  ): Promise<string> {
    return this.generate({
      feature: 'meal_photo',
      contents: [{ inlineData: { mimeType: image.mimeType, data: stripDataUrlPrefix(image.base64) } }, prompt],
      timeoutMs,
      modality: 'vision',
      failureMessage: 'Unable to analyze meal image right now. Please try again.',
      notConfiguredMessage: 'AI service is not configured. Please ensure GEMINI_API_KEY is set.',
    });
  }

  /**
   * Executes an audio multimodal call with a hard timeout.
   */
  async generateFromAudio(
    audio: { mimeType: string; base64: string },
    prompt: string,
    timeoutMs = 25_000,
  ): Promise<string> {
    return this.generate({
      feature: 'voice_meal',
      contents: [{ inlineData: { mimeType: audio.mimeType, data: stripDataUrlPrefix(audio.base64) } }, prompt],
      timeoutMs,
      modality: 'audio',
      failureMessage: 'Unable to parse voice meal audio right now. Please try again.',
      notConfiguredMessage: 'AI service is not configured. Please ensure GEMINI_API_KEY is set.',
    });
  }

  /**
   * The single place that talks to the provider. Every call:
   * - runs under `runWithAiTimeout`, whose AbortSignal is forwarded to the SDK request, so a timeout
   *   cancels the HTTP call instead of leaving it running (the signal used to be created and dropped);
   * - is sent exactly once (no retry, no fallback to a second request), so a timeout cannot double-bill;
   * - reports a timeout as the same safe 503 for text, image and audio, on both configuration paths.
   */
  private async generate(params: {
    feature: GeminiFeature;
    contents: ContentListUnion;
    timeoutMs: number;
    failureMessage: string;
    notConfiguredMessage: string;
    modality?: 'text' | 'vision' | 'audio';
  }): Promise<string> {
    const { feature, contents, timeoutMs, failureMessage, notConfiguredMessage, modality } = params;
    const request = (client: GoogleGenAI, model: string) =>
      runWithAiTimeout(timeoutMs, (signal) =>
        client.models.generateContent({ model, contents, config: { abortSignal: signal } }),
      );

    if (this.runtimeService) {
      try {
        const result = await this.runtimeService.executeWithTelemetry({
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          feature,
          modality,
          execute: request,
        });
        return result.text;
      } catch (err: unknown) {
        this.handleGeminiError(err, failureMessage);
      }
    }

    const directClient = this.aiClient;
    if (!directClient) {
      throw new AppError('unavailable', 'SERVICE_UNAVAILABLE', notConfiguredMessage);
    }

    try {
      markAiRequestDispatched();
      const response = await request(directClient, this.modelName);
      return response.text?.trim() || '';
    } catch (err: unknown) {
      this.handleGeminiError(err, failureMessage);
    }
  }

  private handleGeminiError(err: unknown, defaultMessage = 'AI service is temporarily unavailable. Please try again.'): never {
    if (err instanceof AppError) throw err;

    const classified = classifyGeminiError(err);
    if (classified.kind === 'AUTH_ERROR') {
      throw new AppError(
        'unavailable',
        'SERVICE_UNAVAILABLE',
        'AI coaching service configuration error. Please ensure credentials are valid.',
      );
    }

    if (classified.isRateLimited) {
      throw new AppError(
        'rate_limited',
        'RATE_LIMITED',
        classified.userFriendlyMessage,
        { retryAfterSeconds: classified.retryAfterSeconds },
      );
    }

    if (classified.kind === 'HIGH_DEMAND_503') {
      throw new AppError(
        'unavailable',
        'SERVICE_UNAVAILABLE',
        'AI service is experiencing temporary peak demand. Please try again shortly.',
        { retryAfterSeconds: classified.retryAfterSeconds },
      );
    }

    if (classified.kind === 'MODEL_NOT_FOUND') {
      throw new AppError(
        'unavailable',
        'SERVICE_UNAVAILABLE',
        'Configured AI model is unavailable. Please verify model configuration.',
      );
    }

    throw new AppError('unavailable', 'SERVICE_UNAVAILABLE', defaultMessage);
  }
}

/** Accepts both raw base64 and a `data:<mime>;base64,<payload>` URL. */
function stripDataUrlPrefix(base64: string): string {
  return base64.includes(',') ? base64.split(',')[1]! : base64;
}
