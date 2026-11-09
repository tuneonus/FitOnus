import type { Actor } from '../../../../shared/auth/actor.js';
import { assertPermission } from '../../../../shared/auth/actor.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import { encryptSecret, maskApiKey } from '../../../../shared/security/encryption.js';
import type { GeminiAdminConfigView, GeminiConfigRecord } from '../../domain/gemini-config.js';
import type { AdminAuditLoggerPort, AppSettingsRepository } from '../ports.js';

export interface UpdateGeminiConfigInput {
  apiKey?: string;
  defaultModel?: string;
  featureModels?: {
    aiCoach?: string;
    mealPhotoScanner?: string;
    voiceMealEntry?: string;
    workoutGenerator?: string;
  };
  expectedVersion?: number;
}

export interface UpdateGeminiConfigDeps {
  repo: AppSettingsRepository;
  encryptionKey: string;
  auditLogger?: AdminAuditLoggerPort;
}

export class UpdateGeminiConfigUseCase {
  constructor(private readonly deps: UpdateGeminiConfigDeps) {}

  async execute(
    actor: Actor,
    input: UpdateGeminiConfigInput,
    clientMeta?: { ip: string | null; userAgent: string | null },
  ): Promise<GeminiAdminConfigView> {
    assertPermission(actor, 'admin:access');

    const current = await this.deps.repo.getGeminiConfig();

    const updates: Partial<GeminiConfigRecord> = {};
    const auditDetails: Record<string, unknown> = {};

    // 1. Handle API Key Rotation
    if (input.apiKey !== undefined && input.apiKey.trim().length > 0) {
      const cleanKey = input.apiKey.trim();
      if (cleanKey.length < 15) {
        throw new AppError('bad_request', 'VALIDATION_FAILED', 'Gemini API key is invalid or too short.');
      }

      const encrypted = encryptSecret(cleanKey, this.deps.encryptionKey);
      const newMask = maskApiKey(cleanKey);

      updates.encryptedApiKey = JSON.stringify(encrypted);
      updates.keyMask = newMask;
      updates.previousEncryptedApiKey = current.encryptedApiKey;
      updates.previousKeyMask = current.keyMask;

      auditDetails.keyRotated = true;
      auditDetails.newKeyMask = newMask;
      auditDetails.previousKeyMask = current.keyMask;
    }

    // 2. Handle Model Updates & Validation
    const supportedModels = await this.deps.repo.getGeminiModelsWithPricing();
    const validModelNames = new Set(supportedModels.map((m) => m.model));

    if (input.defaultModel) {
      if (!validModelNames.has(input.defaultModel)) {
        throw new AppError(
          'bad_request',
          'VALIDATION_FAILED',
          `Model "${input.defaultModel}" is not supported. Supported models: ${Array.from(validModelNames).join(', ')}`,
        );
      }
      updates.defaultModel = input.defaultModel;
      auditDetails.defaultModel = input.defaultModel;
    }

    if (input.featureModels) {
      const fm = input.featureModels;

      if (fm.aiCoach) {
        if (!validModelNames.has(fm.aiCoach)) {
          throw new AppError('bad_request', 'VALIDATION_FAILED', `Invalid AI Coach model: ${fm.aiCoach}`);
        }
        updates.coachModel = fm.aiCoach;
      }

      if (fm.mealPhotoScanner) {
        if (!validModelNames.has(fm.mealPhotoScanner)) {
          throw new AppError('bad_request', 'VALIDATION_FAILED', `Invalid Meal Photo Scanner model: ${fm.mealPhotoScanner}`);
        }
        updates.mealPhotoModel = fm.mealPhotoScanner;
      }

      if (fm.voiceMealEntry) {
        if (!validModelNames.has(fm.voiceMealEntry)) {
          throw new AppError('bad_request', 'VALIDATION_FAILED', `Invalid Voice Meal Entry model: ${fm.voiceMealEntry}`);
        }
        updates.voiceMealModel = fm.voiceMealEntry;
      }

      if (fm.workoutGenerator) {
        if (!validModelNames.has(fm.workoutGenerator)) {
          throw new AppError('bad_request', 'VALIDATION_FAILED', `Invalid Workout Generator model: ${fm.workoutGenerator}`);
        }
        updates.workoutGeneratorModel = fm.workoutGenerator;
      }

      auditDetails.featureModels = input.featureModels;
    }

    const updated = await this.deps.repo.updateGeminiConfig(
      updates,
      input.expectedVersion,
      actor.userId,
    );

    // 3. Write Audit Log
    if (this.deps.auditLogger) {
      const action = updates.encryptedApiKey
        ? 'admin.gemini_key_update'
        : 'admin.gemini_config_update';

      await this.deps.auditLogger
        .recordAuditLog({
          adminId: actor.userId,
          action,
          targetUserId: null,
          details: {
            ...auditDetails,
            version: updated.version,
          },
          ipAddress: clientMeta?.ip ?? null,
          userAgent: clientMeta?.userAgent ?? null,
        })
        .catch(() => {});
    }

    const defaultModel = updated.defaultModel;
    return {
      provider: updated.provider,
      keyMask: updated.keyMask || 'Not Configured',
      isConfigured: Boolean(updated.encryptedApiKey),
      canRollbackKey: Boolean(updated.previousEncryptedApiKey),
      defaultModel,
      featureModels: {
        aiCoach: updated.coachModel || defaultModel,
        mealPhotoScanner: updated.mealPhotoModel || defaultModel,
        voiceMealEntry: updated.voiceMealModel || defaultModel,
        workoutGenerator: updated.workoutGeneratorModel || defaultModel,
      },
      version: updated.version,
      updatedBy: updated.updatedBy,
      updatedAt: updated.updatedAt,
      connectionStatus: updated.encryptedApiKey ? 'connected' : 'not_configured',
    };
  }
}
