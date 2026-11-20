/**
 * GetHydrationAnalytics Application Use Case
 *
 * Computes water intake trends, average consumption, and goal adherence rates.
 */

import { AppError } from '../../../../shared/errors/app-error.js';
import {
  createCalendarBuckets,
  generateDateSeries,
  validateTimezone,
} from '../../domain/analytics-period.js';
import { DEFAULT_WATER_TARGET_ML, summarizeHydrationAnalytics } from '../../domain/hydration-metrics.js';
import type { IAnalyticsBodyRepository, IAnalyticsNutritionRepository } from '../ports.js';
import type { HydrationAnalyticsView } from '../dtos.js';
import { normalizeAnalyticsRange, parseReferenceDate } from '../period-helper.js';

export interface GetHydrationAnalyticsInput {
  userId: string;
  range?: string | null;
  timezone?: string | null;
  refDate?: string | null;
  customTargetMl?: number | null;
}

export class GetHydrationAnalyticsUseCase {
  constructor(
    private readonly nutritionRepo: IAnalyticsNutritionRepository,
    private readonly bodyRepo: IAnalyticsBodyRepository,
  ) {}

  async execute(input: GetHydrationAnalyticsInput): Promise<HydrationAnalyticsView> {
    if (!input.userId || !input.userId.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const range = normalizeAnalyticsRange(input.range, 'W');
    const timezone = validateTimezone(input.timezone ?? undefined);
    const now = parseReferenceDate(input.refDate);

    // An explicit target from the caller wins; otherwise the member's own goal (their saved target, else the
    // 35 ml/kg estimate), the same one the nutrition diary shows. 3000 ml only when nothing at all is known.
    const customTarget = input.customTargetMl && input.customTargetMl > 0 ? input.customTargetMl : null;
    const targetMl =
      customTarget ?? (await this.bodyRepo.getUserProfileGoals(input.userId))?.dailyWaterTargetMl ?? DEFAULT_WATER_TARGET_ML;

    const buckets = createCalendarBuckets(range, now, timezone);
    if (buckets.length === 0) {
      return {
        range,
        avgWaterMl: 0,
        targetWaterMl: targetMl,
        adherencePct: 0,
        points: [],
      };
    }

    const firstBucket = buckets[0]!;
    const lastBucket = buckets[buckets.length - 1]!;
    const startDateStr = firstBucket.dateStrings[0]!;
    const endDateStr = lastBucket.dateStrings[lastBucket.dateStrings.length - 1]!;

    const dateSeries = generateDateSeries(startDateStr, endDateStr);

    const waterLogs = await this.nutritionRepo.getDailyWaterAggregates(
      input.userId,
      startDateStr,
      endDateStr,
    );

    const summary = summarizeHydrationAnalytics(waterLogs, dateSeries, targetMl);

    return {
      range,
      avgWaterMl: summary.avgWaterMl,
      targetWaterMl: summary.targetWaterMl,
      adherencePct: summary.adherencePct,
      points: summary.points,
    };
  }
}
