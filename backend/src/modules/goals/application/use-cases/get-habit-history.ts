import { badRequest, notFound } from '../errors.js';
import { calculateDailyStreak, calculateWeeklyStreak } from '../../domain/streak-calculator.js';
import { systemClock, todayInTimeZone, type Clock } from '../../domain/local-date.js';
import type { IHabitRepository } from '../ports.js';
import { HABIT_HISTORY_SCAN_LIMIT } from '../habit-history.js';
import { toHabitView, type HabitHistoryView } from '../goals-view.js';

export interface GetHabitHistoryInput {
  habitId: string;
  userId: string;
  /** How many of the most recent completion days to return (default 90). Streaks use the full history. */
  limitDays?: number;
  /** IANA timezone of the user; decides what "today" is (UTC when missing/invalid). */
  timezone?: string;
}

export class GetHabitHistoryUseCase {
  constructor(
    private readonly habitRepo: IHabitRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(input: GetHabitHistoryInput): Promise<HabitHistoryView> {
    if (!input.habitId) throw badRequest('Habit ID is required');
    if (!input.userId) throw badRequest('User ID is required');

    const habit = await this.habitRepo.findById(input.habitId, input.userId);
    if (!habit) {
      throw notFound('Habit not found');
    }

    const todayStr = todayInTimeZone(this.clock, input.timezone);
    const limitDays = input.limitDays ?? 90;

    // Streaks come from the whole history so a long streak is not truncated to the displayed window.
    const allDates = await this.habitRepo.getCompletionDates(
      habit.id,
      input.userId,
      HABIT_HISTORY_SCAN_LIMIT,
    );
    const completionDates = limitDays > 0 ? allDates.slice(-limitDays) : [];

    const streaks =
      habit.frequency === 'weekly'
        ? calculateWeeklyStreak(allDates, habit.targetDaysPerWeek, todayStr)
        : calculateDailyStreak(allDates, todayStr);

    const isCompletedToday = allDates.includes(todayStr);

    return {
      habit: toHabitView(habit, { isCompletedToday }),
      completionDates,
      streaks,
    };
  }
}
