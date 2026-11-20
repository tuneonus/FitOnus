import type { FitnessGoal, Sex } from './fitness-profile.js';
import { FITNESS_GOALS } from './fitness-profile.js';
import { MetabolicCalculator } from './metabolic-calculator.js';

/**
 * THE one place that decides a member's daily calorie, protein, carbohydrate, fat and water targets. The nutrition
 * diary, the home dashboard and the nutrition analytics all read through it, so the same member never sees two
 * different goals on two screens.
 *
 * Where a number comes from is always reported, so clients can tell the member's own numbers from stand-ins:
 *  - `saved`:     calories (and usually protein) saved on the profile at onboarding; water set by the member.
 *  - `estimated`: worked out from the profile's weight, height, age, sex, goal and training days.
 *  - `default`:   nothing about the member is known; generic placeholders that must never be presented as personal.
 */
export type DailyTargetsSource = 'saved' | 'estimated' | 'default';

/** The placeholders for a member we know nothing about (reported with `source: 'default'`). */
export const DEFAULT_DAILY_TARGETS = {
  caloriesGoal: 2200,
  proteinGoal: 150,
  carbsGoal: 250,
  fatGoal: 70,
} as const;

export interface DailyTargetsInput {
  savedCalorieTarget: number | null;
  savedProteinGrams: number | null;
  /** The member's own water target in ml (user_nutrition_settings), or null when they never set one. */
  savedWaterTargetMl: number | null;
  weightKg: number | null;
  heightCm: number | null;
  /** Whole years, or null when the date of birth is unknown. */
  age: number | null;
  /** `user_profiles.sex`. Anything that is not male/female is treated as unspecified. */
  sex: string | null;
  /** `user_profiles.primary_goal`. A missing or unknown goal means maintenance. */
  primaryGoal: string | null;
  workoutDaysPerWeek: number | null;
}

export interface ResolvedDailyTargets {
  /** Where calories, protein, carbs and fat came from. */
  source: DailyTargetsSource;
  caloriesGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
  /** Null when the member never set a water target and their weight is unknown (nothing to estimate from). */
  water: { targetMl: number; source: 'saved' | 'estimated' } | null;
}

/** Same threshold the profile table enforces for a stored calorie target. */
const MIN_SAVED_CALORIES = 500;

function toSex(value: string | null): Sex {
  return value === 'male' || value === 'female' ? value : 'unspecified';
}

function toGoal(value: string | null): FitnessGoal {
  return (FITNESS_GOALS as readonly string[]).includes(value ?? '') ? (value as FitnessGoal) : 'maintain';
}

/** Whole years between a date of birth (a `date` column arrives as a Date or a YYYY-MM-DD string) and `now`. */
export function ageFromDateOfBirth(dateOfBirth: string | Date | null, now: Date = new Date()): number | null {
  if (!dateOfBirth) return null;
  const birth = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const months = now.getMonth() - birth.getMonth();
  if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) age--;
  return age > 0 ? age : null;
}

function resolveWater(input: DailyTargetsInput): ResolvedDailyTargets['water'] {
  if (input.savedWaterTargetMl !== null) return { targetMl: input.savedWaterTargetMl, source: 'saved' };
  if (input.weightKg !== null && input.weightKg > 0) {
    return { targetMl: MetabolicCalculator.estimateWaterTargetMl(input.weightKg), source: 'estimated' };
  }
  return null;
}

/**
 * The calorie and macro targets of a resolution when they are the member's own (saved or estimated from their
 * profile), or null when they are only the generic placeholders. Screens that must never show a made-up goal use
 * this instead of reading `caloriesGoal` and friends off a `default` resolution.
 */
export function personalFoodTargets(resolved: ResolvedDailyTargets): {
  source: 'saved' | 'estimated';
  caloriesGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
} | null {
  if (resolved.source === 'default') return null;
  const { source, caloriesGoal, proteinGoal, carbsGoal, fatGoal } = resolved;
  return { source, caloriesGoal, proteinGoal, carbsGoal, fatGoal };
}

export function resolveDailyTargets(input: DailyTargetsInput): ResolvedDailyTargets {
  const water = resolveWater(input);

  // 1. Targets the member already has on their profile win.
  if (input.savedCalorieTarget !== null && input.savedCalorieTarget > MIN_SAVED_CALORIES) {
    const caloriesGoal = input.savedCalorieTarget;
    const proteinGoal = input.savedProteinGrams || Math.round((caloriesGoal * 0.25) / 4);
    const split = MetabolicCalculator.splitFatAndCarbs(caloriesGoal, proteinGoal);
    return {
      source: 'saved',
      caloriesGoal,
      proteinGoal,
      carbsGoal: split.dailyCarbGrams,
      fatGoal: split.dailyFatGrams,
      water,
    };
  }

  // 2. Otherwise estimate from real profile inputs with the same calculator onboarding uses, never from guessed ones.
  if (input.weightKg && input.heightCm && input.age) {
    const metrics = MetabolicCalculator.calculateTargets({
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      age: input.age,
      sex: toSex(input.sex),
      goal: toGoal(input.primaryGoal),
      workoutDaysPerWeek: input.workoutDaysPerWeek,
    });
    return {
      source: 'estimated',
      caloriesGoal: metrics.dailyCalorieTarget,
      proteinGoal: metrics.dailyProteinGrams,
      carbsGoal: metrics.dailyCarbGrams,
      fatGoal: metrics.dailyFatGrams,
      water,
    };
  }

  // 3. Nothing known about this member's food targets.
  return { source: 'default', ...DEFAULT_DAILY_TARGETS, water };
}
