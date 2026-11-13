import { badRequest, notFound } from '../errors.js';
import {
  calculateDailyStreak,
  calculateWeeklyStreak,
  type StreakResult,
} from '../../domain/streak-calculator.js';
import { assertCalendarDate } from '../../domain/goal-limits.js';
import { systemClock, todayInTimeZone, type Clock } from '../../domain/local-date.js';
import type { IHabitRepository } from '../ports.js';
import { HABIT_HISTORY_SCAN_LIMIT } from '../habit-history.js';

export interface CalculateHabitStreaksInput {
  habitId: string;
  userId: string;
  /** Explicit calendar date (YYYY-MM-DD) to evaluate the streak as of. Defaults to today in `timezone`. */
  referenceDate?: string;
  /** IANA timezone of the user (UTC when missing/invalid). */
  timezone?: string;
}

export class CalculateHabitStreaksUseCase {
  constructor(
    private readonly habitRepo: IHabitRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(input: CalculateHabitStreaksInput): Promise<StreakResult> {
    if (!input.habitId) throw badRequest('Habit ID is required');
    if (!input.userId) throw badRequest('User ID is required');
    assertCalendarDate('referenceDate', input.referenceDate);

    const habit = await this.habitRepo.findById(input.habitId, input.userId);
    if (!habit) {
      throw notFound('Habit not found');
    }

    const refDate = input.referenceDate ?? todayInTimeZone(this.clock, input.timezone);
    const completionDates = await this.habitRepo.getCompletionDates(
      habit.id,
      input.userId,
      HABIT_HISTORY_SCAN_LIMIT,
    );

    const streaks =
      habit.frequency === 'weekly'
        ? calculateWeeklyStreak(completionDates, habit.targetDaysPerWeek, refDate)
        : calculateDailyStreak(completionDates, refDate);

    return streaks;
  }
}
