import { describe, expect, it } from 'vitest';
import { MetabolicCalculator } from '../../../src/modules/profile/domain/metabolic-calculator.js';

describe('MetabolicCalculator', () => {
  describe('calculateBmr', () => {
    it('calculates accurate BMR for males using Mifflin-St Jeor', () => {
      // 80kg, 180cm, 30 years old male
      // BMR = 10 * 80 + 6.25 * 180 - 5 * 30 + 5 = 800 + 1125 - 150 + 5 = 1780
      const bmr = MetabolicCalculator.calculateBmr({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        sex: 'male',
      });
      expect(bmr).toBe(1780);
    });

    it('calculates accurate BMR for females using Mifflin-St Jeor', () => {
      // 60kg, 165cm, 28 years old female
      // BMR = 10 * 60 + 6.25 * 165 - 5 * 28 - 161 = 600 + 1031.25 - 140 - 161 = 1330.25 -> 1330
      const bmr = MetabolicCalculator.calculateBmr({
        weightKg: 60,
        heightCm: 165,
        age: 28,
        sex: 'female',
      });
      expect(bmr).toBe(1330);
    });

    it('calculates accurate midpoint BMR for unspecified sex', () => {
      // 70kg, 170cm, 25 years old unspecified
      // base = 10 * 70 + 6.25 * 170 - 5 * 25 - 78 = 700 + 1062.5 - 125 - 78 = 1559.5 -> 1560
      const bmr = MetabolicCalculator.calculateBmr({
        weightKg: 70,
        heightCm: 170,
        age: 25,
        sex: 'unspecified',
      });
      expect(bmr).toBe(1560);
    });
  });

  describe('getActivityMultiplier', () => {
    it('returns appropriate multiplier based on training frequency', () => {
      expect(MetabolicCalculator.getActivityMultiplier(null)).toBe(1.2);
      expect(MetabolicCalculator.getActivityMultiplier(0)).toBe(1.2);
      expect(MetabolicCalculator.getActivityMultiplier(2)).toBe(1.375);
      expect(MetabolicCalculator.getActivityMultiplier(4)).toBe(1.55);
      expect(MetabolicCalculator.getActivityMultiplier(5)).toBe(1.725);
      expect(MetabolicCalculator.getActivityMultiplier(7)).toBe(1.9);
    });
  });

  describe('calculateTargets', () => {
    it('applies a 500 kcal deficit for weight loss with 2.0g/kg protein', () => {
      // 80kg male, 180cm, 30yo, 5 days/wk
      // BMR = 1780. TDEE = round(1780 * 1.725) = 3071
      // Target = 3071 - 500 = 2571 kcal
      // Protein = 80 * 2.0 = 160g (640 kcal)
      // Fat = 25% of 2571 / 9 = 642.75 / 9 = 71g (639 kcal)
      // Carbs = (2571 - 640 - 639) / 4 = 1292 / 4 = 323g
      const result = MetabolicCalculator.calculateTargets({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        sex: 'male',
        goal: 'lose',
        workoutDaysPerWeek: 5,
      });

      expect(result.bmr).toBe(1780);
      expect(result.tdee).toBe(3071);
      expect(result.dailyCalorieTarget).toBe(2571);
      expect(result.dailyProteinGrams).toBe(160);
      expect(result.dailyFatGrams).toBe(71);
      expect(result.dailyCarbGrams).toBe(323);
    });

    it('enforces safety calorie floor (min 1500 kcal for male)', () => {
      // Low weight, older male with low activity
      const result = MetabolicCalculator.calculateTargets({
        weightKg: 50,
        heightCm: 155,
        age: 65,
        sex: 'male',
        goal: 'lose',
        workoutDaysPerWeek: 1,
      });
      expect(result.dailyCalorieTarget).toBeGreaterThanOrEqual(1500);
    });

    it('applies a 300 kcal surplus for muscle gain with 2.2g/kg protein', () => {
      // 70kg male, 175cm, 25yo, 4 days/wk
      // BMR = 700 + 1093.75 - 125 + 5 = 1673.75 -> 1674
      // TDEE = round(1674 * 1.55) = 2595
      // Target = 2595 + 300 = 2895 kcal
      // Protein = 70 * 2.2 = 154g
      const result = MetabolicCalculator.calculateTargets({
        weightKg: 70,
        heightCm: 175,
        age: 25,
        sex: 'male',
        goal: 'gain',
        workoutDaysPerWeek: 4,
      });

      expect(result.dailyCalorieTarget).toBe(2895);
      expect(result.dailyProteinGrams).toBe(154);
    });

    it('sets maintenance calories for endurance and general goals with 1.6g/kg protein', () => {
      const result = MetabolicCalculator.calculateTargets({
        weightKg: 65,
        heightCm: 170,
        age: 26,
        sex: 'female',
        goal: '5k',
        workoutDaysPerWeek: 3,
      });

      expect(result.dailyCalorieTarget).toBe(result.tdee);
      expect(result.dailyProteinGrams).toBe(Math.round(65 * 1.6));
    });
  });
});
