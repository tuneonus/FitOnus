import { AppError } from '../../../../shared/errors/app-error.js';
import type { IWeightRepository } from '../ports.js';

export interface DeleteWeightLogInput {
  id: string;
  userId: string;
}

export class DeleteWeightLogUseCase {
  constructor(private readonly weightRepo: IWeightRepository) {}

  async execute(input: DeleteWeightLogInput): Promise<{ id: string; deleted: boolean }> {
    if (!input.userId) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }
    if (!input.id) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Weight log ID is required');
    }

    const deleted = await this.weightRepo.softDelete(input.id, input.userId);
    if (!deleted) {
      throw new AppError('not_found', 'NOT_FOUND', 'Weight log not found or not owned by user');
    }

    return { id: input.id, deleted: true };
  }
}
