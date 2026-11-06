import { describe, it, expect } from 'vitest';
import { calculateGoalProgress } from '../../../src/modules/goals/domain/goal-calculator.js';

describe('GoalCalculator (Deterministic Mathematical Formulas)', () => {
  describe('Decrease Goals (e.g. Weight Loss, 5K Time)', () => {
    it('calculates proportional progress when starting from 84.2kg towards 75.0kg', () => {
      // (84.2 - 78.4) / (84.2 - 75.0) = 5.8 / 9.2 = 0.6304
      const progress = calculateGoalProgress({
        start: 84.2,
        current: 78.4,
        target: 75.0,
        cadence: 'once',
        direction: 'decrease',
      });
      expect(progress).toBeCloseTo(0.6304, 3);
    });

    it('returns 1.0 when target has been achieved or surpassed (overshoot)', () => {
      const progress = calculateGoalProgress({
        start: 84.2,
        current: 74.5,
        target: 75.0,
        cadence: 'once',
        direction: 'decrease',
      });
      expect(progress).toBe(1.0);
    });

    it('clamps to 0.0 if current value regressed above starting value', () => {
      const progress = calculateGoalProgress({
        start: 84.2,
        current: 86.0,
        target: 75.0,
        cadence: 'once',
        direction: 'decrease',
      });
      expect(progress).toBe(0.0);
    });

    it('handles identical start and target without division by zero', () => {
      const progress = calculateGoalProgress({
        start: 75.0,
        current: 75.0,
        target: 75.0,
        cadence: 'once',
        direction: 'decrease',
      });
      expect(progress).toBe(1.0);
    });
  });

  describe('Increase Goals (e.g. Muscle Gain, Weight Gain)', () => {
    it('calculates proportional progress when starting from 35.2kg towards 38.0kg', () => {
      // (36.6 - 35.2) / (38.0 - 35.2) = 1.4 / 2.8 = 0.50
      const progress = calculateGoalProgress({
        start: 35.2,
        current: 36.6,
        target: 38.0,
        cadence: 'once',
        direction: 'increase',
      });
      expect(progress).toBe(0.5);
    });

    it('returns 1.0 when target has been reached or surpassed', () => {
      const progress = calculateGoalProgress({
        start: 35.2,
        current: 39.0,
        target: 38.0,
        cadence: 'once',
        direction: 'increase',
      });
      expect(progress).toBe(1.0);
    });

    it('clamps to 0.0 if current value dropped below start', () => {
      const progress = calculateGoalProgress({
        start: 35.2,
        current: 34.0,
        target: 38.0,
        cadence: 'once',
        direction: 'increase',
      });
      expect(progress).toBe(0.0);
    });
  });

  describe('Daily, Weekly, and Streak Cadences', () => {
    it('calculates daily water progress (2.4 L / 3.0 L = 80%)', () => {
      const progress = calculateGoalProgress({
        start: 0,
        current: 2.4,
        target: 3.0,
        cadence: 'daily',
      });
      expect(progress).toBe(0.8);
    });

    it('calculates daily protein progress (120 g / 150 g = 80%)', () => {
      const progress = calculateGoalProgress({
        start: 0,
        current: 120,
        target: 150,
        cadence: 'daily',
      });
      expect(progress).toBe(0.8);
    });

    it('clamps daily progress to 1.0 if daily target is exceeded', () => {
      const progress = calculateGoalProgress({
        start: 0,
        current: 180,
        target: 150,
        cadence: 'daily',
      });
      expect(progress).toBe(1.0);
    });

    it('calculates workout streak progress (4 days / 7 days target)', () => {
      const progress = calculateGoalProgress({
        start: 0,
        current: 4,
        target: 7,
        cadence: 'streak',
      });
      expect(progress).toBeCloseTo(0.5714, 3);
    });

    it('calculates weekly workout frequency progress (3 sessions / 4 sessions target)', () => {
      const progress = calculateGoalProgress({
        start: 0,
        current: 3,
        target: 4,
        cadence: 'weekly',
      });
      expect(progress).toBe(0.75);
    });
  });

  describe('Maintenance Goals (Tolerance Band)', () => {
    it('returns 1.0 when current weight is exactly target', () => {
      const progress = calculateGoalProgress({
        start: 78.0,
        current: 78.0,
        target: 78.0,
        cadence: 'once',
        direction: 'maintain',
        tolerance: 1.5,
      });
      expect(progress).toBe(1.0);
    });

    it('returns 1.0 within the +/- 1.5 kg tolerance band', () => {
      const progressLow = calculateGoalProgress({
        start: 78.0,
        current: 76.8,
        target: 78.0,
        cadence: 'once',
        direction: 'maintain',
        tolerance: 1.5,
      });
      const progressHigh = calculateGoalProgress({
        start: 78.0,
        current: 79.4,
        target: 78.0,
        cadence: 'once',
        direction: 'maintain',
        tolerance: 1.5,
      });
      expect(progressLow).toBe(1.0);
      expect(progressHigh).toBe(1.0);
    });

    it('decays proportionally when outside the tolerance band', () => {
      // diff = |81.0 - 78.0| = 3.0. tolerance = 1.5. excess = 1.5. decay = 1.5 / 5 = 0.3. Progress = 0.70
      const progress = calculateGoalProgress({
        start: 78.0,
        current: 81.0,
        target: 78.0,
        cadence: 'once',
        direction: 'maintain',
        tolerance: 1.5,
      });
      expect(progress).toBe(0.7);
    });
  });
});
