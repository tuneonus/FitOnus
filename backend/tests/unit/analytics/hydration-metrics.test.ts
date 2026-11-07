import { describe, it, expect } from 'vitest';
import {
  calculateHydrationAverages,
  calculateHydrationAdherence,
  buildDailyHydrationTrends,
  summarizeHydrationAnalytics,
  type RawWaterAggregateRecord,
} from '../../../src/modules/analytics/domain/hydration-metrics.js';

describe('Hydration Metrics & Calculation Engine', () => {
  describe('calculateHydrationAverages', () => {
    it('calculates average across logged days only', () => {
      const entries: RawWaterAggregateRecord[] = [
        { date: '2026-10-01', totalMl: 3000 },
        { date: '2026-10-02', totalMl: 2500 },
        { date: '2026-10-03', totalMl: 0 }, // Unlogged
      ];

      const res = calculateHydrationAverages(entries);
      // (3000 + 2500) / 2 = 2750 ml
      expect(res.avgWaterMl).toBe(2750);
      expect(res.loggedDaysCount).toBe(2);
    });

    it('returns zero safely without divide-by-zero for empty logs', () => {
      expect(calculateHydrationAverages([]).avgWaterMl).toBe(0);
      expect(calculateHydrationAverages([{ date: '2026-10-01', totalMl: 0 }]).avgWaterMl).toBe(0);
    });
  });

  describe('calculateHydrationAdherence', () => {
    it('evaluates adherence against 3000 ml target accurately', () => {
      const entries: RawWaterAggregateRecord[] = [
        { date: '2026-10-01', totalMl: 3200 }, // Met
        { date: '2026-10-02', totalMl: 3000 }, // Met
        { date: '2026-10-03', totalMl: 2200 }, // Not met
        { date: '2026-10-04', totalMl: 1500 }, // Not met
      ];

      const res = calculateHydrationAdherence(entries, 3000);
      expect(res.metGoalDays).toBe(2);
      expect(res.loggedDaysCount).toBe(4);
      expect(res.adherencePct).toBe(50);
    });
  });

  describe('buildDailyHydrationTrends', () => {
    it('maps continuous days with goalMet flag', () => {
      const entries: RawWaterAggregateRecord[] = [
        { date: '2026-10-01', totalMl: 3500 },
      ];
      const dateSeries = ['2026-10-01', '2026-10-02'];

      const points = buildDailyHydrationTrends(entries, dateSeries, 3000);
      expect(points).toHaveLength(2);

      expect(points[0]?.date).toBe('2026-10-01');
      expect(points[0]?.amountMl).toBe(3500);
      expect(points[0]?.goalMet).toBe(true);

      expect(points[1]?.date).toBe('2026-10-02');
      expect(points[1]?.amountMl).toBe(0);
      expect(points[1]?.goalMet).toBe(false);
    });
  });

  describe('summarizeHydrationAnalytics', () => {
    it('assembles hydration summary cleanly', () => {
      const entries: RawWaterAggregateRecord[] = [
        { date: '2026-10-01', totalMl: 3000 },
      ];
      const summary = summarizeHydrationAnalytics(entries, ['2026-10-01'], 3000);

      expect(summary.avgWaterMl).toBe(3000);
      expect(summary.targetWaterMl).toBe(3000);
      expect(summary.adherencePct).toBe(100);
      expect(summary.loggedDaysCount).toBe(1);
      expect(summary.points).toHaveLength(1);
    });
  });
});
