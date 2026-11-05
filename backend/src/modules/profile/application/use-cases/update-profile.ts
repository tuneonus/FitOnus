import type { Actor } from '../../../../shared/auth/actor.js';
import { conflict, notFound } from '../../../../shared/errors/app-error.js';
import type { ProfileRepository, UpdateProfileParams } from '../ports.js';
import { toProfileView, type UserProfileView } from '../profile-view.js';

export interface UpdateProfileInput extends UpdateProfileParams {
  version: number;
}

export class UpdateUserProfileUseCase {
  constructor(private readonly deps: { profileRepo: ProfileRepository }) {}

  async execute(actor: Actor, input: UpdateProfileInput): Promise<UserProfileView> {
    const { version, ...changes } = input;

    const existing = await this.deps.profileRepo.findByUserId(actor.userId);
    if (!existing) {
      throw notFound('NOT_FOUND', 'Profile does not exist');
    }

    const updated = await this.deps.profileRepo.updateProfile(actor.userId, version, changes);
    if (!updated) {
      throw conflict(
        'VERSION_CONFLICT',
        'Profile was modified concurrently. Please reload the latest data and retry.',
      );
    }

    return toProfileView(updated);
  }
}
