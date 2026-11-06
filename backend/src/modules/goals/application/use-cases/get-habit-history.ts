import { badRequest, notFound } from '../errors.js';
import { calculateDailyStreak, calculateWeeklyStreak } from '../../domain/streak-calculator.js';
import type { IHabitRepository } from '../ports.js';
import { toHabitView, type HabitHistoryView } from '../goals-view.js';

export interface GetHabitHistoryInput {
  habitId: string;
  userId: string;
  limitDays?: number;
}

export class GetHabitHistoryUseCase {
  constructor(private readonly habitRepo: IHabitRepository) {}

  async execute(input: GetHabitHistoryInput): Promise<HabitHistoryView> {
    if (!input.habitId) throw badRequest('Habit ID is required');
    if (!input.userId) throw badRequest('User ID is required');

    const habit = await this.habitRepo.findById(input.habitId, input.userId);
    if (!habit) {
      throw notFound('Habit not found');
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const limitDays = input.limitDays ?? 90;

    const completionDates = await this.habitRepo.getCompletionDates(habit.id, input.userId, limitDays);

    const streaks =
      habit.frequency === 'weekly'
        ? calculateWeeklyStreak(completionDates, habit.targetDaysPerWeek, todayStr)
        : calculateDailyStreak(completionDates, todayStr);

    const isCompletedToday = completionDates.includes(todayStr);

    return {
      habit: toHabitView(habit, { isCompletedToday }),
      completionDates,
      streaks,
    };
  }
}
