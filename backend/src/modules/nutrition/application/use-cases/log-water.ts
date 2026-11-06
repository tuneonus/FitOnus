import crypto from 'node:crypto';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { IWaterRepository } from '../ports.js';
import { toWaterIntakeView, type WaterIntakeView } from '../nutrition-view.js';
import { WaterIntake } from '../../domain/water.js';

export interface LogWaterInput {
  id?: string;
  userId: string;
  date: string;
  amountMl: number;
  loggedAt?: Date;
}

export interface LogWaterResult {
  entry: WaterIntakeView;
  created: boolean;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class LogWaterUseCase {
  constructor(private readonly waterRepo: IWaterRepository) {}

  async execute(input: LogWaterInput): Promise<LogWaterResult> {
    if (!DATE_REGEX.test(input.date)) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Invalid date format (must be YYYY-MM-DD)');
    }
    if (input.amountMl <= 0) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Water amount must be greater than 0');
    }

    const waterId = input.id ?? crypto.randomUUID();

    // 1. Cross-user collision & idempotent retry check
    if (input.id) {
      const existing = await this.waterRepo.findById(input.id);
      if (existing) {
        if (existing.userId !== input.userId) {
          throw new AppError('conflict', 'CONFLICT', 'Water entry ID collision with another user');
        }
        return { entry: toWaterIntakeView(existing), created: false };
      }
    }

    const now = new Date();
    const waterEntry = new WaterIntake({
      id: waterId,
      userId: input.userId,
      date: input.date,
      amountMl: input.amountMl,
      loggedAt: input.loggedAt ?? now,
      createdAt: now,
    });

    const result = await this.waterRepo.create(waterEntry);

    if (!result.created && result.entry.userId !== input.userId) {
      throw new AppError('conflict', 'CONFLICT', 'Water entry ID collision with another user');
    }

    return {
      entry: toWaterIntakeView(result.entry),
      created: result.created,
    };
  }
}

