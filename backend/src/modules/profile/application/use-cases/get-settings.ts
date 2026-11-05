import type { Actor } from '../../../../shared/auth/actor.js';
import type { SettingsRepository } from '../ports.js';
import { toSettingsView, type UserSettingsView } from '../profile-view.js';

export class GetUserSettingsUseCase {
  constructor(private readonly deps: { settingsRepo: SettingsRepository }) {}

  async execute(actor: Actor): Promise<UserSettingsView> {
    const settings = await this.deps.settingsRepo.ensureSettings(actor.userId);
    return toSettingsView(settings);
  }
}
