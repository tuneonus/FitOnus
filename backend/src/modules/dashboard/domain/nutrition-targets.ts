/**
 * Where a set of daily nutrition targets came from, so clients can tell the user's own numbers from
 * stand-ins:
 *  - `saved`:     calories (and usually protein) saved on the user's profile at onboarding.
 *  - `estimated`: worked out from the profile's weight, height, age, sex, goal and training days.
 *  - `default`:   nothing about the user is known; the numbers are generic placeholders and must never
 *                 be presented as personalised.
 */
export type NutritionTargetsSource = 'saved' | 'estimated' | 'default';

/**
 * The response contract requires numeric goals, so a user we know nothing about still gets these.
 * They are placeholders, reported with `source: 'default'`.
 */
export const DEFAULT_NUTRITION_TARGETS = {
  caloriesGoal: 2200,
  proteinGoal: 150,
  carbsGoal: 250,
  fatGoal: 70,
} as const;

export interface NutritionTargetsInput {
  savedCalorieTarget: number | null;
  savedProteinGrams: number | null;
  weightKg: number | null;
  heightCm: number | null;
  /** Whole years, or null when the date of birth is unknown. */
  age: number | null;
  sex: string | null;
  /** `user_profiles.primary_goal`: 'lose' | 'gain' | 'maintain' | 'strength' | '5k' | '10k' | 'marathon'. */
  primaryGoal: string | null;
  workoutDaysPerWeek: number | null;
}

export interface DerivedNutritionTargets {
  source: NutritionTargetsSource;
  caloriesGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
}

/** Same threshold the profile table enforces for a stored calorie target. */
const MIN_SAVED_CALORIES = 500;

/**
 * Carbs and fat are never stored, so they are always a fixed-ratio split of the calories
 * (50% carbs at 4 kcal/g, 25% fat at 9 kcal/g).
 */
function splitMacros(caloriesGoal: number): { carbsGoal: number; fatGoal: number } {
  return {
    carbsGoal: Math.round((caloriesGoal * 0.5) / 4),
    fatGoal: Math.round((caloriesGoal * 0.25) / 9),
  };
}

function activityMultiplier(workoutDaysPerWeek: number | null): number {
  if (!workoutDaysPerWeek || workoutDaysPerWeek <= 0) return 1.2;
  if (workoutDaysPerWeek <= 2) return 1.375;
  if (workoutDaysPerWeek <= 4) return 1.55;
  if (workoutDaysPerWeek <= 6) return 1.725;
  return 1.9;
}

export function deriveNutritionTargets(input: NutritionTargetsInput): DerivedNutritionTargets {
  // 1. Targets the user already has on their profile win.
  if (input.savedCalorieTarget !== null && input.savedCalorieTarget > MIN_SAVED_CALORIES) {
    const caloriesGoal = input.savedCalorieTarget;
    return {
      source: 'saved',
      caloriesGoal,
      proteinGoal: input.savedProteinGrams || Math.round((caloriesGoal * 0.25) / 4),
      ...splitMacros(caloriesGoal),
    };
  }

  // 2. Otherwise estimate from real profile inputs (Mifflin-St Jeor), never from guessed ones.
  if (input.weightKg && input.heightCm && input.age) {
    const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
    const bmr =
      input.sex === 'male' ? Math.round(base + 5) : input.sex === 'female' ? Math.round(base - 161) : Math.round(base - 78);
    const tdee = Math.round(bmr * activityMultiplier(input.workoutDaysPerWeek));
    // Goal names are the stored ones ('lose' / 'gain'), not the 'fat_loss' / 'muscle_gain' this once compared against.
    const caloriesGoal =
      input.primaryGoal === 'lose'
        ? Math.max(1200, Math.round(tdee - 500))
        : input.primaryGoal === 'gain'
          ? Math.round(tdee + 300)
          : tdee;
    return {
      source: 'estimated',
      caloriesGoal,
      proteinGoal: Math.round((caloriesGoal * 0.25) / 4),
      ...splitMacros(caloriesGoal),
    };
  }

  // 3. Nothing known about this user.
  return { source: 'default', ...DEFAULT_NUTRITION_TARGETS };
}
