import { AppError } from '../../../../shared/errors/app-error.js';
import type { IBodyMeasurementRepository } from '../ports.js';

export interface DeleteMeasurementInput {
  id: string;
  userId: string;
}

export class DeleteMeasurementUseCase {
  constructor(private readonly measRepo: IBodyMeasurementRepository) {}

  async execute(input: DeleteMeasurementInput): Promise<{ id: string; deleted: boolean }> {
    if (!input.userId) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }
    if (!input.id) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Measurement ID is required');
    }

    const deleted = await this.measRepo.softDelete(input.id, input.userId);
    if (!deleted) {
      throw new AppError('not_found', 'NOT_FOUND', 'Measurement not found or not owned by user');
    }

    return { id: input.id, deleted: true };
  }
}
