import { beforeEach, describe, expect, it } from 'vitest';
import { CompleteOnboardingUseCase } from '../../../src/modules/profile/application/use-cases/complete-onboarding.js';
import { GetUserProfileUseCase } from '../../../src/modules/profile/application/use-cases/get-profile.js';
import { GetUserSettingsUseCase } from '../../../src/modules/profile/application/use-cases/get-settings.js';
import { SaveOnboardingStepUseCase } from '../../../src/modules/profile/application/use-cases/save-onboarding-step.js';
import { UpdateUserProfileUseCase } from '../../../src/modules/profile/application/use-cases/update-profile.js';
import { UpdateUserSettingsUseCase } from '../../../src/modules/profile/application/use-cases/update-settings.js';
import type {
  ProfileRepository,
  ProfileWithIdentity,
  SettingsRepository,
  UpdateProfileParams,
  UpdateSettingsParams,
} from '../../../src/modules/profile/application/ports.js';
import {
  type ExperienceLevel,
  type FitnessGoal,
  type OnboardingStep,
  UserProfile,
  type UserProfileProps,
} from '../../../src/modules/profile/domain/fitness-profile.js';
import { UserSettings, type UserSettingsProps } from '../../../src/modules/profile/domain/user-settings.js';
import { actorFor } from '../../helpers/fakes.js';

class InMemoryProfileRepository implements ProfileRepository {
  readonly profiles = new Map<string, { profile: UserProfile; name: string }>();

  findByUserId(userId: string): Promise<ProfileWithIdentity | null> {
    const found = this.profiles.get(userId);
    return Promise.resolve(found ? { profile: found.profile, name: found.name } : null);
  }

  ensureProfile(userId: string): Promise<ProfileWithIdentity> {
    const existing = this.profiles.get(userId);
    if (existing) return Promise.resolve(existing);
    const defaultProfile = UserProfile.createDefault(userId);
    const item = { profile: defaultProfile, name: 'Default User' };
    this.profiles.set(userId, item);
    return Promise.resolve(item);
  }

  updateProfile(
    userId: string,
    expectedVersion: number,
    changes: UpdateProfileParams,
  ): Promise<ProfileWithIdentity | null> {
    const current = this.profiles.get(userId);
    if (!current) return Promise.resolve(null);
    if (current.profile.version !== expectedVersion) return Promise.resolve(null);

    const props: UserProfileProps = {
      ...current.profile.copy(),
      ...changes,
      version: current.profile.version + 1,
      updatedAt: new Date(),
    };
    const updated = {
      profile: UserProfile.reconstruct(props),
      name: changes.name ?? current.name,
    };
    this.profiles.set(userId, updated);
    return Promise.resolve(updated);
  }

  async saveOnboardingStep(
    userId: string,
    step: OnboardingStep,
    data: Record<string, unknown>,
  ): Promise<ProfileWithIdentity> {
    const current = await this.ensureProfile(userId);
    const changes: Partial<UserProfileProps> = {
      currentOnboardingStep: step,
      version: current.profile.version + 1,
      updatedAt: new Date(),
    };

    if (typeof data.heightCm === 'number') changes.heightCm = data.heightCm;
    if (typeof data.weightKg === 'number') changes.currentWeightKg = data.weightKg;
    if (typeof data.goal === 'string') changes.primaryGoal = data.goal as FitnessGoal;
    if (typeof data.experience === 'string') changes.experienceLevel = data.experience as ExperienceLevel;
    if (typeof data.daysPerWeek === 'number') changes.workoutDaysPerWeek = data.daysPerWeek;

    let updatedName = current.name;
    if (typeof data.name === 'string') {
      updatedName = data.name;
    }

    const updated = {
      profile: UserProfile.reconstruct({ ...current.profile.copy(), ...changes }),
      name: updatedName,
    };
    this.profiles.set(userId, updated);
    return updated;
  }

