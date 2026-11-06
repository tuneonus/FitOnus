import { badRequest, notFound } from '../errors.js';
import type { IGoalRepository } from '../ports.js';

export interface DeleteGoalInput {
  id: string;
  userId: string;
}

export class DeleteGoalUseCase {
  constructor(private readonly goalRepo: IGoalRepository) {}

  async execute(input: DeleteGoalInput): Promise<{ success: boolean; id: string }> {
    if (!input.id) throw badRequest('Goal ID is required');
    if (!input.userId) throw badRequest('User ID is required');

    const deleted = await this.goalRepo.delete(input.id, input.userId);
    if (!deleted) {
      throw notFound('Goal not found');
    }

    return { success: true, id: input.id };
  }
}
