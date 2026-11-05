import type { Actor } from '../../../../shared/auth/actor.js';
import type { ProfileRepository } from '../ports.js';
import { toProfileView, type UserProfileView } from '../profile-view.js';

export class GetUserProfileUseCase {
  constructor(private readonly deps: { profileRepo: ProfileRepository }) {}

  async execute(actor: Actor): Promise<UserProfileView> {
    const data = await this.deps.profileRepo.ensureProfile(actor.userId);
    return toProfileView(data);
  }
}
