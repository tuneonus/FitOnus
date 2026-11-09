import type { Actor } from '../../../../shared/auth/actor.js';
import { assertPermission } from '../../../../shared/auth/actor.js';
import type { AiUsageStats, AppSettingRecord } from '../../domain/app-setting.js';
import type { AppSettingsRepository } from '../ports.js';

export interface GetAppSettingsResult {
  settings: AppSettingRecord[];
  aiUsageStats: AiUsageStats;
}

export class GetAppSettingsUseCase {
  constructor(private readonly repo: AppSettingsRepository) {}

  async execute(actor: Actor): Promise<GetAppSettingsResult> {
    assertPermission(actor, 'admin:access');

    const [settings, aiUsageStats] = await Promise.all([
      this.repo.getAllSettings(),
      this.repo.getTodayAiUsageStats(),
    ]);

    return {
      settings,
      aiUsageStats,
    };
  }
}
