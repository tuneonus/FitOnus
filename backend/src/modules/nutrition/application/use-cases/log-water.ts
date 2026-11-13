import crypto from 'node:crypto';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { IWaterRepository } from '../ports.js';
import { toWaterIntakeView, type WaterIntakeView } from '../nutrition-view.js';
import { WaterIntake } from '../../domain/water.js';
import { isValidCalendarDate, localDateString, systemClock, type Clock } from '../../domain/local-date.js';
import { assertWaterAmount } from '../../domain/nutrition-limits.js';

export interface LogWaterInput {
  id?: string;
  userId: string;
  /**
   * Calendar day (YYYY-MM-DD) the water belongs to, chosen by the client and used as given.
   * When omitted it is the day of `loggedAt` (or of now) in `timezone`.
   */
  date?: string;
  /** IANA timezone of the user; decides the day when `date` is omitted (UTC when missing/invalid). */
  timezone?: string;
  amountMl: number;
  loggedAt?: Date;
}

export interface LogWaterResult {
  entry: WaterIntakeView;
  created: boolean;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class LogWaterUseCase {
  constructor(
    private readonly waterRepo: IWaterRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(input: LogWaterInput): Promise<LogWaterResult> {
    const now = this.clock();
    const loggedAt = input.loggedAt ?? now;
    if (Number.isNaN(loggedAt.getTime())) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'loggedAt is not a valid timestamp');
    }

    // An explicit client date is a calendar day and is used as given; only the implicit default is "today".
    const date = input.date ?? localDateString(loggedAt, input.timezone);
    if (!DATE_REGEX.test(date)) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Invalid date format (must be YYYY-MM-DD)');
    }
    if (!isValidCalendarDate(date)) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Invalid date (must be a real calendar day)');
    }
    if (input.amountMl <= 0) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Water amount must be greater than 0');
    }
    assertWaterAmount(input.amountMl);

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

    const waterEntry = new WaterIntake({
      id: waterId,
      userId: input.userId,
      date,
      amountMl: input.amountMl,
      loggedAt,
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
