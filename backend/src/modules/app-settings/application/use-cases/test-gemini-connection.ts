import { GoogleGenAI } from '@google/genai';
import type { Actor } from '../../../../shared/auth/actor.js';
import { assertPermission } from '../../../../shared/auth/actor.js';
import { decryptSecret } from '../../../../shared/security/encryption.js';
import type { AppSettingsRepository } from '../ports.js';

export interface TestGeminiConnectionInput {
  apiKey?: string;
  model?: string;
}

export type GeminiKeySource = 'database' | 'environment' | 'candidate' | 'unavailable';

export interface TestGeminiConnectionResult {
  success: boolean;
  latencyMs: number;
  model: string;
  modelUsed: string;
  keySource: GeminiKeySource;
  message: string;
  error?: string;
}

export interface TestGeminiConnectionDeps {
  repo: AppSettingsRepository;
  encryptionKey: string;
  fallbackApiKey?: string;
  fallbackModel?: string;
}

export class TestGeminiConnectionUseCase {
  constructor(private readonly deps: TestGeminiConnectionDeps) {}

  async execute(actor: Actor, input: TestGeminiConnectionInput): Promise<TestGeminiConnectionResult> {
    assertPermission(actor, 'admin:access');

    // Retrieve database configuration to determine default model and stored key
    const config = await this.deps.repo.getGeminiConfig().catch(() => null);

    // Resolve model to test using the approved priority:
    // 1. Explicitly requested model
    // 2. Saved database default model
    // 3. Existing configured fallback model
    // 4. Default to 'gemini-3.5-flash-lite'
    const modelToUse =
      input.model?.trim() ||
      config?.defaultModel?.trim() ||
      this.deps.fallbackModel?.trim() ||
      'gemini-3.5-flash-lite';

    let keyToTest = input.apiKey?.trim();
    let keySource: GeminiKeySource = 'unavailable';
    let dbKeyDecryptionFailed = false;

    if (keyToTest) {
      keySource = 'candidate';
    } else if (config) {
      if (config.encryptedApiKey) {
        try {
          keyToTest = decryptSecret(config.encryptedApiKey, this.deps.encryptionKey);
          keySource = 'database';
        } catch {
          dbKeyDecryptionFailed = true;
          // Graceful fallback to backend environment key (reusing GeminiRuntimeService behavior)
          if (this.deps.fallbackApiKey && this.deps.fallbackApiKey.trim().length > 0) {
            keyToTest = this.deps.fallbackApiKey.trim();
            keySource = 'environment';
          }
        }
      } else if (this.deps.fallbackApiKey && this.deps.fallbackApiKey.trim().length > 0) {
        keyToTest = this.deps.fallbackApiKey.trim();
        keySource = 'environment';
      }
    } else if (this.deps.fallbackApiKey && this.deps.fallbackApiKey.trim().length > 0) {
      keyToTest = this.deps.fallbackApiKey.trim();
      keySource = 'environment';
    }

    if (!keyToTest) {
      const errMsg = dbKeyDecryptionFailed
        ? 'Database API key decryption failed and no environment fallback key is configured. Verify AI_ENCRYPTION_KEY or rotate the API key.'
        : 'No Gemini API key provided or configured in database/environment.';

      return {
        success: false,
        latencyMs: 0,
        model: modelToUse,
        modelUsed: modelToUse,
        keySource: 'unavailable',
        message: errMsg,
        error: errMsg,
      };
    }

    const startTime = Date.now();

    try {
      const client = new GoogleGenAI({ apiKey: keyToTest });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const responsePromise = client.models.generateContent({
        model: modelToUse,
        contents: 'Ping test. Reply with: OK',
      });

      await Promise.race([
        responsePromise,
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error('Connection test timed out after 10 seconds.')),
          );
        }),
      ]);

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      let successMessage = `Successfully connected to Google Gemini via ${modelToUse} (${latencyMs}ms)`;
      if (dbKeyDecryptionFailed) {
        successMessage = `Successfully connected to Google Gemini via ${modelToUse} (${latencyMs}ms) using environment fallback key. (Note: Database key decryption failed; rotate API key to store in database).`;
      } else if (keySource === 'candidate') {
        successMessage = `Candidate API key verified successfully via ${modelToUse} (${latencyMs}ms). Ready to activate.`;
      }

      return {
        success: true,
        latencyMs,
        model: modelToUse,
        modelUsed: modelToUse,
        keySource,
        message: successMessage,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const rawError = err instanceof Error ? err.message : String(err);
      let userFriendlyMessage = rawError;

      if (
        rawError.includes('API_KEY_INVALID') ||
        rawError.includes('API key not valid') ||
        rawError.includes('401')
      ) {
        userFriendlyMessage = 'Invalid Gemini API key. Please check the key in Google AI Studio.';
      } else if (rawError.includes('403') || rawError.includes('PERMISSION_DENIED')) {
        userFriendlyMessage =
          'Gemini API permission denied. Ensure the API key has access to the generative language API.';
      } else if (rawError.includes('429') || rawError.includes('RESOURCE_EXHAUSTED')) {
        if (rawError.includes('per day') || rawError.includes('Daily')) {
          userFriendlyMessage =
            'Gemini daily free tier quota exhausted for this model. Try Gemini 3.5 Flash Lite or check Google AI Studio quotas.';
        } else {
          userFriendlyMessage = 'Gemini rate limit exceeded. Please wait a moment before testing again.';
        }
      } else if (rawError.includes('404') || rawError.includes('NOT_FOUND') || rawError.includes('models/')) {
        userFriendlyMessage = `Model "${modelToUse}" not found or unsupported by this Gemini API key.`;
      } else if (
        rawError.includes('timed out') ||
        rawError.includes('timeout') ||
        rawError.includes('ABORT_ERR')
      ) {
        userFriendlyMessage = 'Connection test timed out after 10 seconds. Check network connectivity.';
      } else if (
        rawError.includes('503') ||
        rawError.includes('UNAVAILABLE') ||
        rawError.includes('fetch failed')
      ) {
        userFriendlyMessage = 'Google Gemini service is temporarily unavailable or unreachable.';
      }

      return {
        success: false,
        latencyMs,
        model: modelToUse,
        modelUsed: modelToUse,
        keySource,
        message: userFriendlyMessage,
        error: rawError,
      };
    }
  }
}
