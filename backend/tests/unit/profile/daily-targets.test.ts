import { describe, expect, it } from 'vitest';
import {
  ageFromDateOfBirth,
  DEFAULT_DAILY_TARGETS,
  resolveDailyTargets,
  type DailyTargetsInput,
} from '../../../src/modules/profile/index.js';
import { MetabolicCalculator } from '../../../src/modules/profile/domain/metabolic-calculator.js';

const nothingKnown: DailyTargetsInput = {
  savedCalorieTarget: null,
  savedProteinGrams: null,
  savedWaterTargetMl: null,
  weightKg: null,
  heightCm: null,
  age: null,
  sex: null,
  primaryGoal: null,
  workoutDaysPerWeek: null,
};

// 80 kg, 180 cm, 30 y, male, 4 training days: BMR 1780, TDEE round(1780 * 1.55) = 2759.
const profile: DailyTargetsInput = {
  ...nothingKnown,
  weightKg: 80,
  heightCm: 180,
  age: 30,
  sex: 'male',
  workoutDaysPerWeek: 4,
};

describe('resolveDailyTargets: calories and macros', () => {
  describe('targets the member has saved', () => {
    it('uses the saved calories and protein, labelled as saved, and splits fat and carbs by the shared rule', () => {
      const targets = resolveDailyTargets({
        ...profile,
        savedCalorieTarget: 2100,
        savedProteinGrams: 160,
        primaryGoal: 'lose',
      });

      // fat = 25% of calories / 9 = 58; carbs = (2100 - 160*4 - 58*9) / 4 = 234.5 -> 235
      expect(targets).toMatchObject({
        source: 'saved',
        caloriesGoal: 2100,
        proteinGoal: 160,
        fatGoal: 58,
        carbsGoal: 235,
      });
    });

    it('works out protein from the calories when only calories were saved', () => {
      expect(resolveDailyTargets({ ...nothingKnown, savedCalorieTarget: 2400 })).toMatchObject({
        source: 'saved',
        caloriesGoal: 2400,
        proteinGoal: 150,
        fatGoal: 67,
        carbsGoal: 299,
      });
    });

    it('does not treat an implausibly low saved value (500 or less) as a real target', () => {
      expect(resolveDailyTargets({ ...nothingKnown, savedCalorieTarget: 500 }).source).toBe('default');
    });

    it('saved targets beat an estimate from the same profile', () => {
      expect(resolveDailyTargets({ ...profile, savedCalorieTarget: 1900 })).toMatchObject({
        source: 'saved',
        caloriesGoal: 1900,
      });
    });
  });

  describe('estimates from real profile inputs', () => {
    it('maintenance equals TDEE', () => {
      expect(resolveDailyTargets({ ...profile, primaryGoal: 'maintain' })).toMatchObject({
        source: 'estimated',
        caloriesGoal: 2759,
      });
    });

    it('applies the stored goal names: "lose" is a 500 kcal deficit and "gain" a 300 kcal surplus', () => {
      // Regression: these were once compared with 'fat_loss' / 'muscle_gain', which are never stored,
      // so a member's goal was silently ignored.
      expect(resolveDailyTargets({ ...profile, primaryGoal: 'lose' }).caloriesGoal).toBe(2259);
      expect(resolveDailyTargets({ ...profile, primaryGoal: 'gain' }).caloriesGoal).toBe(3059);
    });

    it('treats a missing or unknown goal as maintenance', () => {
      expect(resolveDailyTargets({ ...profile, primaryGoal: null }).caloriesGoal).toBe(2759);
      expect(resolveDailyTargets({ ...profile, primaryGoal: 'bulk' }).caloriesGoal).toBe(2759);
    });

    it('never goes below the 1200 kcal floor when a woman is cutting', () => {
      const small = resolveDailyTargets({
        ...nothingKnown,
        weightKg: 45,
        heightCm: 150,
        age: 60,
        sex: 'female',
        primaryGoal: 'lose',
        workoutDaysPerWeek: 0,
      });

      expect(small.caloriesGoal).toBe(1200);
      expect(small).toMatchObject({ proteinGoal: 90, fatGoal: 33, carbsGoal: 136 });
    });

    it('an estimate needs weight, height and age; without any one of them the result is "default"', () => {
      for (const missing of [{ weightKg: null }, { heightCm: null }, { age: null }]) {
        expect(resolveDailyTargets({ ...profile, ...missing }).source).toBe('default');
      }
    });
  });

  it('knowing nothing about the member returns the generic placeholders marked "default"', () => {
    expect(resolveDailyTargets(nothingKnown)).toEqual({
      source: 'default',
      ...DEFAULT_DAILY_TARGETS,
      water: null,
    });
  });

  // The contract this whole change exists for: whichever screen asks, the four numbers are the same ones the
  // onboarding calculator produces for the same person.
  it('agrees with the onboarding calculator on all four numbers', () => {
    for (const goal of ['lose', 'maintain', 'gain', 'strength'] as const) {
      const calculated = MetabolicCalculator.calculateTargets({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        sex: 'male',
        goal,
        workoutDaysPerWeek: 4,
      });
      const resolved = resolveDailyTargets({ ...profile, primaryGoal: goal });
      expect(resolved).toMatchObject({
        caloriesGoal: calculated.dailyCalorieTarget,
        proteinGoal: calculated.dailyProteinGrams,
        carbsGoal: calculated.dailyCarbGrams,
        fatGoal: calculated.dailyFatGrams,
      });

      // And once those were saved at onboarding, reading them back gives the same carbs and fat again.
      const saved = resolveDailyTargets({
        ...nothingKnown,
        savedCalorieTarget: calculated.dailyCalorieTarget,
        savedProteinGrams: calculated.dailyProteinGrams,
      });
      expect(saved).toMatchObject({
        source: 'saved',
        carbsGoal: calculated.dailyCarbGrams,
        fatGoal: calculated.dailyFatGrams,
      });
    }
  });
});

