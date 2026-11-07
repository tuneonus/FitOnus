import { describe, it, expect } from 'vitest';
import {
  calculateDailyStreak,
  calculateWeeklyStreak,
} from '../../../src/modules/goals/domain/streak-calculator.js';

describe('StreakCalculator (Habit & Activity Streaks)', () => {
  describe('Daily Streak Calculations', () => {
    const today = '2026-11-06';

    it('returns zero streaks when completions list is empty', () => {
      const result = calculateDailyStreak([], today);
      expect(result).toEqual({ currentStreak: 0, longestStreak: 0, totalCompletions: 0 });
    });

    it('computes current streak when today is completed and consecutive', () => {
      const dates = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
      const result = calculateDailyStreak(dates, today);
      expect(result.currentStreak).toBe(4);
      expect(result.longestStreak).toBe(4);
      expect(result.totalCompletions).toBe(4);
    });

    it('preserves streak as active when today is pending but yesterday was completed', () => {
      // User has not logged today (Nov 6), but completed Nov 3, 4, 5
      const dates = ['2026-11-03', '2026-11-04', '2026-11-05'];
      const result = calculateDailyStreak(dates, today);
      expect(result.currentStreak).toBe(3);
      expect(result.longestStreak).toBe(3);
      expect(result.totalCompletions).toBe(3);
    });

    it('resets current streak to 0 if a full calendar day was missed', () => {
      // Missed yesterday (Nov 5) and today (Nov 6). Last completed was Nov 4
      const dates = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'];
      const result = calculateDailyStreak(dates, today);
      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(4);
      expect(result.totalCompletions).toBe(4);
    });

    it('accurately identifies longest historical streak with gaps', () => {
      const dates = [
        // Run of 5 days
        '2026-10-10',
        '2026-10-11',
        '2026-10-12',
        '2026-10-13',
        '2026-10-14',
        // Gap of 3 days
        // Run of 2 days
        '2026-10-18',
        '2026-10-19',
        // Gap of 10 days
        // Current run of 3 days
        '2026-11-04',
        '2026-11-05',
        '2026-11-06',
      ];
      const result = calculateDailyStreak(dates, today);
      expect(result.currentStreak).toBe(3);
      expect(result.longestStreak).toBe(5);
      expect(result.totalCompletions).toBe(10);
    });

    it('handles duplicate completion dates gracefully without inflating streak', () => {
      const dates = ['2026-11-05', '2026-11-05', '2026-11-06', '2026-11-06'];
      const result = calculateDailyStreak(dates, today);
      expect(result.currentStreak).toBe(2);
      expect(result.longestStreak).toBe(2);
      expect(result.totalCompletions).toBe(2);
    });
  });

  describe('Weekly Streak Calculations', () => {
    // 2026-11-06 is Friday in 2026-W45
    const today = '2026-11-06';

    it('computes weekly streak when target days per week are satisfied', () => {
      // Target: 3 days/week
      // W44 (Oct 26 - Nov 01): 3 days hit (Oct 27, 28, 30)
      // W45 (Nov 02 - Nov 08): 3 days hit (Nov 02, 04, 06)
      const dates = ['2026-10-27', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-04', '2026-11-06'];
      const result = calculateWeeklyStreak(dates, 3, today);
      expect(result.currentStreak).toBe(2);
      expect(result.longestStreak).toBe(2);
      expect(result.totalCompletions).toBe(6);
    });

    it('preserves weekly streak if current week is in progress and previous week qualified', () => {
      // Target: 4 days/week
      // W44: 4 days hit (qualified)
      // W45: 2 days hit so far (still in progress)
      const dates = ['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-31', '2026-11-03', '2026-11-05'];
      const result = calculateWeeklyStreak(dates, 4, today);
      expect(result.currentStreak).toBe(1);
    });

    it('resets weekly streak if previous week failed to qualify', () => {
      // W43: 4 days (qualified)
      // W44: 1 day (failed target of 3)
      // W45: 1 day so far
      const dates = ['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-24', '2026-10-28', '2026-11-04'];
      const result = calculateWeeklyStreak(dates, 3, today);
      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(1);
    });
  });
});
