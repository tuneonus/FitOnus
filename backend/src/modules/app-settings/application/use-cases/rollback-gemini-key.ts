import type { Actor } from '../../../../shared/auth/actor.js';
import { assertPermission } from '../../../../shared/auth/actor.js';
import type { GeminiAdminConfigView } from '../../domain/gemini-config.js';
import type { AdminAuditLoggerPort, AppSettingsRepository } from '../ports.js';

export interface RollbackGeminiKeyDeps {
  repo: AppSettingsRepository;
  auditLogger?: AdminAuditLoggerPort;
}

export class RollbackGeminiKeyUseCase {
  constructor(private readonly deps: RollbackGeminiKeyDeps) {}

  async execute(
    actor: Actor,
    expectedVersion?: number,
    clientMeta?: { ip: string | null; userAgent: string | null },
  ): Promise<GeminiAdminConfigView> {
    assertPermission(actor, 'admin:access');

    const updated = await this.deps.repo.rollbackGeminiApiKey(
      expectedVersion,
      actor.userId,
    );

    if (this.deps.auditLogger) {
      await this.deps.auditLogger
        .recordAuditLog({
          adminId: actor.userId,
          action: 'admin.gemini_key_rollback',
          targetUserId: null,
          details: {
            restoredKeyMask: updated.keyMask,
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
