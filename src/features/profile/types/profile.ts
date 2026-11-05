export type Sex = 'male' | 'female' | 'unspecified';
export type FitnessGoal = 'lose' | 'gain' | 'maintain' | 'strength' | '5k' | '10k' | 'marathon';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type WorkoutPlace = 'gym' | 'home' | 'outdoor' | 'mixed';
export type DietType = 'none' | 'vegetarian' | 'eggetarian' | 'vegan' | 'pescatarian';

export type OnboardingStep =
  | 'intro'
  | 'personal'
  | 'dob'
  | 'height'
  | 'weight'
  | 'experience'
  | 'goal'
  | 'workoutPreference'
  | 'equipment'
  | 'duration'
  | 'food'
  | 'health'
  | 'device'
  | 'confirm'
  | 'done';

export interface MetabolicMetrics {
  bmr: number;
  tdee: number;
  dailyCalorieTarget: number;
  dailyProteinGrams: number;
  dailyCarbGrams: number;
  dailyFatGrams: number;
}

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

export interface UpdateProfilePayload {
  version: number;
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
}

export interface CalculatedPlan {
  dailyCalorieTarget: number;
  dailyProteinGrams: number;
  workoutsPerWeek: number;
  projectedMilestone: string;
}

export interface OnboardingCompleteView {
  onboardingCompleted: boolean;
  calculatedPlan: CalculatedPlan;
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type UnitSystem = 'metric' | 'imperial';

export interface UserSettingsView {
  userId: string;
  themeMode: ThemeMode;
  unitSystem: UnitSystem;
  healthConnectEnabled: boolean;
  smartwatchConnected: boolean;
  notificationsEnabled: boolean;
  updatedAt: string;
}

export interface UpdateSettingsPayload {
  themeMode?: ThemeMode;
  unitSystem?: UnitSystem;
  healthConnectEnabled?: boolean;
  smartwatchConnected?: boolean;
  notificationsEnabled?: boolean;
}

