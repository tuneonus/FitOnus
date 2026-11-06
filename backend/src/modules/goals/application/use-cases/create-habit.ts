import { randomUUID } from 'node:crypto';
import { badRequest } from '../errors.js';
import { Habit, type HabitCategory, type HabitFrequency } from '../../domain/habit.js';
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
  constructor(private readonly habitRepo: IHabitRepository) {}

  async execute(input: CreateHabitInput): Promise<HabitView> {
    if (!input.userId) throw badRequest('User ID is required');
    const title = input.title?.trim();
    if (!title) throw badRequest('Habit title is required');

    const frequency: HabitFrequency = input.frequency ?? 'daily';
    const targetDaysPerWeek = input.targetDaysPerWeek ?? (frequency === 'daily' ? 7 : 3);

    if (targetDaysPerWeek < 1 || targetDaysPerWeek > 7) {
      throw badRequest('Target days per week must be between 1 and 7');
    }

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
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.habitRepo.save(habit);

    return toHabitView(habit, { isCompletedToday: false, weeklyCompletedDays: 0 });
  }
}
