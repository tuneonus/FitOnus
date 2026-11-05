import type { SqlExecutor } from '../../database/transaction.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { RouteGroup } from '../../shared/http/route.js';
import { CompleteOnboardingUseCase } from './application/use-cases/complete-onboarding.js';
import { GetUserProfileUseCase } from './application/use-cases/get-profile.js';
import { GetUserSettingsUseCase } from './application/use-cases/get-settings.js';
import { SaveOnboardingStepUseCase } from './application/use-cases/save-onboarding-step.js';
import { UpdateUserProfileUseCase } from './application/use-cases/update-profile.js';
import { UpdateUserSettingsUseCase } from './application/use-cases/update-settings.js';
import { PgProfileRepository } from './infrastructure/pg-profile-repository.js';
import { PgSettingsRepository } from './infrastructure/pg-settings-repository.js';
import { createProfileController } from './interface/profile.controller.js';
import { createProfileRoutes } from './interface/profile.routes.js';

export type {
  DietType,
  ExperienceLevel,
  FitnessGoal,
  OnboardingStep,
  Sex,
  WorkoutPlace,
} from './domain/fitness-profile.js';
export type { ThemeMode, UnitSystem } from './domain/user-settings.js';
export type {
  OnboardingCompleteView,
  UserProfileView,
  UserSettingsView,
} from './application/profile-view.js';

export interface ProfileModule {
  routes: RouteGroup;
}

export function createProfileModule(deps: {
  basePath: string;
  db: SqlExecutor;
  uow: UnitOfWork;
}): ProfileModule {
  const profileRepo = new PgProfileRepository(deps.db);
  const settingsRepo = new PgSettingsRepository(deps.db);

  const controller = createProfileController({
    getProfile: new GetUserProfileUseCase({ profileRepo }),
    updateProfile: new UpdateUserProfileUseCase({ profileRepo }),
    saveOnboardingStep: new SaveOnboardingStepUseCase({ profileRepo }),
    completeOnboarding: new CompleteOnboardingUseCase({ profileRepo }),
    getSettings: new GetUserSettingsUseCase({ settingsRepo }),
    updateSettings: new UpdateUserSettingsUseCase({ settingsRepo }),
  });

  return {
    routes: createProfileRoutes(deps.basePath, controller),
  };
}
