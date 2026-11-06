import { describe, expect, it } from 'vitest';
import { calculateLevel } from '../../../src/modules/challenges/domain/level-calculator.js';

describe('Level Calculator (Deterministic V1 Thresholds)', () => {
  it('handles negative, zero, and invalid points safely', () => {
    const negative = calculateLevel(-50);
    expect(negative.level).toBe(1);
    expect(negative.totalPoints).toBe(0);
    expect(negative.pointsToNextLevel).toBe(100);
    expect(negative.levelProgressRatio).toBe(0);

    const zero = calculateLevel(0);
    expect(zero.level).toBe(1);
    expect(zero.totalPoints).toBe(0);
    expect(zero.pointsToNextLevel).toBe(100);
    expect(zero.levelProgressRatio).toBe(0);

    const nanVal = calculateLevel(NaN);
    expect(nanVal.level).toBe(1);
    expect(nanVal.totalPoints).toBe(0);

    const infVal = calculateLevel(Infinity);
    expect(infVal.level).toBe(1);
    expect(infVal.totalPoints).toBe(0);
  });

  it('floors floating-point values to integer points', () => {
    const res = calculateLevel(99.9);
    expect(res.level).toBe(1);
    expect(res.totalPoints).toBe(99);
    expect(res.pointsToNextLevel).toBe(1);
  });

  describe('Level 1: 0–99 points', () => {
    it('calculates boundaries for Level 1', () => {
      const at0 = calculateLevel(0);
      expect(at0.level).toBe(1);
      expect(at0.currentLevelMinPoints).toBe(0);
      expect(at0.nextLevelMinPoints).toBe(100);
      expect(at0.pointsToNextLevel).toBe(100);
      expect(at0.levelProgressRatio).toBe(0);
      expect(at0.title).toBe('Novice');

      const at50 = calculateLevel(50);
      expect(at50.level).toBe(1);
      expect(at50.pointsToNextLevel).toBe(50);
      expect(at50.levelProgressRatio).toBe(0.5);

      const at99 = calculateLevel(99);
      expect(at99.level).toBe(1);
      expect(at99.pointsToNextLevel).toBe(1);
      expect(at99.levelProgressRatio).toBe(0.99);
    });
  });

  describe('Level 2: 100–249 points', () => {
    it('calculates boundaries for Level 2', () => {
      const at100 = calculateLevel(100);
      expect(at100.level).toBe(2);
      expect(at100.currentLevelMinPoints).toBe(100);
      expect(at100.nextLevelMinPoints).toBe(250);
      expect(at100.pointsToNextLevel).toBe(150);
      expect(at100.levelProgressRatio).toBe(0);
      expect(at100.title).toBe('Beginner');

      const at175 = calculateLevel(175);
      expect(at175.level).toBe(2);
      expect(at175.pointsToNextLevel).toBe(75);
      expect(at175.levelProgressRatio).toBe(0.5);

      const at249 = calculateLevel(249);
      expect(at249.level).toBe(2);
      expect(at249.pointsToNextLevel).toBe(1);
      expect(at249.levelProgressRatio).toBeCloseTo(149 / 150, 4);
    });
  });

  describe('Level 3: 250–499 points', () => {
    it('calculates boundaries for Level 3', () => {
      const at250 = calculateLevel(250);
      expect(at250.level).toBe(3);
      expect(at250.currentLevelMinPoints).toBe(250);
      expect(at250.nextLevelMinPoints).toBe(500);
      expect(at250.pointsToNextLevel).toBe(250);
      expect(at250.levelProgressRatio).toBe(0);
      expect(at250.title).toBe('Consistent');

      const at499 = calculateLevel(499);
      expect(at499.level).toBe(3);
      expect(at499.pointsToNextLevel).toBe(1);
      expect(at499.levelProgressRatio).toBeCloseTo(249 / 250, 4);
    });
  });

  describe('Level 4: 500–999 points', () => {
    it('calculates boundaries for Level 4', () => {
      const at500 = calculateLevel(500);
      expect(at500.level).toBe(4);
      expect(at500.currentLevelMinPoints).toBe(500);
      expect(at500.nextLevelMinPoints).toBe(1000);
      expect(at500.pointsToNextLevel).toBe(500);
      expect(at500.levelProgressRatio).toBe(0);
      expect(at500.title).toBe('Dedicated');

      const at999 = calculateLevel(999);
      expect(at999.level).toBe(4);
      expect(at999.pointsToNextLevel).toBe(1);
      expect(at999.levelProgressRatio).toBeCloseTo(499 / 500, 4);
    });
  });

  describe('Level 5: 1000–1999 points', () => {
    it('calculates boundaries for Level 5', () => {
      const at1000 = calculateLevel(1000);
      expect(at1000.level).toBe(5);
      expect(at1000.currentLevelMinPoints).toBe(1000);
      expect(at1000.nextLevelMinPoints).toBe(2000);
      expect(at1000.pointsToNextLevel).toBe(1000);
      expect(at1000.levelProgressRatio).toBe(0);
      expect(at1000.title).toBe('Athlete');

      const at1999 = calculateLevel(1999);
      expect(at1999.level).toBe(5);
      expect(at1999.pointsToNextLevel).toBe(1);
      expect(at1999.levelProgressRatio).toBeCloseTo(999 / 1000, 4);
    });
  });

  describe('Level 6 and above (Monotonic +1000 pt span per level)', () => {
    it('calculates boundaries for Level 6 (2000–2999)', () => {
      const at2000 = calculateLevel(2000);
      expect(at2000.level).toBe(6);
      expect(at2000.currentLevelMinPoints).toBe(2000);
      expect(at2000.nextLevelMinPoints).toBe(3000);
      expect(at2000.pointsToNextLevel).toBe(1000);
      expect(at2000.levelProgressRatio).toBe(0);
      expect(at2000.title).toBe('Veteran');

      const at2999 = calculateLevel(2999);
      expect(at2999.level).toBe(6);
      expect(at2999.pointsToNextLevel).toBe(1);
      expect(at2999.levelProgressRatio).toBeCloseTo(999 / 1000, 4);
    });

    it('calculates boundaries for Level 7 (3000–3999)', () => {
      const at3000 = calculateLevel(3000);
      expect(at3000.level).toBe(7);
      expect(at3000.currentLevelMinPoints).toBe(3000);
      expect(at3000.nextLevelMinPoints).toBe(4000);
      expect(at3000.pointsToNextLevel).toBe(1000);
      expect(at3000.levelProgressRatio).toBe(0);
      expect(at3000.title).toBe('Champion');
    });

    it('scales monotonically to high levels', () => {
      // Level 8: 4000–4999 (Master)
      const at4500 = calculateLevel(4500);
      expect(at4500.level).toBe(8);
      expect(at4500.currentLevelMinPoints).toBe(4000);
      expect(at4500.nextLevelMinPoints).toBe(5000);
      expect(at4500.levelProgressRatio).toBe(0.5);
      expect(at4500.title).toBe('Master');

      // Level 14: 10000–10999 (Elite)
      const at10000 = calculateLevel(10000);
      expect(at10000.level).toBe(14);
      expect(at10000.currentLevelMinPoints).toBe(10000);
      expect(at10000.nextLevelMinPoints).toBe(11000);
      expect(at10000.title).toBe('Elite');
    });
  });
});

