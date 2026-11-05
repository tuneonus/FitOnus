import type {
  DietType,
  ExperienceLevel,
  FitnessGoal,
  OnboardingStep,
  Sex,
  UserProfile,
  WorkoutPlace,
} from '../domain/fitness-profile.js';
import type { ThemeMode, UnitSystem, UserSettings } from '../domain/user-settings.js';

export interface ProfileWithIdentity {
  profile: UserProfile;
  name: string;
}

export interface UpdateProfileParams {
  name?: string;
  sex?: Sex;
  dateOfBirth?: string | null;
  heightCm?: number | null;
  currentWeightKg?: number | null;
  targetWeightKg?: number | null;
  primaryGoal?: FitnessGoal | null;
  experienceLevel?: ExperienceLevel | null;
  preferredWorkoutPlace?: WorkoutPlace | null;
  workoutDaysPerWeek?: number | null;
  preferredWorkoutDurationMin?: number | null;
  availableEquipment?: string[];
  dietType?: DietType | null;
  allergies?: string[];
  preferredCuisines?: string[];
  dailyCalorieTarget?: number | null;
  dailyProteinGrams?: number | null;
}

export interface ProfileRepository {
  findByUserId(userId: string): Promise<ProfileWithIdentity | null>;
  ensureProfile(userId: string): Promise<ProfileWithIdentity>;
  updateProfile(
    userId: string,
    expectedVersion: number,
    changes: UpdateProfileParams,
  ): Promise<ProfileWithIdentity | null>;
  saveOnboardingStep(
    userId: string,
    step: OnboardingStep,
    data: Record<string, unknown>,
  ): Promise<ProfileWithIdentity>;
  completeOnboarding(
    userId: string,
    targets: { dailyCalorieTarget: number; dailyProteinGrams: number },
  ): Promise<ProfileWithIdentity>;
}

export interface UpdateSettingsParams {
  themeMode?: ThemeMode;
  unitSystem?: UnitSystem;
  healthConnectEnabled?: boolean;
  smartwatchConnected?: boolean;
  notificationsEnabled?: boolean;
}

export interface SettingsRepository {
  findByUserId(userId: string): Promise<UserSettings | null>;
  ensureSettings(userId: string): Promise<UserSettings>;
  updateSettings(userId: string, changes: UpdateSettingsParams): Promise<UserSettings>;
}
