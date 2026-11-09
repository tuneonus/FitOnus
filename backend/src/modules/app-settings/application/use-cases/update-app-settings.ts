import type { Actor } from '../../../../shared/auth/actor.js';
import { assertPermission } from '../../../../shared/auth/actor.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { AppSettingKey, AppSettingRecord, AppSettingValueMap } from '../../domain/app-setting.js';
import type { AdminAuditLoggerPort, AppSettingsRepository } from '../ports.js';

export interface SettingUpdateItem<K extends AppSettingKey = AppSettingKey> {
  key: K;
  value: AppSettingValueMap[K];
  expectedVersion?: number;
}

export interface UpdateAppSettingsInput {
  settings: SettingUpdateItem[];
}

export class UpdateAppSettingsUseCase {
  constructor(
    private readonly deps: {
      repo: AppSettingsRepository;
      auditLogger?: AdminAuditLoggerPort;
    },
  ) {}

  async execute(
    actor: Actor,
    input: UpdateAppSettingsInput,
    meta?: { ip?: string | null; userAgent?: string | null },
  ): Promise<AppSettingRecord[]> {
    assertPermission(actor, 'admin:access');

    if (!input.settings || input.settings.length === 0) {
      throw new AppError('bad_request', 'BAD_REQUEST', 'No settings provided to update.');
    }

    const updatedRecords: AppSettingRecord[] = [];
    const modifiedKeys: string[] = [];

    for (const item of input.settings) {
      const updated = await this.deps.repo.updateSetting(
        item.key,
        item.value,
        item.expectedVersion,
        actor.userId,
      );
      updatedRecords.push(updated);
      modifiedKeys.push(item.key);
    }

    if (this.deps.auditLogger) {
      await this.deps.auditLogger.recordAuditLog({
        adminId: actor.userId,
        action: 'admin.settings_update',
        details: {
          updatedKeys: modifiedKeys,
          count: modifiedKeys.length,
        },
        ipAddress: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
      });
    }

    return updatedRecords;
  }
}
