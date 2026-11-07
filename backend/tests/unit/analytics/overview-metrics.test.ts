import { describe, it, expect } from 'vitest';
import { calculateMetricComparison } from '../../../src/modules/analytics/domain/overview-metrics.js';

describe('Overview & Comparative Metrics Calculation Engine', () => {
  describe('calculateMetricComparison', () => {
    it('calculates workouts comparison correctly', () => {
      const res = calculateMetricComparison(5, 4, 'workouts');
      expect(res.label).toBe('Workouts');
      expect(res.current).toBe('5');
      expect(res.previous).toBe('4');
      expect(res.delta).toBe(1);
      expect(res.pctChange).toBe(25); // (5-4)/4 = 25%
      expect(res.better).toBe(true);

      const decreased = calculateMetricComparison(2, 4, 'workouts');
      expect(decreased.delta).toBe(-2);
      expect(decreased.pctChange).toBe(-50);
      expect(decreased.better).toBe(false);
    });

    it('calculates training volume comparison formatted in metric tonnes', () => {
      const res = calculateMetricComparison(12500, 10000, 'volume');
      expect(res.label).toBe('Volume');
      expect(res.current).toBe('12.5 t');
      expect(res.previous).toBe('10.0 t');
      expect(res.delta).toBe(2500);
      expect(res.pctChange).toBe(25);
      expect(res.better).toBe(true);
    });

    it('calculates weight comparison respecting primaryGoal', () => {
      // Weight loss goal: delta < 0 is better
      const lossBetter = calculateMetricComparison(79.2, 80.0, 'weight', {
        primaryGoal: 'lose',
      });
      expect(lossBetter.label).toBe('Weight');
      expect(lossBetter.current).toBe('79.2 kg');
      expect(lossBetter.previous).toBe('80.0 kg');
      expect(lossBetter.delta).toBe(-0.8);
      expect(lossBetter.pctChange).toBe(-1);
      expect(lossBetter.better).toBe(true);

      const lossWorse = calculateMetricComparison(81.5, 80.0, 'weight', {
        primaryGoal: 'lose',
      });
      expect(lossWorse.delta).toBe(1.5);
      expect(lossWorse.better).toBe(false);

      // Weight gain goal: delta > 0 is better
      const gainBetter = calculateMetricComparison(75.5, 74.0, 'weight', {
        primaryGoal: 'gain',
      });
      expect(gainBetter.delta).toBe(1.5);
      expect(gainBetter.better).toBe(true);

      const gainWorse = calculateMetricComparison(73.5, 74.0, 'weight', {
        primaryGoal: 'gain',
      });
      expect(gainWorse.delta).toBe(-0.5);
      expect(gainWorse.better).toBe(false);
    });

    it('calculates calorie comparison respecting primaryGoal', () => {
      // Weight loss goal: lower or equal calories is better
      const lossCal = calculateMetricComparison(2100, 2400, 'calories', {
        primaryGoal: 'lose',
      });
      expect(lossCal.label).toBe('Calories');
      expect(lossCal.current).toBe('2,100 kcal');
      expect(lossCal.previous).toBe('2,400 kcal');
      expect(lossCal.delta).toBe(-300);
      expect(lossCal.better).toBe(true);

      // Weight gain goal: higher or equal calories is better
      const gainCal = calculateMetricComparison(2800, 2500, 'calories', {
        primaryGoal: 'gain',
      });
      expect(gainCal.delta).toBe(300);
      expect(gainCal.better).toBe(true);

      // Maintain goal: delta within 150 kcal is better
      const maintainClose = calculateMetricComparison(2350, 2400, 'calories', {
        primaryGoal: 'maintain',
      });
      expect(maintainClose.delta).toBe(-50);
      expect(maintainClose.better).toBe(true);

      const maintainFar = calculateMetricComparison(2100, 2400, 'calories', {
        primaryGoal: 'maintain',
      });
      expect(maintainFar.delta).toBe(-300);
      expect(maintainFar.better).toBe(false);
    });

    it('calculates hydration and protein comparisons formatted appropriately', () => {
      const water = calculateMetricComparison(3200, 2800, 'water');
      expect(water.label).toBe('Hydration');
      expect(water.current).toBe('3,200 ml');
      expect(water.previous).toBe('2,800 ml');
      expect(water.delta).toBe(400);
      expect(water.better).toBe(true);

      const protein = calculateMetricComparison(165, 140, 'protein');
      expect(protein.label).toBe('Protein');
      expect(protein.current).toBe('165 g');
      expect(protein.previous).toBe('140 g');
      expect(protein.delta).toBe(25);
      expect(protein.better).toBe(true);
    });

    it('handles zero previous value safely without division by zero', () => {
      const res = calculateMetricComparison(5, 0, 'workouts');
      expect(res.delta).toBe(5);
      expect(res.pctChange).toBe(0);
      expect(res.better).toBe(true);
    });
  });
});
