import { GoogleGenAI, type ContentListUnion } from '@google/genai';
import { runWithAiTimeout } from '../../../shared/ai/ai-timeout.js';
import { markAiRequestDispatched } from '../../../shared/ai/ai-usage.js';
import { AppError } from '../../../shared/errors/app-error.js';
import type { GeminiRuntimeService } from '../../app-settings/application/services/gemini-runtime-service.js';
import type { GeminiFeature } from '../../app-settings/domain/gemini-config.js';

export interface GeminiClientConfig {
  apiKey?: string;
  model?: string;
  runtimeService?: GeminiRuntimeService;
}

/**
 * Shared, reusable Gemini API Client wrapper.
 * Provides unified initialization, error mapping, and timeout protection across all AI features.
 */
export class GeminiClient {
  private readonly aiClient: GoogleGenAI | null = null;
  public readonly modelName: string;
  private readonly runtimeService?: GeminiRuntimeService;

  constructor(config: GeminiClientConfig) {
    this.modelName = config.model || 'gemini-3.5-flash-lite';
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
  }): Promise<string> {
    const { feature, contents, timeoutMs, failureMessage, notConfiguredMessage } = params;
    const request = (client: GoogleGenAI, model: string) =>
      runWithAiTimeout(timeoutMs, (signal) =>
        client.models.generateContent({ model, contents, config: { abortSignal: signal } }),
      );

    if (this.runtimeService) {
      try {
        const result = await this.runtimeService.executeWithTelemetry({
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          feature,
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

    const errorMessage = err instanceof Error ? err.message : String(err);

    if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      throw new AppError(
        'rate_limited',
        'RATE_LIMITED',
        'The AI service is currently busy due to high traffic. Please wait a moment and try again.',
      );
    }

    if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND')) {
      throw new AppError(
        'unavailable',
        'SERVICE_UNAVAILABLE',
        'Configured AI model is unavailable. Please verify model configuration.',
      );
    }

    if (
      errorMessage.includes('503') ||
      errorMessage.includes('UNAVAILABLE') ||
      errorMessage.includes('demand') ||
      errorMessage.includes('high demand')
    ) {
      throw new AppError(
        'unavailable',
        'SERVICE_UNAVAILABLE',
        'AI service is experiencing temporary peak demand. Please try again shortly.',
      );
    }

    throw new AppError('unavailable', 'SERVICE_UNAVAILABLE', defaultMessage);
  }
}

/** Accepts both raw base64 and a `data:<mime>;base64,<payload>` URL. */
function stripDataUrlPrefix(base64: string): string {
  return base64.includes(',') ? base64.split(',')[1]! : base64;
}
