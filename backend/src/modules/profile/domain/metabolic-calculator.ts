import type { FitnessGoal, Sex } from './fitness-profile.js';

export const WATER_ML_PER_KG = 35;
const WATER_ESTIMATE_MIN_ML = 1500;
const WATER_ESTIMATE_MAX_ML = 5000;

export interface MetabolicMetrics {
  bmr: number;
  tdee: number;
  dailyCalorieTarget: number;
  dailyProteinGrams: number;
  dailyCarbGrams: number;
  dailyFatGrams: number;
}

export class MetabolicCalculator {
  /**
   * Calculates Basal Metabolic Rate using the clinically validated Mifflin-St Jeor equation.
   */
  static calculateBmr(params: { weightKg: number; heightCm: number; age: number; sex: Sex }): number {
    const { weightKg, heightCm, age, sex } = params;
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    if (sex === 'male') {
      return Math.round(base + 5);
    }
    if (sex === 'female') {
      return Math.round(base - 161);
    }
    // For unspecified, use midpoint between male and female
    return Math.round(base - 78);
  }

  /**
   * Derives physical activity multiplier from weekly training frequency.
   */
  static getActivityMultiplier(workoutDaysPerWeek: number | null): number {
    if (!workoutDaysPerWeek || workoutDaysPerWeek <= 0) return 1.2; // Sedentary
    if (workoutDaysPerWeek <= 2) return 1.375; // Lightly active
    if (workoutDaysPerWeek <= 4) return 1.55; // Moderately active
    if (workoutDaysPerWeek <= 6) return 1.725; // Very active
    return 1.9; // Extremely active
  }

  /**
   * Calculates daily caloric and macronutrient targets calibrated to goal.
   */
  static calculateTargets(params: {
    weightKg: number;
    heightCm: number;
    age: number;
    sex: Sex;
    goal: FitnessGoal;
    workoutDaysPerWeek: number | null;
  }): MetabolicMetrics {
    const bmr = this.calculateBmr(params);
    const multiplier = this.getActivityMultiplier(params.workoutDaysPerWeek);
    const tdee = Math.round(bmr * multiplier);

    let calorieTarget = tdee;
    if (params.goal === 'lose') {
      const minCalories = params.sex === 'female' ? 1200 : 1500;
      calorieTarget = Math.max(minCalories, tdee - 500);
    } else if (params.goal === 'gain') {
      calorieTarget = tdee + 300;
    }

    // Protein target (grams per kg bodyweight)
    let proteinPerKg = 1.6;
    if (params.goal === 'lose' || params.goal === 'strength') {
      proteinPerKg = 2.0;
    } else if (params.goal === 'gain') {
      proteinPerKg = 2.2;
    }
    const proteinGrams = Math.max(50, Math.round(params.weightKg * proteinPerKg));

    return {
      bmr,
      tdee,
      dailyCalorieTarget: calorieTarget,
      dailyProteinGrams: proteinGrams,
      ...this.splitFatAndCarbs(calorieTarget, proteinGrams),
    };
  }

  /**
   * The one rule that turns a calorie and protein target into the fat and carbohydrate targets, so a saved target
   * (which stores only calories and protein) and a freshly calculated one always agree on all four numbers.
   */
  static splitFatAndCarbs(
    calorieTarget: number,
    proteinGrams: number,
  ): { dailyCarbGrams: number; dailyFatGrams: number } {
    // Fat target: ~25% of calories (9 kcal/g)
    const fatGrams = Math.max(30, Math.round((calorieTarget * 0.25) / 9));
    // Carbohydrates: remainder of calories (4 kcal/g)
    const remainingCalories = calorieTarget - proteinGrams * 4 - fatGrams * 9;
    const carbGrams = Math.max(50, Math.round(remainingCalories / 4));
    return { dailyCarbGrams: carbGrams, dailyFatGrams: fatGrams };
  }

  /**
   * A starting estimate for the daily water target: 35 ml per kg of body weight, rounded to 50 ml and kept in a
   * sensible band. It is only ever a first guess; once the member sets a target that value wins.
   */
  static estimateWaterTargetMl(weightKg: number): number {
    const estimate = Math.round((weightKg * WATER_ML_PER_KG) / 50) * 50;
    return Math.min(WATER_ESTIMATE_MAX_ML, Math.max(WATER_ESTIMATE_MIN_ML, estimate));
  }
}
