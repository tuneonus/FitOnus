import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NUTRITION_TARGETS,
  deriveNutritionTargets,
  type NutritionTargetsInput,
} from '../../../src/modules/dashboard/domain/nutrition-targets.js';
import { nutritionSummarySchema } from '../../../src/modules/dashboard/interface/dashboard.schemas.js';

const nothingKnown: NutritionTargetsInput = {
  savedCalorieTarget: null,
  savedProteinGrams: null,
  weightKg: null,
  heightCm: null,
  age: null,
  sex: null,
  primaryGoal: null,
  workoutDaysPerWeek: null,
};

// 80 kg, 180 cm, 30 y, male, 4 training days: BMR 1780, TDEE round(1780 * 1.55) = 2759.
const profile: NutritionTargetsInput = {
  ...nothingKnown,
  weightKg: 80,
  heightCm: 180,
  age: 30,
  sex: 'male',
  workoutDaysPerWeek: 4,
};

describe('deriveNutritionTargets', () => {
  describe('targets the user has saved', () => {
    it('uses the saved calories and protein, labelled as saved', () => {
      const targets = deriveNutritionTargets({
        ...profile,
        savedCalorieTarget: 2100,
        savedProteinGrams: 160,
        primaryGoal: 'lose',
      });

      expect(targets).toMatchObject({ source: 'saved', caloriesGoal: 2100, proteinGoal: 160 });
      // Carbs and fat are never stored: a fixed-ratio split of the saved calories.
      expect(targets.carbsGoal).toBe(Math.round((2100 * 0.5) / 4));
      expect(targets.fatGoal).toBe(Math.round((2100 * 0.25) / 9));
    });

    it('works out protein from the calories when only calories were saved', () => {
      const targets = deriveNutritionTargets({ ...nothingKnown, savedCalorieTarget: 2400 });

      expect(targets).toMatchObject({ source: 'saved', caloriesGoal: 2400, proteinGoal: 150 });
    });

    it('does not treat an implausibly low saved value (500 or less) as a real target', () => {
      const targets = deriveNutritionTargets({ ...nothingKnown, savedCalorieTarget: 500 });

      expect(targets.source).toBe('default');
    });

    it('saved targets beat an estimate from the same profile', () => {
      const targets = deriveNutritionTargets({ ...profile, savedCalorieTarget: 1900 });

      expect(targets).toMatchObject({ source: 'saved', caloriesGoal: 1900 });
    });
  });

  describe('estimates from real profile inputs', () => {
    it('maintenance equals TDEE', () => {
      const targets = deriveNutritionTargets({ ...profile, primaryGoal: 'maintain' });

      expect(targets).toMatchObject({ source: 'estimated', caloriesGoal: 2759 });
    });

    it('applies the stored goal names: "lose" is a 500 kcal deficit and "gain" a 300 kcal surplus', () => {
      // Regression: these used to be compared with 'fat_loss' / 'muscle_gain', which are never stored,
      // so a user's goal was silently ignored.
      expect(deriveNutritionTargets({ ...profile, primaryGoal: 'lose' }).caloriesGoal).toBe(2259);
      expect(deriveNutritionTargets({ ...profile, primaryGoal: 'gain' }).caloriesGoal).toBe(3059);
      expect(deriveNutritionTargets({ ...profile, primaryGoal: 'lose' }).caloriesGoal).not.toBe(
        deriveNutritionTargets({ ...profile, primaryGoal: 'maintain' }).caloriesGoal,
      );
    });

    it('derives protein, carbs and fat from the estimated calories', () => {
      const targets = deriveNutritionTargets({ ...profile, primaryGoal: 'lose' });

      expect(targets).toMatchObject({ proteinGoal: 141, carbsGoal: 282, fatGoal: 63 });
    });

    it('never goes below the 1200 kcal floor when cutting', () => {
      const small = deriveNutritionTargets({
        ...nothingKnown,
        weightKg: 45,
        heightCm: 150,
        age: 60,
        sex: 'female',
        primaryGoal: 'lose',
        workoutDaysPerWeek: 0,
      });

      expect(small.caloriesGoal).toBe(1200);
    });
  });

  describe('missing targets are labelled as placeholders, not presented as personal', () => {
    it('knowing nothing about the user returns the generic placeholders marked "default"', () => {
      const targets = deriveNutritionTargets(nothingKnown);

      expect(targets).toEqual({ source: 'default', ...DEFAULT_NUTRITION_TARGETS });
    });

    it.each([
      ['weight', { weightKg: null }],
      ['height', { heightCm: null }],
      ['age', { age: null }],
    ])('an estimate needs the %s too; without it the result is "default"', (_name, missing) => {
      expect(deriveNutritionTargets({ ...profile, ...missing }).source).toBe('default');
    });
  });
});

describe('dashboard response schema', () => {
  const nutrition = {
    calories: 1200,
    caloriesGoal: 2259,
    protein: 80,
    proteinGoal: 141,
    carbs: 100,
    carbsGoal: 282,
    fat: 40,
    fatGoal: 63,
  };

  it('carries targetsSource through to clients', () => {
    const parsed = nutritionSummarySchema.parse({ ...nutrition, targetsSource: 'estimated' });

    expect(parsed.targetsSource).toBe('estimated');
  });

  it('stays valid without targetsSource, so existing payloads and clients are unaffected', () => {
    expect(nutritionSummarySchema.parse(nutrition).targetsSource).toBeUndefined();
  });

  it('rejects an unknown source', () => {
    expect(nutritionSummarySchema.safeParse({ ...nutrition, targetsSource: 'guess' }).success).toBe(false);
  });
});
