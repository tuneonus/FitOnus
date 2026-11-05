export const SEXES = ['male', 'female', 'unspecified'] as const;
export type Sex = (typeof SEXES)[number];

export const FITNESS_GOALS = ['lose', 'gain', 'maintain', 'strength', '5k', '10k', 'marathon'] as const;
export type FitnessGoal = (typeof FITNESS_GOALS)[number];

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const WORKOUT_PLACES = ['gym', 'home', 'outdoor', 'mixed'] as const;
export type WorkoutPlace = (typeof WORKOUT_PLACES)[number];

export const DIET_TYPES = ['none', 'vegetarian', 'eggetarian', 'vegan', 'pescatarian'] as const;
export type DietType = (typeof DIET_TYPES)[number];

export const ONBOARDING_STEPS = [
  'intro',
  'personal',
  'dob',
  'height',
  'weight',
  'experience',
  'goal',
  'workoutPreference',
  'equipment',
  'duration',
  'food',
  'health',
  'device',
  'confirm',
  'done',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface UserProfileProps {
  userId: string;
  sex: Sex;
  dateOfBirth: string | null;
  heightCm: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  primaryGoal: FitnessGoal | null;
  experienceLevel: ExperienceLevel | null;
  preferredWorkoutPlace: WorkoutPlace | null;
  workoutDaysPerWeek: number | null;
  preferredWorkoutDurationMin: number | null;
  availableEquipment: readonly string[];
  dietType: DietType | null;
  allergies: readonly string[];
  preferredCuisines: readonly string[];
  onboardingCompleted: boolean;
  currentOnboardingStep: OnboardingStep;
  dailyCalorieTarget: number | null;
  dailyProteinGrams: number | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class UserProfile {
  private constructor(private readonly props: UserProfileProps) {}

  static createDefault(userId: string): UserProfile {
    const now = new Date();
    return new UserProfile({
      userId,
      sex: 'unspecified',
      dateOfBirth: null,
      heightCm: null,
      currentWeightKg: null,
      targetWeightKg: null,
      primaryGoal: null,
      experienceLevel: null,
      preferredWorkoutPlace: null,
      workoutDaysPerWeek: null,
      preferredWorkoutDurationMin: null,
      availableEquipment: [],
      dietType: null,
      allergies: [],
      preferredCuisines: [],
      onboardingCompleted: false,
      currentOnboardingStep: 'intro',
      dailyCalorieTarget: null,
      dailyProteinGrams: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstruct(props: UserProfileProps): UserProfile {
    return new UserProfile(props);
  }

  get userId(): string {
    return this.props.userId;
  }
  get sex(): Sex {
    return this.props.sex;
  }
  get dateOfBirth(): string | null {
    return this.props.dateOfBirth;
  }
  get heightCm(): number | null {
    return this.props.heightCm;
  }
  get currentWeightKg(): number | null {
    return this.props.currentWeightKg;
  }
  get targetWeightKg(): number | null {
    return this.props.targetWeightKg;
  }
  get primaryGoal(): FitnessGoal | null {
    return this.props.primaryGoal;
  }
  get experienceLevel(): ExperienceLevel | null {
    return this.props.experienceLevel;
  }
  get preferredWorkoutPlace(): WorkoutPlace | null {
    return this.props.preferredWorkoutPlace;
  }
  get workoutDaysPerWeek(): number | null {
    return this.props.workoutDaysPerWeek;
  }
  get preferredWorkoutDurationMin(): number | null {
    return this.props.preferredWorkoutDurationMin;
  }
  get availableEquipment(): readonly string[] {
    return this.props.availableEquipment;
  }
  get dietType(): DietType | null {
    return this.props.dietType;
  }
  get allergies(): readonly string[] {
    return this.props.allergies;
  }
  get preferredCuisines(): readonly string[] {
    return this.props.preferredCuisines;
  }
  get onboardingCompleted(): boolean {
    return this.props.onboardingCompleted;
  }
  get currentOnboardingStep(): OnboardingStep {
    return this.props.currentOnboardingStep;
  }
  get dailyCalorieTarget(): number | null {
    return this.props.dailyCalorieTarget;
  }
  get dailyProteinGrams(): number | null {
    return this.props.dailyProteinGrams;
  }
  get version(): number {
    return this.props.version;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get age(): number | null {
    if (!this.props.dateOfBirth) return null;
    const birth = new Date(this.props.dateOfBirth);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? age : null;
  }

  isReadyForOnboardingCompletion(): boolean {
    return (
      this.props.heightCm !== null &&
      this.props.currentWeightKg !== null &&
      this.props.primaryGoal !== null &&
      this.props.sex !== undefined
    );
  }

  copy(): UserProfileProps {
    return { ...this.props };
  }
}
