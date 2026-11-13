import { badRequest, notFound } from '../errors.js';
import type { HabitCategory, HabitFrequency } from '../../domain/habit.js';
import {
  HABIT_COLOR_MAX_LENGTH,
  HABIT_ICON_MAX_LENGTH,
  HABIT_TITLE_MAX_LENGTH,
  assertHabitTargetDays,
  assertMaxLength,
} from '../../domain/goal-limits.js';
import { systemClock, todayInTimeZone, type Clock } from '../../domain/local-date.js';
import type { IHabitRepository } from '../ports.js';
import { toHabitView, type HabitView } from '../goals-view.js';

export interface UpdateHabitInput {
  id: string;
  userId: string;
  title?: string;
  description?: string | null;
  category?: HabitCategory;
  frequency?: HabitFrequency;
  targetDaysPerWeek?: number;
  icon?: string;
  color?: string;
  isArchived?: boolean;
  /** IANA timezone of the user; decides what "today" is for `isCompletedToday` (UTC when missing/invalid). */
  timezone?: string;
}

export class UpdateHabitUseCase {
  constructor(
    private readonly habitRepo: IHabitRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(input: UpdateHabitInput): Promise<HabitView> {
    if (!input.id) throw badRequest('Habit ID is required');
    if (!input.userId) throw badRequest('User ID is required');

    const habit = await this.habitRepo.findById(input.id, input.userId);
    if (!habit) {
      throw notFound('Habit not found');
    }

    if (
      input.targetDaysPerWeek !== undefined &&
      (input.targetDaysPerWeek < 1 || input.targetDaysPerWeek > 7)
    ) {
      throw badRequest('Target days per week must be between 1 and 7');
    }
    if (input.targetDaysPerWeek !== undefined) assertHabitTargetDays(input.targetDaysPerWeek);
    assertMaxLength('title', input.title?.trim(), HABIT_TITLE_MAX_LENGTH);
    assertMaxLength('icon', input.icon, HABIT_ICON_MAX_LENGTH);
    assertMaxLength('color', input.color, HABIT_COLOR_MAX_LENGTH);

    habit.updateDetails({
      title: input.title,
      description: input.description,
      category: input.category,
      frequency: input.frequency,
      targetDaysPerWeek: input.targetDaysPerWeek,
      icon: input.icon,
      color: input.color,
    });

    if (input.isArchived !== undefined) {
      if (input.isArchived) {
        habit.archive();
      } else {
        habit.unarchive();
      }
    }

    await this.habitRepo.save(habit);

    const todayStr = todayInTimeZone(this.clock, input.timezone);
    const isCompletedToday = await this.habitRepo.isCompleted(habit.id, todayStr);

    return toHabitView(habit, { isCompletedToday });
  }
}
