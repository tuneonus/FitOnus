/**
 * GetBodyAnalytics Application Use Case
 *
 * Computes EMA-smoothed weight trend, weekly velocity (kg/week), goal progress %,
 * and body measurement trajectories.
 */

import { AppError } from '../../../../shared/errors/app-error.js';
import {
  createCalendarBuckets,
  validateTimezone,
} from '../../domain/analytics-period.js';
import { summarizeBodyAnalytics } from '../../domain/body-analytics-metrics.js';
import type { IAnalyticsBodyRepository } from '../ports.js';
import type { BodyAnalyticsView } from '../dtos.js';
import { normalizeAnalyticsRange, parseReferenceDate } from '../period-helper.js';

export interface GetBodyAnalyticsInput {
  userId: string;
  range?: string | null;
  timezone?: string | null;
  refDate?: string | null;
}

export class GetBodyAnalyticsUseCase {
  constructor(private readonly bodyRepo: IAnalyticsBodyRepository) {}

  async execute(input: GetBodyAnalyticsInput): Promise<BodyAnalyticsView> {
    if (!input.userId || !input.userId.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const range = normalizeAnalyticsRange(input.range, 'M');
    const timezone = validateTimezone(input.timezone ?? undefined);
    const now = parseReferenceDate(input.refDate);

    const buckets = createCalendarBuckets(range, now, timezone);
    if (buckets.length === 0) {
      return {
        startingWeightKg: null,
        currentWeightKg: null,
        targetWeightKg: null,
        weeklyVelocityKg: 0,
        goalProgressPct: 0,
        weightTrend: [],
        measurementTrends: {},
      };
    }

    const startUtc = buckets[0]!.startDate;
    const endUtc = buckets[buckets.length - 1]!.endDate;

    const [weightLogs, measurements, profileGoals] = await Promise.all([
      this.bodyRepo.getWeightLogs(input.userId, startUtc, endUtc),
      this.bodyRepo.getMeasurements(input.userId, startUtc, endUtc),
      this.bodyRepo.getUserProfileGoals(input.userId),
    ]);

    const summary = summarizeBodyAnalytics(
      weightLogs,
      measurements,
      profileGoals?.startingWeightKg ?? null,
      profileGoals?.currentWeightKg ?? null,
      profileGoals?.targetWeightKg ?? null,
    );

    return {
      startingWeightKg: summary.startingWeightKg,
      currentWeightKg: summary.currentWeightKg,
      targetWeightKg: summary.targetWeightKg,
      weeklyVelocityKg: summary.weeklyVelocityKg,
      goalProgressPct: summary.goalProgressPct,
      weightTrend: summary.weightTrend,
      measurementTrends: summary.measurementTrends,
    };
  }
}
