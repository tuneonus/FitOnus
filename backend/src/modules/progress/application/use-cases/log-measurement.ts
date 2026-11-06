import { AppError } from '../../../../shared/errors/app-error.js';
import { BodyMeasurement, type MeasurementSource } from '../../domain/body-measurement.js';
import type { IBodyMeasurementRepository } from '../ports.js';

export interface LogMeasurementInput {
  userId: string;
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
  clientId?: string | null;
}

export interface MeasurementDiffs {
  waist?: number;
  chest?: number;
  hip?: number;
  arm?: number;
  neck?: number;
  bodyFat?: number;
  muscleMass?: number;
}

export interface LogMeasurementResult {
  measurement: BodyMeasurement;
  isNew: boolean;
  diffs: MeasurementDiffs;
}

export class LogMeasurementUseCase {
  constructor(private readonly measRepo: IBodyMeasurementRepository) {}

  async execute(input: LogMeasurementInput): Promise<LogMeasurementResult> {
    if (!input.userId) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const id = crypto.randomUUID();
    const loggedAt = input.loggedAt ?? new Date();

    const measurement = new BodyMeasurement({
      id,
      userId: input.userId,
      loggedAt,
      waistCm: input.waistCm,
      chestCm: input.chestCm,
      hipCm: input.hipCm,
      armCm: input.armCm,
      neckCm: input.neckCm,
      bodyFatPct: input.bodyFatPct,
      muscleMassKg: input.muscleMassKg,
      notes: input.notes,
      source: input.source ?? 'manual',
      clientId: input.clientId,
    });

    // Fetch previous active measurement before this loggedAt to calculate diffs
    const previous = await this.measRepo.getLatestForUser(input.userId);

    const { measurement: saved, isNew } = await this.measRepo.save(measurement);

    const diffs: MeasurementDiffs = {};
    if (previous) {
      if (saved.waistCm !== null && previous.waistCm !== null) {
        diffs.waist = Math.round((saved.waistCm - previous.waistCm) * 10) / 10;
      }
      if (saved.chestCm !== null && previous.chestCm !== null) {
        diffs.chest = Math.round((saved.chestCm - previous.chestCm) * 10) / 10;
      }
      if (saved.hipCm !== null && previous.hipCm !== null) {
        diffs.hip = Math.round((saved.hipCm - previous.hipCm) * 10) / 10;
      }
      if (saved.armCm !== null && previous.armCm !== null) {
        diffs.arm = Math.round((saved.armCm - previous.armCm) * 10) / 10;
      }
      if (saved.neckCm !== null && previous.neckCm !== null) {
        diffs.neck = Math.round((saved.neckCm - previous.neckCm) * 10) / 10;
      }
      if (saved.bodyFatPct !== null && previous.bodyFatPct !== null) {
        diffs.bodyFat = Math.round((saved.bodyFatPct - previous.bodyFatPct) * 10) / 10;
      }
      if (saved.muscleMassKg !== null && previous.muscleMassKg !== null) {
        diffs.muscleMass = Math.round((saved.muscleMassKg - previous.muscleMassKg) * 10) / 10;
      }
    }

    return {
      measurement: saved,
      isNew,
      diffs,
    };
  }
}
