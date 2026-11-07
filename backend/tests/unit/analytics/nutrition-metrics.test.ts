import { describe, it, expect } from 'vitest';
import {
  calculateNutritionAverages,
  calculateMacroSplit,
  calculateCalorieAdherence,
  calculateProteinAdherence,
  buildDailyNutritionTrends,
  summarizeNutritionAnalytics,
  type RawMealAggregateRecord,
} from '../../../src/modules/analytics/domain/nutrition-metrics.js';

describe('Nutrition Metrics & Calculation Engine', () => {
  describe('calculateNutritionAverages', () => {
    it('strictly excludes unlogged days from averaging denominator (DATA INTEGRITY)', () => {
      // 3 logged days out of 7 total entries
      const entries: RawMealAggregateRecord[] = [
        {
          date: '2026-10-01',
          totalCalories: 2100,
          totalProteinG: 160,
          totalCarbsG: 220,
          totalFatG: 65,
          totalFiberG: 28,
          mealCount: 3,
        },
        {
          date: '2026-10-02',
          totalCalories: 1900,
          totalProteinG: 150,
          totalCarbsG: 200,
          totalFatG: 60,
          totalFiberG: 25,
          mealCount: 3,
        },
        {
          date: '2026-10-03',
          totalCalories: 0,
          totalProteinG: 0,
          totalCarbsG: 0,
          totalFatG: 0,
          totalFiberG: 0,
          mealCount: 0, // UNLOGGED DAY! Must NOT be counted in denominator!
        },
        {
          date: '2026-10-04',
          totalCalories: 2000,
          totalProteinG: 170,
          totalCarbsG: 210,
          totalFatG: 55,
          totalFiberG: 30,
          mealCount: 4,
        },
      ];

      const res = calculateNutritionAverages(entries);

      // (2100 + 1900 + 2000) / 3 = 6000 / 3 = 2000 kcal
      expect(res.avgCalories).toBe(2000);
      // (160 + 150 + 170) / 3 = 480 / 3 = 160 g
      expect(res.avgProtein).toBe(160);
      // (220 + 200 + 210) / 3 = 630 / 3 = 210 g
      expect(res.avgCarbs).toBe(210);
      // (65 + 60 + 55) / 3 = 180 / 3 = 60 g
      expect(res.avgFat).toBe(60);
      expect(res.loggedDaysCount).toBe(3);
    });

    it('returns zero for all metrics without NaN when dataset is empty or all unlogged', () => {
      const emptyRes = calculateNutritionAverages([]);
      expect(emptyRes.avgCalories).toBe(0);
      expect(emptyRes.avgProtein).toBe(0);
      expect(emptyRes.avgCarbs).toBe(0);
      expect(emptyRes.avgFat).toBe(0);
      expect(emptyRes.loggedDaysCount).toBe(0);
    });
  });

  describe('calculateMacroSplit', () => {
    it('calculates energy contribution and normalizes percentages to exactly 100%', () => {
      // 150g protein (600 kcal), 200g carbs (800 kcal), 60g fat (540 kcal)
      // Total kcal = 600 + 800 + 540 = 1940 kcal
      // Protein: 600/1940 = 30.9% -> 31%
      // Carbs: 800/1940 = 41.2% -> 41%
      // Fat: 100 - 31 - 41 = 28%
      const split = calculateMacroSplit(150, 200, 60);

      const protein = split.find((m) => m.label === 'Protein')!;
      const carbs = split.find((m) => m.label === 'Carbs')!;
      const fat = split.find((m) => m.label === 'Fat')!;

      expect(protein.grams).toBe(150);
      expect(carbs.grams).toBe(200);
      expect(fat.grams).toBe(60);

      expect(protein.pct + carbs.pct + fat.pct).toBe(100);
      expect(protein.pct).toBe(31);
      expect(carbs.pct).toBe(41);
      expect(fat.pct).toBe(28);
    });

    it('returns 0% for all macros when total is 0', () => {
      const split = calculateMacroSplit(0, 0, 0);
      expect(split.every((m) => m.pct === 0 && m.grams === 0)).toBe(true);
    });
  });

  describe('calculateCalorieAdherence', () => {
    it('evaluates adherence within +/- 10% tolerance band', () => {
      const target = 2000; // Acceptable: 1800 to 2200 kcal
      const entries: RawMealAggregateRecord[] = [
        { date: '2026-10-01', totalCalories: 1950, totalProteinG: 150, totalCarbsG: 200, totalFatG: 60, totalFiberG: 20, mealCount: 3 }, // On target
        { date: '2026-10-02', totalCalories: 2180, totalProteinG: 150, totalCarbsG: 200, totalFatG: 60, totalFiberG: 20, mealCount: 3 }, // On target
        { date: '2026-10-03', totalCalories: 2400, totalProteinG: 150, totalCarbsG: 200, totalFatG: 60, totalFiberG: 20, mealCount: 3 }, // Off target (over)
        { date: '2026-10-04', totalCalories: 1600, totalProteinG: 150, totalCarbsG: 200, totalFatG: 60, totalFiberG: 20, mealCount: 3 }, // Off target (under)
      ];

      const res = calculateCalorieAdherence(entries, target, 0.1);
      expect(res.onTargetDays).toBe(2);
      expect(res.loggedDaysCount).toBe(4);
      expect(res.adherencePct).toBe(50);
    });

    it('returns 0% adherence if target is null or <= 0', () => {
      const entries: RawMealAggregateRecord[] = [
        { date: '2026-10-01', totalCalories: 2000, totalProteinG: 150, totalCarbsG: 200, totalFatG: 60, totalFiberG: 20, mealCount: 3 },
      ];
      expect(calculateCalorieAdherence(entries, null).adherencePct).toBe(0);
      expect(calculateCalorieAdherence(entries, 0).adherencePct).toBe(0);
    });
  });

  describe('calculateProteinAdherence', () => {
    it('evaluates adherence for days meeting at least 90% of protein goal', () => {
      const target = 160; // Acceptable: >= 144 g
      const entries: RawMealAggregateRecord[] = [
        { date: '2026-10-01', totalCalories: 2000, totalProteinG: 162, totalCarbsG: 200, totalFatG: 60, totalFiberG: 20, mealCount: 3 }, // >= 144 (Met)
        { date: '2026-10-02', totalCalories: 2000, totalProteinG: 145, totalCarbsG: 200, totalFatG: 60, totalFiberG: 20, mealCount: 3 }, // >= 144 (Met)
        { date: '2026-10-03', totalCalories: 2000, totalProteinG: 130, totalCarbsG: 200, totalFatG: 60, totalFiberG: 20, mealCount: 3 }, // < 144 (Missed)
      ];

      const res = calculateProteinAdherence(entries, target, 0.9);
      expect(res.metTargetDays).toBe(2);
      expect(res.loggedDaysCount).toBe(3);
      expect(res.adherencePct).toBe(67);
    });
  });

  describe('buildDailyNutritionTrends', () => {
    it('maps continuous days marking missing dates as unlogged with zero values', () => {
      const entries: RawMealAggregateRecord[] = [
        { date: '2026-10-01', totalCalories: 2050, totalProteinG: 155, totalCarbsG: 210, totalFatG: 65, totalFiberG: 25, mealCount: 3 },
      ];
      const dateSeries = ['2026-10-01', '2026-10-02'];

      const trends = buildDailyNutritionTrends(entries, dateSeries);
      expect(trends).toHaveLength(2);

      expect(trends[0]?.date).toBe('2026-10-01');
      expect(trends[0]?.logged).toBe(true);
      expect(trends[0]?.calories).toBe(2050);

      expect(trends[1]?.date).toBe('2026-10-02');
      expect(trends[1]?.logged).toBe(false);
      expect(trends[1]?.calories).toBe(0);
      expect(trends[1]?.protein).toBe(0);
    });
  });

  describe('summarizeNutritionAnalytics', () => {
    it('assembles complete nutrition summary accurately', () => {
      const entries: RawMealAggregateRecord[] = [
        { date: '2026-10-01', totalCalories: 2000, totalProteinG: 160, totalCarbsG: 220, totalFatG: 60, totalFiberG: 25, mealCount: 3 },
      ];
      const summary = summarizeNutritionAnalytics(entries, ['2026-10-01'], 2000, 160);

      expect(summary.avgCalories).toBe(2000);
      expect(summary.targetCalories).toBe(2000);
      expect(summary.calorieAdherencePct).toBe(100);
      expect(summary.proteinAdherencePct).toBe(100);
      expect(summary.macroSplit).toHaveLength(3);
      expect(summary.dailyTrends).toHaveLength(1);
    });
  });
});
