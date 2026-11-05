import type { Actor } from '../../../../shared/auth/actor.js';
import type { OnboardingStep } from '../../domain/fitness-profile.js';
import type { ProfileRepository } from '../ports.js';
import { toProfileView, type UserProfileView } from '../profile-view.js';

export class SaveOnboardingStepUseCase {
  constructor(private readonly deps: { profileRepo: ProfileRepository }) {}

  async execute(actor: Actor, step: OnboardingStep, data: Record<string, unknown>): Promise<UserProfileView> {
    const updated = await this.deps.profileRepo.saveOnboardingStep(actor.userId, step, data);
    return toProfileView(updated);
  }
}
