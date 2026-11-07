import { describe, it, expect } from 'vitest';
import {
  calculateScheduledDays,
  calculateHabitCompletionRate,
  calculateGoalStats,
  buildConsistencyHeatmap,
  summarizeGoalsHabitsAnalytics,
  type RawGoalRecord,
  type RawHabitRecord,
} from '../../../src/modules/analytics/domain/goals-habits-metrics.js';

describe('Goals & Habits Calculation Engine', () => {
  describe('calculateScheduledDays', () => {
    it('returns 0 when windowDays is zero or negative', () => {
      expect(calculateScheduledDays('daily', 7, 0)).toBe(0);
      expect(calculateScheduledDays('weekly', 3, -5)).toBe(0);
    });

    it('returns windowDays for daily habits', () => {
      expect(calculateScheduledDays('daily', 7, 7)).toBe(7);
      expect(calculateScheduledDays('daily', 5, 30)).toBe(30);
    });

    it('calculates scheduled days proportionally for weekly habits', () => {
      // 7 days = 1 week * 4 target = 4
      expect(calculateScheduledDays('weekly', 4, 7)).toBe(4);
      // 14 days = 2 weeks * 3 target = 6
      expect(calculateScheduledDays('weekly', 3, 14)).toBe(6);
      // 28 days = 4 weeks * 5 target = 20
      expect(calculateScheduledDays('weekly', 5, 28)).toBe(20);
    });

    it('clamps targetDaysPerWeek between 1 and 7 for weekly habits', () => {
      expect(calculateScheduledDays('weekly', 0, 7)).toBe(7); // fallback or clamp
      expect(calculateScheduledDays('weekly', 10, 7)).toBe(7);
    });
  });

  describe('calculateHabitCompletionRate', () => {
    it('returns 0 when scheduledDays or completions are zero or negative', () => {
      expect(calculateHabitCompletionRate(0, 7)).toBe(0);
      expect(calculateHabitCompletionRate(5, 0)).toBe(0);
      expect(calculateHabitCompletionRate(-1, 5)).toBe(0);
    });

    it('calculates rounded percentage', () => {
      // 5 / 7 = 71.42857% -> 71.4%
      expect(calculateHabitCompletionRate(5, 7)).toBe(71.4);
      // 3 / 6 = 50.0%
      expect(calculateHabitCompletionRate(3, 6)).toBe(50);
    });

    it('clamps to 100% when completions exceed scheduled days', () => {
      expect(calculateHabitCompletionRate(8, 7)).toBe(100);
      expect(calculateHabitCompletionRate(15, 10)).toBe(100);
    });
  });

  describe('calculateGoalStats', () => {
    it('returns zero stats for empty goals array', () => {
      const stats = calculateGoalStats([]);
      expect(stats).toEqual({
        totalGoals: 0,
        active: 0,
        completed: 0,
        completionRatePct: 0,
      });
    });

    it('calculates active and completed counts and completionRatePct correctly', () => {
      const goals: RawGoalRecord[] = [
        {
          id: 'g1',
          type: 'weight',
          title: 'Reach 80kg',
          startValue: 90,
          currentValue: 84,
          targetValue: 80,
          status: 'active',
          targetDate: '2026-12-31',
          completedAt: null,
        },
        {
          id: 'g2',
          type: 'strength',
          title: 'Bench 100kg',
          startValue: 80,
          currentValue: 100,
          targetValue: 100,
          status: 'completed',
          targetDate: '2026-10-01',
          completedAt: new Date('2026-09-28'),
        },
        {
          id: 'g3',
          type: 'habit',
          title: 'Meditation streak',
          startValue: 0,
          currentValue: 10,
          targetValue: 30,
          status: 'abandoned',
          targetDate: null,
          completedAt: null,
        },
        {
          id: 'g4',
          type: 'nutrition',
          title: 'Eat 180g protein',
          startValue: 0,
          currentValue: 1,
          targetValue: 1,
          status: 'active',
          targetDate: null,
          completedAt: null,
        },
      ];

      const stats = calculateGoalStats(goals);
      expect(stats.totalGoals).toBe(4);
      expect(stats.active).toBe(2);
      expect(stats.completed).toBe(1);
      // 1 / 4 = 25%
      expect(stats.completionRatePct).toBe(25);
    });
  });

  describe('buildConsistencyHeatmap', () => {
    it('returns 0 counts when no completions exist', () => {
      const habits: RawHabitRecord[] = [
        {
          id: 'h1',
          title: 'Morning Walk',
          category: 'fitness',
          frequency: 'daily',
          targetDaysPerWeek: 7,
          currentStreak: 0,
          longestStreak: 0,
          totalCompletions: 0,
          completionDates: [],
        },
      ];
      const dateSeries = ['2026-10-01', '2026-10-02', '2026-10-03'];
      const heatmap = buildConsistencyHeatmap(habits, dateSeries);

      expect(heatmap).toEqual([
        { date: '2026-10-01', count: 0 },
        { date: '2026-10-02', count: 0 },
        { date: '2026-10-03', count: 0 },
      ]);
    });

    it('aggregates completions across multiple habits', () => {
      const habits: RawHabitRecord[] = [
        {
          id: 'h1',
          title: 'Morning Walk',
          category: 'fitness',
          frequency: 'daily',
          targetDaysPerWeek: 7,
          currentStreak: 2,
          longestStreak: 5,
          totalCompletions: 2,
          completionDates: ['2026-10-01', '2026-10-02'],
        },
        {
          id: 'h2',
          title: 'Read 20 mins',
          category: 'mindfulness',
          frequency: 'daily',
          targetDaysPerWeek: 7,
          currentStreak: 1,
          longestStreak: 3,
          totalCompletions: 2,
          completionDates: ['2026-10-02', '2026-10-03'],
        },
      ];
      const dateSeries = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
      const heatmap = buildConsistencyHeatmap(habits, dateSeries);

      expect(heatmap).toEqual([
        { date: '2026-10-01', count: 1 },
        { date: '2026-10-02', count: 2 },
        { date: '2026-10-03', count: 1 },
        { date: '2026-10-04', count: 0 },
      ]);
    });
  });

  describe('summarizeGoalsHabitsAnalytics', () => {
    it('summarizes empty dataset cleanly', () => {
      const summary = summarizeGoalsHabitsAnalytics([], [], ['2026-10-01', '2026-10-02']);
      expect(summary.goalStats.totalGoals).toBe(0);
      expect(summary.habitsSummary).toHaveLength(0);
      expect(summary.overallHabitAdherencePct).toBe(0);
      expect(summary.consistencyHeatmap).toHaveLength(2);
    });

    it('computes per-habit metrics and overall adherence percentage', () => {
      const dateSeries = [
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
        '2026-10-04',
        '2026-10-05',
        '2026-10-06',
        '2026-10-07',
      ]; // 7 days window

      const habits: RawHabitRecord[] = [
        {
          id: 'h1',
          title: 'Workout',
          category: 'fitness',
          frequency: 'weekly',
          targetDaysPerWeek: 4, // 4 scheduled days in 7-day window
          currentStreak: 3,
          longestStreak: 10,
          totalCompletions: 15,
          completionDates: [
            '2026-09-25', // outside window
            '2026-10-01',
            '2026-10-03',
            '2026-10-05', // 3 completions in window
          ],
        },
        {
          id: 'h2',
          title: 'Drink 3L Water',
          category: 'nutrition',
          frequency: 'daily', // 7 scheduled days in 7-day window
          targetDaysPerWeek: 7,
          currentStreak: 5,
          longestStreak: 12,
          totalCompletions: 20,
          completionDates: [
            '2026-10-01',
            '2026-10-02',
            '2026-10-03',
            '2026-10-04',
            '2026-10-05',
            '2026-10-06',
            '2026-10-07', // 7 completions in window
          ],
        },
      ];

      const goals: RawGoalRecord[] = [
        {
          id: 'g1',
          type: 'weight',
          title: 'Weight Target',
          startValue: 85,
          currentValue: 80,
          targetValue: 80,
          status: 'completed',
          targetDate: null,
          completedAt: new Date(),
        },
      ];

      const summary = summarizeGoalsHabitsAnalytics(goals, habits, dateSeries);

      expect(summary.goalStats.totalGoals).toBe(1);
      expect(summary.goalStats.completed).toBe(1);
      expect(summary.goalStats.completionRatePct).toBe(100);

      expect(summary.habitsSummary).toHaveLength(2);

      // Habit 1: 3 completed out of 4 scheduled = 75%
      const h1Summary = summary.habitsSummary.find((h) => h.habitId === 'h1')!;
      expect(h1Summary.completionsInWindow).toBe(3);
      expect(h1Summary.completionRatePct).toBe(75);
      expect(h1Summary.currentStreak).toBe(3);

      // Habit 2: 7 completed out of 7 scheduled = 100%
      const h2Summary = summary.habitsSummary.find((h) => h.habitId === 'h2')!;
      expect(h2Summary.completionsInWindow).toBe(7);
      expect(h2Summary.completionRatePct).toBe(100);

      // Overall: (3 + 7) / (4 + 7) = 10 / 11 = 90.909% -> 90.9%
      expect(summary.overallHabitAdherencePct).toBe(90.9);
      expect(summary.consistencyHeatmap).toHaveLength(7);
      expect(summary.consistencyHeatmap[0]).toEqual({ date: '2026-10-01', count: 2 });
    });
  });
});
