import { badRequest, notFound } from '../errors.js';
import {
  calculateDailyStreak,
  calculateWeeklyStreak,
  type StreakResult,
} from '../../domain/streak-calculator.js';
import { assertCalendarDate } from '../../domain/goal-limits.js';
import { startOfIsoWeek, systemClock, todayInTimeZone, type Clock } from '../../domain/local-date.js';
import type { IHabitRepository, SetHabitCompletionInput } from '../ports.js';
import { HABIT_HISTORY_SCAN_LIMIT } from '../habit-history.js';
import { toHabitView, type HabitView } from '../goals-view.js';

export type { SetHabitCompletionInput };

export interface SetHabitCompletionRequest extends SetHabitCompletionInput {
  /** IANA timezone of the user; decides what "today" is for `isCompletedToday` (UTC when missing/invalid). */
  timezone?: string;
}

export interface SetHabitCompletionResult {
  habit: HabitView;
  date: string;
  completed: boolean;
  streaks: StreakResult;
}

export class SetHabitCompletionUseCase {
  constructor(
    private readonly habitRepo: IHabitRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(input: SetHabitCompletionRequest): Promise<SetHabitCompletionResult> {
    if (!input.habitId) throw badRequest('Habit ID is required');
    if (!input.userId) throw badRequest('User ID is required');
    if (typeof input.completed !== 'boolean') {
      throw badRequest('Completed state must be a boolean (explicit true or false)');
    }
    if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      throw badRequest('Date must be formatted as YYYY-MM-DD');
    }
    assertCalendarDate('date', input.date);

    const habit = await this.habitRepo.findById(input.habitId, input.userId);
    if (!habit) {
      throw notFound('Habit not found');
    }

    // Set completion idempotently
    await this.habitRepo.setCompletion({
      id: input.id,
      habitId: input.habitId,
      userId: input.userId,
      date: input.date,
      completed: input.completed,
      notes: input.notes,
    });

    // Recompute deterministic streaks based on full completion history
    const allDates = await this.habitRepo.getCompletionDates(
      habit.id,
      input.userId,
      HABIT_HISTORY_SCAN_LIMIT,
    );
    const streaks =
      habit.frequency === 'weekly'
        ? calculateWeeklyStreak(allDates, habit.targetDaysPerWeek, input.date)
        : calculateDailyStreak(allDates, input.date);

    await this.habitRepo.updateStreaks(habit.id, input.userId, streaks);
    habit.updateStreaks(streaks.currentStreak, streaks.longestStreak, streaks.totalCompletions);

    // Weekly progress for the Monday..Sunday week that contains the toggled calendar day
    const startOfWeekStr = startOfIsoWeek(input.date);
    const weeklyCompletedDays = allDates.filter((d) => d >= startOfWeekStr && d <= input.date).length;

    // "Today" is the user's local calendar day, not the UTC day.
    const todayStr = todayInTimeZone(this.clock, input.timezone);
    const isCompletedToday = allDates.includes(todayStr);

    return {
      habit: toHabitView(habit, { isCompletedToday, weeklyCompletedDays }),
      date: input.date,
      completed: input.completed,
      streaks,
    };
  }
}