  async completeOnboarding(
    userId: string,
    targets: { dailyCalorieTarget: number; dailyProteinGrams: number },
  ): Promise<ProfileWithIdentity> {
    const current = await this.ensureProfile(userId);
    const updated = {
      profile: UserProfile.reconstruct({
        ...current.profile.copy(),
        onboardingCompleted: true,
        currentOnboardingStep: 'done',
        dailyCalorieTarget: targets.dailyCalorieTarget,
        dailyProteinGrams: targets.dailyProteinGrams,
        version: current.profile.version + 1,
        updatedAt: new Date(),
      }),
      name: current.name,
    };
    this.profiles.set(userId, updated);
    return updated;
  }
}

class InMemorySettingsRepository implements SettingsRepository {
  readonly settings = new Map<string, UserSettings>();

  findByUserId(userId: string): Promise<UserSettings | null> {
    return Promise.resolve(this.settings.get(userId) ?? null);
  }

  ensureSettings(userId: string): Promise<UserSettings> {
    const existing = this.settings.get(userId);
    if (existing) return Promise.resolve(existing);
    const def = UserSettings.createDefault(userId);
    this.settings.set(userId, def);
    return Promise.resolve(def);
  }

  async updateSettings(userId: string, changes: UpdateSettingsParams): Promise<UserSettings> {
    const current = await this.ensureSettings(userId);
    const props: UserSettingsProps = {
      ...current.copy(),
      ...changes,
      updatedAt: new Date(),
    };
    const updated = UserSettings.reconstruct(props);
    this.settings.set(userId, updated);
    return updated;
  }
}

