import { AppError } from '../../../../shared/errors/app-error.js';
import type { WeightLog, WeightSource } from '../../domain/weight-log.js';
import type { IWeightRepository } from '../ports.js';

export interface UpdateWeightLogInput {
  userId: string;
  id: string;
  weightKg?: number;
  loggedAt?: Date;
  source?: WeightSource;
  notes?: string | null;
}

export class UpdateWeightLogUseCase {
  constructor(private readonly weightRepo: IWeightRepository) {}

  async execute(input: UpdateWeightLogInput): Promise<{ log: WeightLog }> {
    if (!input.userId) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }
    if (!input.id) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Weight log ID is required');
    }

    if (input.weightKg !== undefined && (input.weightKg < 25 || input.weightKg > 450)) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Weight must be between 25 kg and 450 kg');
    }

    const updated = await this.weightRepo.update(input.id, input.userId, {
      weightKg: input.weightKg,
      loggedAt: input.loggedAt,
      source: input.source,
      notes: input.notes,
    });

    if (!updated) {
      throw new AppError('not_found', 'NOT_FOUND', 'Weight log not found or not owned by user');
    }

    return { log: updated };
  }
}

