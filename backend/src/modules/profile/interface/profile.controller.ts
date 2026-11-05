import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { CompleteOnboardingUseCase } from '../application/use-cases/complete-onboarding.js';
import type { GetUserProfileUseCase } from '../application/use-cases/get-profile.js';
import type { GetUserSettingsUseCase } from '../application/use-cases/get-settings.js';
import type { SaveOnboardingStepUseCase } from '../application/use-cases/save-onboarding-step.js';
import type { UpdateUserProfileUseCase } from '../application/use-cases/update-profile.js';
import type { UpdateUserSettingsUseCase } from '../application/use-cases/update-settings.js';
import type {
  OnboardingCompleteView,
  UserProfileView,
  UserSettingsView,
} from '../application/profile-view.js';
import { saveOnboardingStepRequest, updateProfileRequest, updateSettingsRequest } from './profile.schemas.js';

export interface ProfileUseCases {
  getProfile: GetUserProfileUseCase;
  updateProfile: UpdateUserProfileUseCase;
  saveOnboardingStep: SaveOnboardingStepUseCase;
  completeOnboarding: CompleteOnboardingUseCase;
  getSettings: GetUserSettingsUseCase;
  updateSettings: UpdateUserSettingsUseCase;
}

export type ProfileController = ReturnType<typeof createProfileController>;

export function createProfileController(useCases: ProfileUseCases) {
  return {
    getMe: async (req: Request): Promise<RouteResult<UserProfileView>> => {
      const actor = requireActor(req);
      const data = await useCases.getProfile.execute(actor);
      return { data, message: 'Fitness profile retrieved' };
    },

    updateMe: async (req: Request): Promise<RouteResult<UserProfileView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, updateProfileRequest);
      const data = await useCases.updateProfile.execute(actor, body);
      return { data, message: 'Fitness profile updated' };
    },

    saveOnboardingStep: async (req: Request): Promise<RouteResult<UserProfileView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, saveOnboardingStepRequest);
      const data = await useCases.saveOnboardingStep.execute(actor, body.step, body.data);
      return { data, message: 'Onboarding step progress saved' };
    },

    completeOnboarding: async (req: Request): Promise<RouteResult<OnboardingCompleteView>> => {
      const actor = requireActor(req);
      const data = await useCases.completeOnboarding.execute(actor);
      return { data, message: 'Onboarding completed successfully' };
    },

    getSettings: async (req: Request): Promise<RouteResult<UserSettingsView>> => {
      const actor = requireActor(req);
      const data = await useCases.getSettings.execute(actor);
      return { data, message: 'User settings retrieved' };
    },

    updateSettings: async (req: Request): Promise<RouteResult<UserSettingsView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, updateSettingsRequest);
      const data = await useCases.updateSettings.execute(actor, body);
      return { data, message: 'User settings updated' };
    },
  };
}
