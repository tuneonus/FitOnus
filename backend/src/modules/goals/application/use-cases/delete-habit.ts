import { badRequest, notFound } from '../errors.js';
import type { IHabitRepository } from '../ports.js';

export interface DeleteHabitInput {
  id: string;
  userId: string;
}

export class DeleteHabitUseCase {
  constructor(private readonly habitRepo: IHabitRepository) {}

  async execute(input: DeleteHabitInput): Promise<{ success: boolean; id: string }> {
    if (!input.id) throw badRequest('Habit ID is required');
    if (!input.userId) throw badRequest('User ID is required');

    const deleted = await this.habitRepo.delete(input.id, input.userId);
    if (!deleted) {
      throw notFound('Habit not found');
    }

    return { success: true, id: input.id };
  }
}