describe('Profile Module Use Cases', () => {
  let profileRepo: InMemoryProfileRepository;
  let settingsRepo: InMemorySettingsRepository;
  let getProfile: GetUserProfileUseCase;
  let updateProfile: UpdateUserProfileUseCase;
  let saveStep: SaveOnboardingStepUseCase;
  let completeOnboarding: CompleteOnboardingUseCase;
  let getSettings: GetUserSettingsUseCase;
  let updateSettings: UpdateUserSettingsUseCase;

  const actor = actorFor('member', '11111111-1111-4111-8111-111111111111');

  beforeEach(() => {
    profileRepo = new InMemoryProfileRepository();
    settingsRepo = new InMemorySettingsRepository();
    getProfile = new GetUserProfileUseCase({ profileRepo });
    updateProfile = new UpdateUserProfileUseCase({ profileRepo });
    saveStep = new SaveOnboardingStepUseCase({ profileRepo });
    completeOnboarding = new CompleteOnboardingUseCase({ profileRepo });
    getSettings = new GetUserSettingsUseCase({ settingsRepo });
    updateSettings = new UpdateUserSettingsUseCase({ settingsRepo });
  });

  describe('GetUserProfileUseCase', () => {
    it('creates and returns default profile for first-time caller', async () => {
      const profile = await getProfile.execute(actor);
      expect(profile).toMatchObject({
        userId: actor.userId,
        name: 'Default User',
        sex: 'unspecified',
        heightCm: null,
        currentWeightKg: null,
        primaryGoal: null,
        onboardingCompleted: false,
        currentOnboardingStep: 'intro',
        calculatedTargets: null,
        version: 1,
      });
    });

    it('returns calculated metabolic targets when biometrics are present', async () => {
      await profileRepo.ensureProfile(actor.userId);
      await profileRepo.updateProfile(actor.userId, 1, {
        heightCm: 180,
        currentWeightKg: 80,
        dateOfBirth: '1995-06-15',
        primaryGoal: 'lose',
        workoutDaysPerWeek: 4,
        sex: 'male',
      });

      const profile = await getProfile.execute(actor);
      expect(profile.calculatedTargets).not.toBeNull();
      expect(profile.calculatedTargets?.dailyCalorieTarget).toBeGreaterThan(1500);
      expect(profile.calculatedTargets?.dailyProteinGrams).toBe(160);
    });
  });

  describe('UpdateUserProfileUseCase', () => {
    it('updates profile fields and increments version', async () => {
      await profileRepo.ensureProfile(actor.userId);
      const updated = await updateProfile.execute(actor, {
        version: 1,
        name: 'Jane Doe',
        heightCm: 168,
        currentWeightKg: 62.5,
        primaryGoal: 'gain',
      });

      expect(updated.name).toBe('Jane Doe');
      expect(updated.heightCm).toBe(168);
      expect(updated.currentWeightKg).toBe(62.5);
      expect(updated.primaryGoal).toBe('gain');
      expect(updated.version).toBe(2);
    });

    it('throws VERSION_CONFLICT on stale optimistic locking update', async () => {
      await profileRepo.ensureProfile(actor.userId);
      // Simulate concurrent update advancing version to 2
      await profileRepo.updateProfile(actor.userId, 1, { heightCm: 175 });

      // Stale update with version 1 must reject
      await expect(updateProfile.execute(actor, { version: 1, heightCm: 180 })).rejects.toMatchObject({
        code: 'VERSION_CONFLICT',
      });
    });
  });

  describe('SaveOnboardingStepUseCase', () => {
    it('saves intermediate step progress and preserves prior fields', async () => {
      await saveStep.execute(actor, 'height', { heightCm: 175 });
      const afterHeight = await getProfile.execute(actor);
      expect(afterHeight.heightCm).toBe(175);
      expect(afterHeight.currentOnboardingStep).toBe('height');

      await saveStep.execute(actor, 'weight', { weightKg: 70 });
      const afterWeight = await getProfile.execute(actor);
      expect(afterWeight.heightCm).toBe(175); // preserved
      expect(afterWeight.currentWeightKg).toBe(70);
      expect(afterWeight.currentOnboardingStep).toBe('weight');
    });
  });

  describe('CompleteOnboardingUseCase', () => {
    it('throws VALIDATION_FAILED if mandatory metrics are missing', async () => {
      await profileRepo.ensureProfile(actor.userId);
      await expect(completeOnboarding.execute(actor)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });

    it('calculates plan and completes onboarding when fields are valid', async () => {
      await profileRepo.ensureProfile(actor.userId);
      await profileRepo.updateProfile(actor.userId, 1, {
        heightCm: 178,
        currentWeightKg: 78,
        primaryGoal: 'lose',
        targetWeightKg: 75,
        sex: 'male',
        dateOfBirth: '1997-03-14',
        workoutDaysPerWeek: 5,
      });

      const result = await completeOnboarding.execute(actor);
      expect(result.onboardingCompleted).toBe(true);
      expect(result.calculatedPlan.dailyCalorieTarget).toBeGreaterThan(1500);
      expect(result.calculatedPlan.dailyProteinGrams).toBeGreaterThan(100);
      expect(result.calculatedPlan.projectedMilestone).toContain('75 kg');

      // Profile in storage should be marked completed
      const profile = await getProfile.execute(actor);
      expect(profile.onboardingCompleted).toBe(true);
      expect(profile.currentOnboardingStep).toBe('done');
    });

    it('is idempotent on repeat calls', async () => {
      await profileRepo.ensureProfile(actor.userId);
      await profileRepo.updateProfile(actor.userId, 1, {
        heightCm: 178,
        currentWeightKg: 78,
        primaryGoal: 'lose',
        targetWeightKg: 75,
        sex: 'male',
      });

      const first = await completeOnboarding.execute(actor);
      const second = await completeOnboarding.execute(actor);
      expect(first).toEqual(second);
    });
  });

  describe('UserSettings Use Cases', () => {
    it('fetches default settings', async () => {
      const settings = await getSettings.execute(actor);
      expect(settings).toMatchObject({
        userId: actor.userId,
        themeMode: 'system',
        unitSystem: 'metric',
        healthConnectEnabled: false,
        smartwatchConnected: false,
        notificationsEnabled: true,
      });
    });

    it('updates preferences', async () => {
      const updated = await updateSettings.execute(actor, {
        themeMode: 'dark',
        unitSystem: 'imperial',
        healthConnectEnabled: true,
      });
      expect(updated.themeMode).toBe('dark');
      expect(updated.unitSystem).toBe('imperial');
      expect(updated.healthConnectEnabled).toBe(true);
    });
  });
});
