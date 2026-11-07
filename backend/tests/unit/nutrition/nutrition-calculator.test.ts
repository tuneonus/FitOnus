import { describe, expect, it } from 'vitest';
import {
  calculateByServingMultiplier,
  calculateByVolumeMl,
  calculateByWeightGrams,
  getStandardServingNutrients,
} from '../../../src/modules/nutrition/domain/nutrition-calculator.js';
import { VERIFIED_FOODS } from '../../../scripts/seed-foods.js';

describe('Nutrition Serving Calculation Contract', () => {
  const egg = VERIFIED_FOODS.find((f) => f.sourceId === '171287')!;
  const banana = VERIFIED_FOODS.find((f) => f.sourceId === '173944')!;
  const milk = VERIFIED_FOODS.find((f) => f.sourceId === '171265')!;
  const oliveOil = VERIFIED_FOODS.find((f) => f.sourceId === '171413')!;

  describe('Egg (piece unit, 50g per large egg, 143 kcal per 100g basis)', () => {
    it('calculates 1 standard egg as 71.5 kcal (NOT 143 kcal)', () => {
      const result = calculateByServingMultiplier(egg, 1.0);

      expect(result.effectiveWeightG).toBe(50.0);
      expect(result.servingMultiplier).toBe(1.0);
      // 143 * (50 / 100) = 71.5 kcal
      expect(result.calories).toBe(71.5);
      // 12.56 * 0.5 = 6.28 g protein
      expect(result.proteinG).toBe(6.28);
      // 0.72 * 0.5 = 0.36 g carbs
      expect(result.carbsG).toBe(0.36);
      // 9.51 * 0.5 = 4.76 g fat
      expect(result.fatG).toBe(4.76);
      expect(result.fiberG).toBe(0.0);
    });

    it('calculates 2 eggs as 143.0 kcal and 12.56g protein', () => {
      const result = calculateByServingMultiplier(egg, 2.0);

      expect(result.effectiveWeightG).toBe(100.0);
      expect(result.servingMultiplier).toBe(2.0);
      expect(result.calories).toBe(143.0);
      expect(result.proteinG).toBe(12.56);
      expect(result.fatG).toBe(9.51);
    });

    it('calculates 0.5 egg accurately (half egg portion)', () => {
      const result = calculateByServingMultiplier(egg, 0.5);

      expect(result.effectiveWeightG).toBe(25.0);
      expect(result.calories).toBe(35.8);
      expect(result.proteinG).toBe(3.14);
    });

    it('calculates egg by digital scale weight (e.g. 75g liquid egg whites/whole egg)', () => {
      const result = calculateByWeightGrams(egg, 75.0);

      expect(result.effectiveWeightG).toBe(75.0);
      expect(result.servingMultiplier).toBe(1.5);
      // 143 * 0.75 = 107.25 -> 107.3 kcal
      expect(result.calories).toBe(107.3);
      // 12.56 * 0.75 = 9.42 g
      expect(result.proteinG).toBe(9.42);
    });
  });

  describe('Banana (piece unit, 118g per medium banana, 89 kcal per 100g basis)', () => {
    it('calculates 1 medium banana as 105.0 kcal and 26.95g carbs', () => {
      const result = calculateByServingMultiplier(banana, 1.0);

      expect(result.effectiveWeightG).toBe(118.0);
      // 89 * 1.18 = 105.02 -> 105.0 kcal
      expect(result.calories).toBe(105.0);
      // 22.84 * 1.18 = 26.95 g carbs
      expect(result.carbsG).toBe(26.95);
      // 2.6 * 1.18 = 3.07 g fiber
      expect(result.fiberG).toBe(3.07);
    });

    it('calculates 1.5 bananas accurately', () => {
      const result = calculateByServingMultiplier(banana, 1.5);

      expect(result.effectiveWeightG).toBe(177.0);
      // 89 * 1.77 = 157.53 -> 157.5 kcal
      expect(result.calories).toBe(157.5);
      // 22.84 * 1.77 = 40.43 g carbs
      expect(result.carbsG).toBe(40.43);
    });

    it('calculates banana by weighed grams (e.g. 150g in oatmeal bowl)', () => {
      const result = calculateByWeightGrams(banana, 150.0);

      expect(result.effectiveWeightG).toBe(150.0);
      // 89 * 1.5 = 133.5 kcal
      expect(result.calories).toBe(133.5);
      expect(result.carbsG).toBe(34.26);
    });
  });

  describe('Whole Milk (liquid unit, density 1.0313 g/ml, 61 kcal per 100g basis)', () => {
    it('calculates 1 cup (244g / 237ml) as 148.8 kcal', () => {
      const result = calculateByServingMultiplier(milk, 1.0);

      expect(result.effectiveWeightG).toBe(244.0);
      // 61 * 2.44 = 148.84 -> 148.8 kcal
      expect(result.calories).toBe(148.8);
      // 3.15 * 2.44 = 7.686 -> 7.69 g protein
      expect(result.proteinG).toBe(7.69);
      // 3.25 * 2.44 = 7.93 g fat
      expect(result.fatG).toBe(7.93);
    });

    it('does NOT assume 1ml = 1g: 250ml milk weighs 257.83g, not 250g', () => {
      const result = calculateByVolumeMl(milk, 250.0);

      // 250 ml * 1.0313 g/ml = 257.83 g
      expect(result.effectiveWeightG).toBe(257.83);
      // 61 * 2.57825 = 157.27 -> 157.3 kcal (vs 152.5 kcal if assumed 1:1)
      expect(result.calories).toBe(157.3);
      // 3.15 * 2.57825 = 8.12 g protein (vs 7.88 g if assumed 1:1)
      expect(result.proteinG).toBe(8.12);
    });
  });

  describe('Olive Oil (fat liquid, density 0.9184 g/ml, 884 kcal per 100g basis)', () => {
    it('calculates 1 tbsp (13.5g) as 119.3 kcal and 13.5g fat', () => {
      const result = calculateByServingMultiplier(oliveOil, 1.0);

      expect(result.effectiveWeightG).toBe(13.5);
      // 884 * (13.5 / 100) = 119.34 -> 119.3 kcal
      expect(result.calories).toBe(119.3);
      // 100 * (13.5 / 100) = 13.5 g fat
      expect(result.fatG).toBe(13.5);
      expect(result.proteinG).toBe(0.0);
      expect(result.carbsG).toBe(0.0);
    });

    it('does NOT assume 1ml = 1g: 15ml olive oil weighs 13.78g, preventing a 9% calorie overcount', () => {
      const result = calculateByVolumeMl(oliveOil, 15.0);

      // 15 ml * 0.9184 g/ml = 13.78 g
      expect(result.effectiveWeightG).toBe(13.78);
      // 884 * 0.13776 = 121.78 -> 121.8 kcal (if assumed 1:1, it would wrongly be 132.6 kcal!)
      expect(result.calories).toBe(121.8);
      expect(result.fatG).toBe(13.78);
    });
  });

  describe('Arbitrary Multipliers & Portion Boundary Validation', () => {
    it('handles small micro-dosing and large bulk multipliers correctly', () => {
      const micro = calculateByServingMultiplier(egg, 0.25);
      expect(micro.effectiveWeightG).toBe(12.5);
      expect(micro.calories).toBe(17.9);

      const bulk = calculateByServingMultiplier(banana, 3.5);
      expect(bulk.effectiveWeightG).toBe(413.0);
      // 89 * 4.13 = 367.57 -> 367.6 kcal
      expect(bulk.calories).toBe(367.6);
    });

    it('getStandardServingNutrients matches multiplier of 1.0', () => {
      const standard = getStandardServingNutrients(banana);
      const multi = calculateByServingMultiplier(banana, 1.0);
      expect(standard).toEqual(multi);
    });

    it('throws error for non-positive multipliers, weights, and volumes', () => {
      expect(() => calculateByServingMultiplier(egg, 0)).toThrow(/greater than 0/);
      expect(() => calculateByServingMultiplier(egg, -1)).toThrow(/greater than 0/);
      expect(() => calculateByWeightGrams(egg, 0)).toThrow(/greater than 0/);
      expect(() => calculateByVolumeMl(milk, -50)).toThrow(/greater than 0/);
    });
  });
});
