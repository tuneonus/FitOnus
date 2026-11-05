import type { Actor } from '../../../../shared/auth/actor.js';
import type { SettingsRepository, UpdateSettingsParams } from '../ports.js';
import { toSettingsView, type UserSettingsView } from '../profile-view.js';

export class UpdateUserSettingsUseCase {
  constructor(private readonly deps: { settingsRepo: SettingsRepository }) {}

  async execute(actor: Actor, patch: UpdateSettingsParams): Promise<UserSettingsView> {
    await this.deps.settingsRepo.ensureSettings(actor.userId);
    const updated = await this.deps.settingsRepo.updateSettings(actor.userId, patch);
    return toSettingsView(updated);
  }
}
