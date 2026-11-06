import { badRequest } from '../errors.js';
import type { IHabitRepository } from '../ports.js';
import { toHabitView, type HabitView } from '../goals-view.js';

export interface ListHabitsInput {
  userId: string;
  category?: string;
  isArchived?: boolean;
  date?: string; // Reference date YYYY-MM-DD, defaults to today
}

export class ListHabitsUseCase {
  constructor(private readonly habitRepo: IHabitRepository) {}

  async execute(input: ListHabitsInput): Promise<HabitView[]> {
    if (!input.userId) throw badRequest('User ID is required');

    const targetDate = input.date ?? new Date().toISOString().slice(0, 10);
    const habits = await this.habitRepo.listByUser(input.userId, {
      category: input.category,
      isArchived: input.isArchived,
    });

    const completedHabitIds = new Set(await this.habitRepo.getCompletionsForDate(input.userId, targetDate));

    // Calculate current week boundary (Monday of this week to Sunday)
    const refDate = new Date(`${targetDate}T00:00:00Z`);
    const day = refDate.getUTCDay() || 7; // 1 (Mon) - 7 (Sun)
    const startOfWeek = new Date(refDate);
    startOfWeek.setUTCDate(refDate.getUTCDate() - day + 1);
    const startOfWeekStr = startOfWeek.toISOString().slice(0, 10);

    const views: HabitView[] = [];

    for (const habit of habits) {
      const isCompletedToday = completedHabitIds.has(habit.id);

      // Fetch recent completion dates (last 7 days) to count week completions
      const recentDates = await this.habitRepo.getCompletionDates(habit.id, input.userId, 7);
      const weeklyCompletedDays = recentDates.filter((d) => d >= startOfWeekStr && d <= targetDate).length;

      views.push(
        toHabitView(habit, {
          isCompletedToday,
          weeklyCompletedDays,
        }),
      );
    }

    return views;
  }
}
