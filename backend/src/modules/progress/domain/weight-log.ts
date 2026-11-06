import { AppError } from '../../../shared/errors/app-error.js';

export const WEIGHT_SOURCES = ['manual', 'synced'] as const;
export type WeightSource = (typeof WEIGHT_SOURCES)[number];

export interface WeightLogProps {
  id: string;
  userId: string;
  weightKg: number;
  loggedAt: Date;
  source?: WeightSource;
  notes?: string | null;
  clientId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export class WeightLog {
  readonly id: string;
  readonly userId: string;
  readonly weightKg: number;
  readonly loggedAt: Date;
  readonly source: WeightSource;
  readonly notes: string | null;
  readonly clientId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;

  constructor(props: WeightLogProps) {
    if (!props.id || typeof props.id !== 'string') {
      throw new AppError('validation', 'VALIDATION_FAILED', 'WeightLog ID must be a non-empty string');
    }
    if (!props.userId || typeof props.userId !== 'string') {
      throw new AppError('validation', 'VALIDATION_FAILED', 'WeightLog userId must be a non-empty string');
    }
    if (typeof props.weightKg !== 'number' || Number.isNaN(props.weightKg)) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'WeightLog weightKg must be a valid number');
    }
    if (props.weightKg < 25.0 || props.weightKg > 450.0) {
      throw new AppError(
        'validation',
        'VALIDATION_FAILED',
        `Weight must be between 25.0 kg and 450.0 kg, received ${props.weightKg}`,
      );
    }
    if (!(props.loggedAt instanceof Date) || Number.isNaN(props.loggedAt.getTime())) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'WeightLog loggedAt must be a valid Date');
    }

    const source = props.source ?? 'manual';
    if (!WEIGHT_SOURCES.includes(source)) {
      throw new AppError('validation', 'VALIDATION_FAILED', `Invalid weight source: ${source}`);
    }

    this.id = props.id;
    this.userId = props.userId;
    // Round to 2 decimal places to match numeric(5,2) database precision
    this.weightKg = Math.round(props.weightKg * 100) / 100;
    this.loggedAt = new Date(props.loggedAt.getTime());
    this.source = source;
    this.notes = props.notes?.trim() ? props.notes.trim() : null;
    this.clientId = props.clientId?.trim() ? props.clientId.trim() : null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }

  isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
