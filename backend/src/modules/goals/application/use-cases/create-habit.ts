import { randomUUID } from 'node:crypto';
import { badRequest } from '../errors.js';
import { Habit, type HabitCategory, type HabitFrequency } from '../../domain/habit.js';
import {
  HABIT_COLOR_MAX_LENGTH,
  HABIT_ICON_MAX_LENGTH,
  HABIT_TITLE_MAX_LENGTH,
  assertHabitTargetDays,
  assertMaxLength,
} from '../../domain/goal-limits.js';
import { systemClock, type Clock } from '../../domain/local-date.js';
import type { IHabitRepository } from '../ports.js';
import { toHabitView, type HabitView } from '../goals-view.js';

export interface CreateHabitInput {
  id?: string;
  userId: string;
  title: string;
  description?: string | null;
  category?: HabitCategory;
  frequency?: HabitFrequency;
  targetDaysPerWeek?: number;
  icon?: string;
  color?: string;
}

export class CreateHabitUseCase {
  constructor(
    private readonly habitRepo: IHabitRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(input: CreateHabitInput): Promise<HabitView> {
    if (!input.userId) throw badRequest('User ID is required');
    const title = input.title?.trim();
    if (!title) throw badRequest('Habit title is required');

    const frequency: HabitFrequency = input.frequency ?? 'daily';
    const targetDaysPerWeek = input.targetDaysPerWeek ?? (frequency === 'daily' ? 7 : 3);

    if (targetDaysPerWeek < 1 || targetDaysPerWeek > 7) {
      throw badRequest('Target days per week must be between 1 and 7');
    }
    assertHabitTargetDays(targetDaysPerWeek);
    assertMaxLength('title', title, HABIT_TITLE_MAX_LENGTH);
    assertMaxLength('icon', input.icon, HABIT_ICON_MAX_LENGTH);
    assertMaxLength('color', input.color, HABIT_COLOR_MAX_LENGTH);

    const now = this.clock();
    const habit = new Habit({
      id: input.id ?? randomUUID(),
      userId: input.userId,
      title,
      description: input.description ?? null,
      category: input.category ?? 'general',
      frequency,
      targetDaysPerWeek,
      icon: input.icon ?? 'check',
      color: input.color ?? 'teal',
      currentStreak: 0,
      longestStreak: 0,
      totalCompletions: 0,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    });

    await this.habitRepo.save(habit);

    return toHabitView(habit, { isCompletedToday: false, weeklyCompletedDays: 0 });
  }
}
