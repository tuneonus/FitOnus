import { badRequest } from '../errors.js';
import { assertCalendarDate } from '../../domain/goal-limits.js';
import { startOfIsoWeek, systemClock, todayInTimeZone, type Clock } from '../../domain/local-date.js';
import type { IHabitRepository } from '../ports.js';
import { toHabitView, type HabitView } from '../goals-view.js';

/** Most recent completion days fetched per habit; far more than the 7 a week can hold. */
const WEEK_LOOKBACK_COMPLETIONS = 366;

export interface ListHabitsInput {
  userId: string;
  category?: string;
  isArchived?: boolean;
  /** Reference calendar date (YYYY-MM-DD) chosen by the client. Defaults to today in `timezone`. */
  date?: string;
  /** IANA timezone of the user; decides what "today" is when `date` is omitted (UTC when missing/invalid). */
  timezone?: string;
}

export class ListHabitsUseCase {
  constructor(
    private readonly habitRepo: IHabitRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(input: ListHabitsInput): Promise<HabitView[]> {
    if (!input.userId) throw badRequest('User ID is required');
    assertCalendarDate('date', input.date);

    const targetDate = input.date ?? todayInTimeZone(this.clock, input.timezone);
    const habits = await this.habitRepo.listByUser(input.userId, {
      category: input.category,
      isArchived: input.isArchived,
    });

    const completedHabitIds = new Set(await this.habitRepo.getCompletionsForDate(input.userId, targetDate));

    // The week runs Monday..Sunday of the reference calendar date.
    const startOfWeekStr = startOfIsoWeek(targetDate);

    const views: HabitView[] = [];

    for (const habit of habits) {
      const isCompletedToday = completedHabitIds.has(habit.id);

      const recentDates = await this.habitRepo.getCompletionDates(
        habit.id,
        input.userId,
        WEEK_LOOKBACK_COMPLETIONS,
      );
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
