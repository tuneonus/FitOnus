import type { Actor } from '../../../../shared/auth/actor.js';
import { assertPermission } from '../../../../shared/auth/actor.js';
import type { GeminiAdminConfigView } from '../../domain/gemini-config.js';
import type { AppSettingsRepository } from '../ports.js';
import { maskApiKey } from '../../../../shared/security/encryption.js';

export interface GetGeminiConfigDeps {
  repo: AppSettingsRepository;
  fallbackApiKey?: string;
  fallbackModel?: string;
}

export class GetGeminiConfigUseCase {
  constructor(private readonly deps: GetGeminiConfigDeps) {}

  async execute(actor: Actor): Promise<GeminiAdminConfigView> {
    assertPermission(actor, 'admin:access');

    const config = await this.deps.repo.getGeminiConfig();

    const hasDbKey = Boolean(config.encryptedApiKey && config.keyMask);
    const hasEnvKey = Boolean(this.deps.fallbackApiKey && this.deps.fallbackApiKey.trim().length > 0);

    const isConfigured = hasDbKey || hasEnvKey;
    const effectiveKeyMask = hasDbKey
      ? config.keyMask!
      : hasEnvKey
      ? `${maskApiKey(this.deps.fallbackApiKey)} (from ENV)`
      : 'Not Configured';

    const defaultModel = config.defaultModel || this.deps.fallbackModel || 'gemini-2.5-flash';

    return {
      provider: 'google_gemini',
      keyMask: effectiveKeyMask,
      isConfigured,
      canRollbackKey: Boolean(config.previousEncryptedApiKey),
      defaultModel,
      featureModels: {
        aiCoach: config.coachModel || defaultModel,
        mealPhotoScanner: config.mealPhotoModel || defaultModel,
        voiceMealEntry: config.voiceMealModel || defaultModel,
        workoutGenerator: config.workoutGeneratorModel || defaultModel,
      },
      version: config.version,
      updatedBy: config.updatedBy,
      updatedAt: config.updatedAt,
      connectionStatus: isConfigured ? 'connected' : 'not_configured',
    };
  }
}
