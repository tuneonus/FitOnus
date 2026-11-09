import { GoogleGenAI } from '@google/genai';
import type { Actor } from '../../../../shared/auth/actor.js';
import { assertPermission } from '../../../../shared/auth/actor.js';
import { decryptSecret } from '../../../../shared/security/encryption.js';
import type { AppSettingsRepository } from '../ports.js';

export interface TestGeminiConnectionInput {
  apiKey?: string;
  model?: string;
}

export interface TestGeminiConnectionResult {
  success: boolean;
  latencyMs?: number;
  modelUsed?: string;
  message?: string;
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

  async execute(
    actor: Actor,
    input: TestGeminiConnectionInput,
  ): Promise<TestGeminiConnectionResult> {
    assertPermission(actor, 'admin:access');

    let keyToTest = input.apiKey?.trim();

    if (!keyToTest) {
      // Resolve from DB
      const config = await this.deps.repo.getGeminiConfig();
      if (config.encryptedApiKey) {
        try {
          keyToTest = decryptSecret(config.encryptedApiKey, this.deps.encryptionKey);
        } catch {
          return {
            success: false,
            error: 'Failed to decrypt active database API key. Verify AI_ENCRYPTION_KEY.',
          };
        }
      } else if (this.deps.fallbackApiKey) {
        keyToTest = this.deps.fallbackApiKey.trim();
      }
    }

    if (!keyToTest) {
      return {
        success: false,
        error: 'No Gemini API key provided or configured in database/environment.',
      };
    }

    const modelToUse = input.model || this.deps.fallbackModel || 'gemini-2.5-flash';
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

      return {
        success: true,
        latencyMs,
        modelUsed: modelToUse,
        message: `Successfully connected to Google Gemini via ${modelToUse} (${latencyMs}ms)`,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        latencyMs,
        modelUsed: modelToUse,
        error: errorMsg,
      };
    }
  }
}
