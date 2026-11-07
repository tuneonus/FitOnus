import { describe, it, expect } from 'vitest';
import {
  calculateEmaSeries,
  calculateWeightVelocity,
  calculateGoalWeightProgress,
  buildMeasurementTrends,
  summarizeBodyAnalytics,
  type RawWeightLogRecord,
  type RawMeasurementRecord,
} from '../../../src/modules/analytics/domain/body-analytics-metrics.js';

describe('Body Analytics Metrics & Calculation Engine', () => {
  describe('calculateEmaSeries', () => {
    it('filters raw fluctuations and smooths weight trajectory accurately', () => {
      const logs: RawWeightLogRecord[] = [
        { id: '1', weightKg: 80.0, loggedAt: new Date('2026-10-01T08:00:00Z') },
        { id: '2', weightKg: 81.0, loggedAt: new Date('2026-10-02T08:00:00Z') },
        { id: '3', weightKg: 79.5, loggedAt: new Date('2026-10-03T08:00:00Z') },
      ];

      const emaSeries = calculateEmaSeries(logs, 0.1, 1);
      expect(emaSeries).toHaveLength(3);

      // Day 1: EMA_0 = 80.0
      expect(emaSeries[0]?.ema).toBe(80.0);
      expect(emaSeries[0]?.raw).toBe(80.0);

      // Day 2: 81.0 * 0.1 + 80.0 * 0.9 = 8.1 + 72.0 = 80.1
      expect(emaSeries[1]?.ema).toBe(80.1);
      expect(emaSeries[1]?.raw).toBe(81.0);

      // Day 3: 79.5 * 0.1 + 80.1 * 0.9 = 7.95 + 72.09 = 80.04 -> 80.0
      expect(emaSeries[2]?.ema).toBe(80.0);
      expect(emaSeries[2]?.raw).toBe(79.5);
    });

    it('returns empty array when logs array is empty', () => {
      expect(calculateEmaSeries([])).toEqual([]);
    });
  });

  describe('calculateWeightVelocity', () => {
    it('calculates weekly rate of change in kg/week accurately', () => {
      const first = { weightKg: 80.0, loggedAt: new Date('2026-10-01T08:00:00Z') };
      // 14 days later, weight dropped 1.0 kg -> -0.50 kg/week
      const last = { weightKg: 79.0, loggedAt: new Date('2026-10-15T08:00:00Z') };

      const velocity = calculateWeightVelocity(first, last);
      expect(velocity).toBe(-0.5);
    });

    it('calculates positive rate of change for weight gain', () => {
      const first = { weightKg: 70.0, loggedAt: new Date('2026-10-01T08:00:00Z') };
      // 7 days later, gained 0.7 kg -> +0.70 kg/week
      const last = { weightKg: 70.7, loggedAt: new Date('2026-10-08T08:00:00Z') };

      const velocity = calculateWeightVelocity(first, last);
      expect(velocity).toBe(0.7);
    });

    it('returns 0 when elapsed time is less than 1 day to prevent division spikes', () => {
      const first = { weightKg: 80.0, loggedAt: new Date('2026-10-01T08:00:00Z') };
      const last = { weightKg: 79.8, loggedAt: new Date('2026-10-01T12:00:00Z') }; // 4 hours later

      expect(calculateWeightVelocity(first, last)).toBe(0);
      expect(calculateWeightVelocity(first, null)).toBe(0);
    });
  });

  describe('calculateGoalWeightProgress', () => {
    it('calculates percentage for weight loss goals', () => {
      // Start 80 kg, Current 76 kg, Target 72 kg -> Lost 4 kg out of 8 kg = 50%
      expect(calculateGoalWeightProgress(80, 76, 72)).toBe(50);
      // Start 80 kg, Current 72 kg, Target 72 kg -> 100%
      expect(calculateGoalWeightProgress(80, 72, 72)).toBe(100);
      // Beyond target: Start 80 kg, Current 70 kg, Target 72 kg -> clamped to 100%
      expect(calculateGoalWeightProgress(80, 70, 72)).toBe(100);
      // Weight went up: Start 80 kg, Current 82 kg, Target 72 kg -> clamped to 0%
      expect(calculateGoalWeightProgress(80, 82, 72)).toBe(0);
    });

    it('calculates percentage for weight gain goals', () => {
      // Start 70 kg, Current 75 kg, Target 80 kg -> Gained 5 kg out of 10 kg = 50%
      expect(calculateGoalWeightProgress(70, 75, 80)).toBe(50);
      // Start 70 kg, Current 80 kg, Target 80 kg -> 100%
      expect(calculateGoalWeightProgress(70, 80, 80)).toBe(100);
    });

    it('safely handles missing baseline or target', () => {
      expect(calculateGoalWeightProgress(null, 75, 80)).toBe(0);
      expect(calculateGoalWeightProgress(70, null, 80)).toBe(0);
      expect(calculateGoalWeightProgress(70, 75, null)).toBe(0);
    });
  });

  describe('buildMeasurementTrends', () => {
    it('groups circumference and composition measurements by metric', () => {
      const measurements: RawMeasurementRecord[] = [
        {
          id: 'm-1',
          loggedAt: new Date('2026-09-01T08:00:00Z'),
          waistCm: 85.5,
          chestCm: 100,
          hipCm: null,
          armCm: 36,
          neckCm: null,
          bodyFatPct: 18.5,
          muscleMassKg: 62.0,
        },
        {
          id: 'm-2',
          loggedAt: new Date('2026-10-01T08:00:00Z'),
          waistCm: 83.0,
          chestCm: 101,
          hipCm: null,
          armCm: 37,
          neckCm: null,
          bodyFatPct: 16.8,
          muscleMassKg: 63.5,
        },
      ];

      const trends = buildMeasurementTrends(measurements);
      expect(trends.waistCm).toHaveLength(2);
      expect(trends.waistCm?.[0]?.value).toBe(85.5);
      expect(trends.waistCm?.[1]?.value).toBe(83.0);

      expect(trends.bodyFatPct).toHaveLength(2);
      expect(trends.bodyFatPct?.[1]?.value).toBe(16.8);

      expect(trends.hipCm).toBeUndefined(); // null measurements omitted
    });

    it('returns empty object when measurements array is empty', () => {
      expect(buildMeasurementTrends([])).toEqual({});
    });
  });

  describe('summarizeBodyAnalytics', () => {
    it('assembles body summary accurately', () => {
      const logs: RawWeightLogRecord[] = [
        { id: '1', weightKg: 82.0, loggedAt: new Date('2026-09-01T08:00:00Z') },
        { id: '2', weightKg: 78.4, loggedAt: new Date('2026-10-01T08:00:00Z') },
      ];

      const summary = summarizeBodyAnalytics(logs, [], 82.0, 78.4, 75.0);
      expect(summary.startingWeightKg).toBe(82.0);
      expect(summary.currentWeightKg).toBe(78.4);
      expect(summary.targetWeightKg).toBe(75.0);
      expect(summary.weeklyVelocityKg).toBeLessThan(0);
      expect(summary.goalProgressPct).toBeGreaterThan(0);
      expect(summary.weightTrend).toHaveLength(2);
    });
  });
});
