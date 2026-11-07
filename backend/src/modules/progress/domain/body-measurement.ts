import { AppError } from '../../../shared/errors/app-error.js';

export const MEASUREMENT_SOURCES = ['manual', 'synced'] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];

export interface BodyMeasurementProps {
  id: string;
  userId: string;
  loggedAt: Date;
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
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export class BodyMeasurement {
  readonly id: string;
  readonly userId: string;
  readonly loggedAt: Date;
  readonly waistCm: number | null;
  readonly chestCm: number | null;
  readonly hipCm: number | null;
  readonly armCm: number | null;
  readonly neckCm: number | null;
  readonly bodyFatPct: number | null;
  readonly muscleMassKg: number | null;
  readonly notes: string | null;
  readonly source: MeasurementSource;
  readonly clientId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;

  constructor(props: BodyMeasurementProps) {
    if (!props.id || typeof props.id !== 'string') {
      throw new AppError('validation', 'VALIDATION_FAILED', 'BodyMeasurement ID must be a non-empty string');
    }
    if (!props.userId || typeof props.userId !== 'string') {
      throw new AppError(
        'validation',
        'VALIDATION_FAILED',
        'BodyMeasurement userId must be a non-empty string',
      );
    }
    if (!(props.loggedAt instanceof Date) || Number.isNaN(props.loggedAt.getTime())) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'BodyMeasurement loggedAt must be a valid Date');
    }

    const hasAnyMeasurement =
      (props.waistCm !== undefined && props.waistCm !== null) ||
      (props.chestCm !== undefined && props.chestCm !== null) ||
      (props.hipCm !== undefined && props.hipCm !== null) ||
      (props.armCm !== undefined && props.armCm !== null) ||
      (props.neckCm !== undefined && props.neckCm !== null) ||
      (props.bodyFatPct !== undefined && props.bodyFatPct !== null) ||
      (props.muscleMassKg !== undefined && props.muscleMassKg !== null);

    if (!hasAnyMeasurement) {
      throw new AppError(
        'validation',
        'VALIDATION_FAILED',
        'At least one body measurement metric must be provided',
      );
    }

    const validateRange = (
      val: number | null | undefined,
      min: number,
      max: number,
      name: string,
    ): number | null => {
      if (val === undefined || val === null) return null;
      if (typeof val !== 'number' || Number.isNaN(val) || val < min || val > max) {
        throw new AppError(
          'validation',
          'VALIDATION_FAILED',
          `${name} must be between ${min} and ${max}, received ${val}`,
        );
      }
      return Math.round(val * 100) / 100;
    };

    this.id = props.id;
    this.userId = props.userId;
    this.loggedAt = new Date(props.loggedAt.getTime());
    this.waistCm = validateRange(props.waistCm, 30.1, 249.9, 'Waist circumference');
    this.chestCm = validateRange(props.chestCm, 30.1, 249.9, 'Chest circumference');
    this.hipCm = validateRange(props.hipCm, 30.1, 249.9, 'Hip circumference');
    this.armCm = validateRange(props.armCm, 10.1, 99.9, 'Arm circumference');
    this.neckCm = validateRange(props.neckCm, 15.1, 79.9, 'Neck circumference');
    this.bodyFatPct = validateRange(props.bodyFatPct, 3.0, 60.0, 'Body fat percentage');
    this.muscleMassKg = validateRange(props.muscleMassKg, 10.0, 200.0, 'Muscle mass');
    this.notes = props.notes?.trim() ? props.notes.trim() : null;
    this.source = props.source ?? 'manual';
    this.clientId = props.clientId?.trim() ? props.clientId.trim() : null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }

  isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
