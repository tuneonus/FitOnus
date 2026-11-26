import type { SqlExecutor } from '../../database/transaction.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { RouteGroup } from '../../shared/http/route.js';
import type { ImageLogger } from '../../shared/images/public-image-check.js';
import type { PrivateMedia } from '../../shared/private-media/index.js';
import { CompleteOnboardingUseCase } from './application/use-cases/complete-onboarding.js';
import { GetUserProfileUseCase } from './application/use-cases/get-profile.js';
import { GetUserSettingsUseCase } from './application/use-cases/get-settings.js';
import { SaveOnboardingStepUseCase } from './application/use-cases/save-onboarding-step.js';
import { UpdateUserProfileUseCase } from './application/use-cases/update-profile.js';
import { UpdateUserSettingsUseCase } from './application/use-cases/update-settings.js';
import { GetAvatarUseCase } from './application/use-cases/get-avatar.js';
import { RemoveAvatarUseCase } from './application/use-cases/remove-avatar.js';
import { UploadAvatarUseCase } from './application/use-cases/upload-avatar.js';
import { PgAvatarRepository } from './infrastructure/pg-avatar-repository.js';
import { PgProfileRepository } from './infrastructure/pg-profile-repository.js';
import { PgSettingsRepository } from './infrastructure/pg-settings-repository.js';
import { createAvatarController } from './interface/avatar.controller.js';
import { createAvatarRoutes, type AvatarRouteLimiters } from './interface/avatar.routes.js';
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
// The single resolver of a member's daily calorie, macro and water targets (read by nutrition and the dashboard).
export {
  ageFromDateOfBirth,
  DEFAULT_DAILY_TARGETS,
  personalFoodTargets,
  resolveDailyTargets,
} from './domain/daily-targets.js';
export type { DailyTargetsInput, DailyTargetsSource, ResolvedDailyTargets } from './domain/daily-targets.js';
export type {
  OnboardingCompleteView,
  UserProfileView,
  UserSettingsView,
} from './application/profile-view.js';

export type { ProfileWithIdentity } from './application/ports.js';
export type { AvatarResponse, AvatarView } from './application/avatar-view.js';

export interface ProfileModule {
  routes: RouteGroup;
  profileRepo: PgProfileRepository;
}

export function createProfileModule(deps: {
  basePath: string;
  db: SqlExecutor;
  uow: UnitOfWork;
  /** The private member-photo storage. Null/omitted when it is not configured: avatar upload then answers 503. */
  privateMedia?: PrivateMedia | null;
  /** The upload budget for avatars. Omitted in tests that do not exercise rate limiting. */
  limiters?: AvatarRouteLimiters;
  logger?: ImageLogger;
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

  const avatars = new PgAvatarRepository(deps.db);
  const media = deps.privateMedia ?? null;
  const avatarController = createAvatarController({
    getAvatar: new GetAvatarUseCase({ avatars, media, logger: deps.logger }),
    uploadAvatar: new UploadAvatarUseCase({ avatars, media, logger: deps.logger }),
    removeAvatar: new RemoveAvatarUseCase({ avatars, media }),
  });

  const profileRoutes = createProfileRoutes(deps.basePath, controller);
  return {
    routes: {
      basePath: profileRoutes.basePath,
      routes: [...profileRoutes.routes, ...createAvatarRoutes(avatarController, deps.limiters)],
    },
    profileRepo,
  };
}
