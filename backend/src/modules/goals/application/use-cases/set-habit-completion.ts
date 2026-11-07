import { badRequest, notFound } from '../errors.js';
import {
  calculateDailyStreak,
  calculateWeeklyStreak,
  type StreakResult,
} from '../../domain/streak-calculator.js';
import type { IHabitRepository, SetHabitCompletionInput } from '../ports.js';
import { toHabitView, type HabitView } from '../goals-view.js';

export type { SetHabitCompletionInput };

export interface SetHabitCompletionResult {
  habit: HabitView;
  date: string;
  completed: boolean;
  streaks: StreakResult;
}

export class SetHabitCompletionUseCase {
  constructor(private readonly habitRepo: IHabitRepository) {}

  async execute(input: SetHabitCompletionInput): Promise<SetHabitCompletionResult> {
    if (!input.habitId) throw badRequest('Habit ID is required');
    if (!input.userId) throw badRequest('User ID is required');
    if (typeof input.completed !== 'boolean') {
      throw badRequest('Completed state must be a boolean (explicit true or false)');
    }
    if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      throw badRequest('Date must be formatted as YYYY-MM-DD');
    }

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
    const allDates = await this.habitRepo.getCompletionDates(habit.id, input.userId);
    const streaks =
      habit.frequency === 'weekly'
        ? calculateWeeklyStreak(allDates, habit.targetDaysPerWeek, input.date)
        : calculateDailyStreak(allDates, input.date);

    await this.habitRepo.updateStreaks(habit.id, input.userId, streaks);
    habit.updateStreaks(streaks.currentStreak, streaks.longestStreak, streaks.totalCompletions);

    // Compute weekly completed days for the current week
    const refDate = new Date(`${input.date}T00:00:00Z`);
    const day = refDate.getUTCDay() || 7;
    const startOfWeek = new Date(refDate);
    startOfWeek.setUTCDate(refDate.getUTCDate() - day + 1);
    const startOfWeekStr = startOfWeek.toISOString().slice(0, 10);
    const weeklyCompletedDays = allDates.filter((d) => d >= startOfWeekStr && d <= input.date).length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const isCompletedToday = allDates.includes(todayStr);

    return {
      habit: toHabitView(habit, { isCompletedToday, weeklyCompletedDays }),
      date: input.date,
      completed: input.completed,
      streaks,
    };
  }
}
