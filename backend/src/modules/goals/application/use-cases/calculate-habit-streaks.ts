import { badRequest, notFound } from '../errors.js';
import { calculateDailyStreak, calculateWeeklyStreak, type StreakResult } from '../../domain/streak-calculator.js';
import type { IHabitRepository } from '../ports.js';

export interface CalculateHabitStreaksInput {
  habitId: string;
  userId: string;
  referenceDate?: string; // YYYY-MM-DD
}

export class CalculateHabitStreaksUseCase {
  constructor(private readonly habitRepo: IHabitRepository) {}

  async execute(input: CalculateHabitStreaksInput): Promise<StreakResult> {
    if (!input.habitId) throw badRequest('Habit ID is required');
    if (!input.userId) throw badRequest('User ID is required');

    const habit = await this.habitRepo.findById(input.habitId, input.userId);
    if (!habit) {
      throw notFound('Habit not found');
    }

    const refDate = input.referenceDate ?? new Date().toISOString().slice(0, 10);
    const completionDates = await this.habitRepo.getCompletionDates(habit.id, input.userId);

    const streaks =
      habit.frequency === 'weekly'
        ? calculateWeeklyStreak(completionDates, habit.targetDaysPerWeek, refDate)
        : calculateDailyStreak(completionDates, refDate);

    return streaks;
  }
}
