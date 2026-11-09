import { GoogleGenAI } from '@google/genai';
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
   * Executes a text generation call with abortion signal timeout and sanitized error handling.
   */
  async generateText(prompt: string, timeoutMs = 20_000, feature: GeminiFeature = 'coach_chat'): Promise<string> {
    if (this.runtimeService) {
      try {
        const result = await this.runtimeService.executeWithTelemetry({
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          feature,
          execute: async (client, model) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
              return await client.models.generateContent({
                model,
                contents: prompt,
              });
            } finally {
              clearTimeout(timeoutId);
            }
          },
        });
        return result.text;
      } catch (err: unknown) {
        this.handleGeminiError(err, 'Unable to reach AI service right now. Please check your connection and try again.');
      }
    }

    if (!this.aiClient) {
      throw new AppError(
        'unavailable',
        'SERVICE_UNAVAILABLE',
        'AI coaching service is not configured. Please ensure GEMINI_API_KEY is set.',
      );
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const responsePromise = this.aiClient.models.generateContent({
        model: this.modelName,
        contents: prompt,
      });

      const response = await Promise.race([
        responsePromise,
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'AI request timed out. Please try again.')),
          );
        }),
      ]);

      clearTimeout(timeoutId);
      return response.text?.trim() || '';
    } catch (err: unknown) {
      this.handleGeminiError(err, 'Unable to reach AI service right now. Please check your connection and try again.');
    }
  }

  /**
   * Executes a multimodal image + text generation call with abortion signal timeout.
   */
  async generateFromImage(
    image: { mimeType: string; base64: string },
    prompt: string,
    timeoutMs = 25_000,
  ): Promise<string> {
    // Clean base64 data url prefix if present (e.g. data:image/jpeg;base64,...)
    let cleanBase64 = image.base64;
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1]!;
    }

    if (this.runtimeService) {
      try {
        const result = await this.runtimeService.executeWithTelemetry({
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          feature: 'meal_photo',
          execute: async (client, model) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
              return await client.models.generateContent({
                model,
                contents: [
                  {
                    inlineData: {
                      mimeType: image.mimeType,
                      data: cleanBase64,
                    },
                  },
                  prompt,
                ],
              });
            } finally {
              clearTimeout(timeoutId);
            }
          },
        });
        return result.text;
      } catch (err: unknown) {
        this.handleGeminiError(err, 'Unable to analyze meal image right now. Please try again.');
      }
    }

    if (!this.aiClient) {
      throw new AppError(
        'unavailable',
        'SERVICE_UNAVAILABLE',
        'AI service is not configured. Please ensure GEMINI_API_KEY is set.',
      );
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const responsePromise = this.aiClient.models.generateContent({
        model: this.modelName,
        contents: [
          {
            inlineData: {
              mimeType: image.mimeType,
              data: cleanBase64,
            },
          },
          prompt,
        ],
      });

      const response = await Promise.race([
        responsePromise,
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'AI image analysis request timed out.')),
          );
        }),
      ]);

      clearTimeout(timeoutId);
      return response.text?.trim() || '';
    } catch (err: unknown) {
      this.handleGeminiError(err, 'Unable to analyze meal image right now. Please try again.');
    }
  }

  /**
   * Executes an audio multimodal call with abortion signal timeout.
   */
  async generateFromAudio(
    audio: { mimeType: string; base64: string },
    prompt: string,
    timeoutMs = 25_000,
  ): Promise<string> {
    let cleanBase64 = audio.base64;
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1]!;
    }

    if (this.runtimeService) {
      try {
        const result = await this.runtimeService.executeWithTelemetry({
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          feature: 'voice_meal',
          execute: async (client, model) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
              return await client.models.generateContent({
                model,
                contents: [
                  {
                    inlineData: {
                      mimeType: audio.mimeType,
                      data: cleanBase64,
                    },
                  },
                  prompt,
                ],
              });
            } finally {
              clearTimeout(timeoutId);
            }
          },
        });
        return result.text;
      } catch (err: unknown) {
        this.handleGeminiError(err, 'Unable to parse voice meal audio right now. Please try again.');
      }
    }

    if (!this.aiClient) {
      throw new AppError(
        'unavailable',
        'SERVICE_UNAVAILABLE',
        'AI service is not configured. Please ensure GEMINI_API_KEY is set.',
      );
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const responsePromise = this.aiClient.models.generateContent({
        model: this.modelName,
        contents: [
          {
            inlineData: {
              mimeType: audio.mimeType,
              data: cleanBase64,
            },
          },
          prompt,
        ],
      });

      const response = await Promise.race([
        responsePromise,
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'AI audio processing request timed out.')),
          );
        }),
      ]);

      clearTimeout(timeoutId);
      return response.text?.trim() || '';
    } catch (err: unknown) {
      this.handleGeminiError(err, 'Unable to process meal audio right now. Please try again.');
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

