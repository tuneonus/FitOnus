import type { PublicAppConfig } from '../../domain/app-setting.js';
import type { AppSettingsRepository } from '../ports.js';

export class GetPublicAppConfigUseCase {
  constructor(private readonly repo: AppSettingsRepository) {}

  async execute(): Promise<PublicAppConfig> {
    return this.repo.getPublicConfig();
  }
}