describe('resolveDailyTargets: water', () => {
  it("uses the member's own target when they set one, whatever their weight", () => {
    expect(resolveDailyTargets({ ...profile, savedWaterTargetMl: 3200 }).water).toEqual({
      targetMl: 3200,
      source: 'saved',
    });
  });

  it('starts from 35 ml per kg of body weight, rounded to 50 ml, labelled as an estimate', () => {
    expect(resolveDailyTargets({ ...nothingKnown, weightKg: 80 }).water).toEqual({
      targetMl: 2800,
      source: 'estimated',
    });
    expect(resolveDailyTargets({ ...nothingKnown, weightKg: 70 }).water).toEqual({
      targetMl: 2450,
      source: 'estimated',
    });
  });

  it('keeps the estimate in a sensible band', () => {
    expect(MetabolicCalculator.estimateWaterTargetMl(30)).toBe(1500);
    expect(MetabolicCalculator.estimateWaterTargetMl(250)).toBe(5000);
  });

  it('has no water target when the member never set one and their weight is unknown (nothing is invented)', () => {
    expect(resolveDailyTargets(nothingKnown).water).toBeNull();
  });

  it('resolves water independently of the food targets', () => {
    const onlyWeight = resolveDailyTargets({ ...nothingKnown, weightKg: 60 });
    expect(onlyWeight.source).toBe('default');
    expect(onlyWeight.water).toEqual({ targetMl: 2100, source: 'estimated' });
  });
});

describe('ageFromDateOfBirth', () => {
  const now = new Date(2026, 10, 20); // 20 Nov 2026 (local time, like the calculation itself)

  it('counts whole years, and a birthday not yet reached this year does not count', () => {
    expect(ageFromDateOfBirth('1996-11-20', now)).toBe(30);
    expect(ageFromDateOfBirth('1996-11-21', now)).toBe(29);
  });

  it('accepts the Date a date column arrives as', () => {
    expect(ageFromDateOfBirth(new Date(1990, 0, 15), now)).toBe(36);
  });

  it('is null for a missing or invalid date', () => {
    expect(ageFromDateOfBirth(null, now)).toBeNull();
    expect(ageFromDateOfBirth('not-a-date', now)).toBeNull();
  });
});
