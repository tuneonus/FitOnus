import { AppError } from '../../../../shared/errors/app-error.js';
import type { BodyMeasurement, MeasurementSource } from '../../domain/body-measurement.js';
import type { IBodyMeasurementRepository } from '../ports.js';

export interface UpdateMeasurementInput {
  userId: string;
  id: string;
  loggedAt?: Date;
  waistCm?: number | null;
  chestCm?: number | null;
  hipCm?: number | null;
  armCm?: number | null;
  neckCm?: number | null;
  bodyFatPct?: number | null;
  muscleMassKg?: number | null;
  notes?: string | null;
  source?: MeasurementSource;
}

export class UpdateMeasurementUseCase {
  constructor(private readonly measRepo: IBodyMeasurementRepository) {}

  async execute(input: UpdateMeasurementInput): Promise<{ measurement: BodyMeasurement }> {
    if (!input.userId) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }
    if (!input.id) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Measurement ID is required');
    }

    if (input.waistCm !== undefined && input.waistCm !== null && (input.waistCm <= 30.0 || input.waistCm >= 250.0)) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Waist circumference must be between 30.1 and 249.9 cm');
    }
    if (input.chestCm !== undefined && input.chestCm !== null && (input.chestCm <= 30.0 || input.chestCm >= 250.0)) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Chest circumference must be between 30.1 and 249.9 cm');
    }
    if (input.hipCm !== undefined && input.hipCm !== null && (input.hipCm <= 30.0 || input.hipCm >= 250.0)) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Hip circumference must be between 30.1 and 249.9 cm');
    }
    if (input.armCm !== undefined && input.armCm !== null && (input.armCm <= 10.0 || input.armCm >= 100.0)) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Arm circumference must be between 10.1 and 99.9 cm');
    }
    if (input.neckCm !== undefined && input.neckCm !== null && (input.neckCm <= 15.0 || input.neckCm >= 80.0)) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Neck circumference must be between 15.1 and 79.9 cm');
    }
    if (input.bodyFatPct !== undefined && input.bodyFatPct !== null && (input.bodyFatPct < 3.0 || input.bodyFatPct > 60.0)) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Body fat percentage must be between 3.0% and 60.0%');
    }
    if (input.muscleMassKg !== undefined && input.muscleMassKg !== null && (input.muscleMassKg < 10.0 || input.muscleMassKg > 200.0)) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Muscle mass must be between 10.0 and 200.0 kg');
    }

    const updated = await this.measRepo.update(input.id, input.userId, {
      loggedAt: input.loggedAt,
      waistCm: input.waistCm,
      chestCm: input.chestCm,
      hipCm: input.hipCm,
      armCm: input.armCm,
      neckCm: input.neckCm,
      bodyFatPct: input.bodyFatPct,
      muscleMassKg: input.muscleMassKg,
      notes: input.notes,
      source: input.source,
    });

    if (!updated) {
      throw new AppError('not_found', 'NOT_FOUND', 'Body measurement not found or not owned by user');
    }

    return { measurement: updated };
  }
}

