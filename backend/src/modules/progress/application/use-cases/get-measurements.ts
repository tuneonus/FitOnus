import { AppError } from '../../../../shared/errors/app-error.js';
import type { IBodyMeasurementRepository } from '../ports.js';
import type { MeasurementDiffs } from './log-measurement.js';

export interface GetMeasurementsInput {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface GetMeasurementsResult {
  latest: {
    id: string;
    date: string;
    waist?: number;
    chest?: number;
    hip?: number;
    arm?: number;
    neck?: number;
    bodyFat?: number;
    muscleMass?: number;
  } | null;
  diffs: MeasurementDiffs;
  history: {
    id: string;
    date: string;
    values: {
      waist?: number;
      chest?: number;
      hip?: number;
      arm?: number;
      neck?: number;
      bodyFat?: number;
      muscleMass?: number;
    };
  }[];
  total: number;
}

export class GetMeasurementsUseCase {
  constructor(private readonly measRepo: IBodyMeasurementRepository) {}

  async execute(input: GetMeasurementsInput): Promise<GetMeasurementsResult> {
    if (!input.userId) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);
    const offset = Math.max(input.offset ?? 0, 0);

    const listRes = await this.measRepo.listForUser(input.userId, { limit, offset });
    const latestLog = listRes.measurements[0] ?? null;
    const secondLog = listRes.measurements[1] ?? null;

    const diffs: MeasurementDiffs = {};
    if (latestLog && secondLog) {
      if (latestLog.waistCm !== null && secondLog.waistCm !== null) {
        diffs.waist = Math.round((latestLog.waistCm - secondLog.waistCm) * 10) / 10;
      }
      if (latestLog.chestCm !== null && secondLog.chestCm !== null) {
        diffs.chest = Math.round((latestLog.chestCm - secondLog.chestCm) * 10) / 10;
      }
      if (latestLog.hipCm !== null && secondLog.hipCm !== null) {
        diffs.hip = Math.round((latestLog.hipCm - secondLog.hipCm) * 10) / 10;
      }
      if (latestLog.armCm !== null && secondLog.armCm !== null) {
        diffs.arm = Math.round((latestLog.armCm - secondLog.armCm) * 10) / 10;
      }
      if (latestLog.neckCm !== null && secondLog.neckCm !== null) {
        diffs.neck = Math.round((latestLog.neckCm - secondLog.neckCm) * 10) / 10;
      }
      if (latestLog.bodyFatPct !== null && secondLog.bodyFatPct !== null) {
        diffs.bodyFat = Math.round((latestLog.bodyFatPct - secondLog.bodyFatPct) * 10) / 10;
      }
      if (latestLog.muscleMassKg !== null && secondLog.muscleMassKg !== null) {
        diffs.muscleMass = Math.round((latestLog.muscleMassKg - secondLog.muscleMassKg) * 10) / 10;
      }
    }

    const history = listRes.measurements.map((m) => ({
      id: m.id,
      date: formatDateShort(m.loggedAt),
      values: {
        ...(m.waistCm !== null ? { waist: m.waistCm } : {}),
        ...(m.chestCm !== null ? { chest: m.chestCm } : {}),
        ...(m.hipCm !== null ? { hip: m.hipCm } : {}),
        ...(m.armCm !== null ? { arm: m.armCm } : {}),
        ...(m.neckCm !== null ? { neck: m.neckCm } : {}),
        ...(m.bodyFatPct !== null ? { bodyFat: m.bodyFatPct } : {}),
        ...(m.muscleMassKg !== null ? { muscleMass: m.muscleMassKg } : {}),
      },
    }));

    const latest = latestLog
      ? {
          id: latestLog.id,
          date: formatDateShort(latestLog.loggedAt),
          ...(latestLog.waistCm !== null ? { waist: latestLog.waistCm } : {}),
          ...(latestLog.chestCm !== null ? { chest: latestLog.chestCm } : {}),
          ...(latestLog.hipCm !== null ? { hip: latestLog.hipCm } : {}),
          ...(latestLog.armCm !== null ? { arm: latestLog.armCm } : {}),
          ...(latestLog.neckCm !== null ? { neck: latestLog.neckCm } : {}),
          ...(latestLog.bodyFatPct !== null ? { bodyFat: latestLog.bodyFatPct } : {}),
          ...(latestLog.muscleMassKg !== null ? { muscleMass: latestLog.muscleMassKg } : {}),
        }
      : null;

    return {
      latest,
      diffs,
      history,
      total: listRes.total,
    };
  }
}

function formatDateShort(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
