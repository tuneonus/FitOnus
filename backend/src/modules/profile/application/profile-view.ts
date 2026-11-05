import type {
  DietType,
  ExperienceLevel,
  FitnessGoal,
  OnboardingStep,
  Sex,
  WorkoutPlace,
} from '../domain/fitness-profile.js';
import { MetabolicCalculator, type MetabolicMetrics } from '../domain/metabolic-calculator.js';
import type { ThemeMode, UnitSystem, UserSettings } from '../domain/user-settings.js';
import type { ProfileWithIdentity } from './ports.js';

export interface UserProfileView {
  userId: string;
  name: string;
  sex: Sex;
  dateOfBirth: string | null;
  age: number | null;
  heightCm: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  primaryGoal: FitnessGoal | null;
  experienceLevel: ExperienceLevel | null;
  preferredWorkoutPlace: WorkoutPlace | null;
  workoutDaysPerWeek: number | null;
  preferredWorkoutDurationMin: number | null;
  availableEquipment: string[];
  dietType: DietType | null;
  allergies: string[];
  preferredCuisines: string[];
  onboardingCompleted: boolean;
  currentOnboardingStep: OnboardingStep;
  calculatedTargets: MetabolicMetrics | null;
  version: number;
  updatedAt: string;
}

export interface UserSettingsView {
  userId: string;
  themeMode: ThemeMode;
  unitSystem: UnitSystem;
  healthConnectEnabled: boolean;
  smartwatchConnected: boolean;
  notificationsEnabled: boolean;
  updatedAt: string;
}

export interface OnboardingCompleteView {
  onboardingCompleted: boolean;
  calculatedPlan: {
    dailyCalorieTarget: number;
    dailyProteinGrams: number;
    workoutsPerWeek: number;
    projectedMilestone: string;
  };
}

export function toProfileView(data: ProfileWithIdentity): UserProfileView {
  const { profile, name } = data;
  let calculatedTargets: MetabolicMetrics | null = null;
  const age = profile.age ?? 25;
  if (profile.heightCm && profile.currentWeightKg && profile.primaryGoal) {
    calculatedTargets = MetabolicCalculator.calculateTargets({
      weightKg: Number(profile.currentWeightKg),
      heightCm: Number(profile.heightCm),
      age,
      sex: profile.sex,
      goal: profile.primaryGoal,
      workoutDaysPerWeek: profile.workoutDaysPerWeek,
    });
  }

  return {
    userId: profile.userId,
    name,
    sex: profile.sex,
    dateOfBirth: profile.dateOfBirth,
    age: profile.age,
    heightCm: profile.heightCm !== null ? Number(profile.heightCm) : null,
    currentWeightKg: profile.currentWeightKg !== null ? Number(profile.currentWeightKg) : null,
    targetWeightKg: profile.targetWeightKg !== null ? Number(profile.targetWeightKg) : null,
    primaryGoal: profile.primaryGoal,
    experienceLevel: profile.experienceLevel,
    preferredWorkoutPlace: profile.preferredWorkoutPlace,
    workoutDaysPerWeek: profile.workoutDaysPerWeek,
    preferredWorkoutDurationMin: profile.preferredWorkoutDurationMin,
    availableEquipment: [...profile.availableEquipment],
    dietType: profile.dietType,
    allergies: [...profile.allergies],
    preferredCuisines: [...profile.preferredCuisines],
    onboardingCompleted: profile.onboardingCompleted,
    currentOnboardingStep: profile.currentOnboardingStep,
    calculatedTargets,
    version: profile.version,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export function toSettingsView(settings: UserSettings): UserSettingsView {
  return {
    userId: settings.userId,
    themeMode: settings.themeMode,
    unitSystem: settings.unitSystem,
    healthConnectEnabled: settings.healthConnectEnabled,
    smartwatchConnected: settings.smartwatchConnected,
    notificationsEnabled: settings.notificationsEnabled,
    updatedAt: settings.updatedAt.toISOString(),
  };
}
