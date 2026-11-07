/**
 * GetNutritionAnalytics Application Use Case
 *
 * Computes rolling macro averages, energy distribution, and adherence rates.
 * Strictly excludes unlogged days from averages to prevent skewing.
 */

import { AppError } from '../../../../shared/errors/app-error.js';
import {
  createCalendarBuckets,
  generateDateSeries,
  validateTimezone,
} from '../../domain/analytics-period.js';
import { summarizeNutritionAnalytics } from '../../domain/nutrition-metrics.js';
import type { IAnalyticsNutritionRepository, IAnalyticsBodyRepository } from '../ports.js';
import type { NutritionAnalyticsView } from '../dtos.js';
import { normalizeAnalyticsRange, parseReferenceDate } from '../period-helper.js';

export interface GetNutritionAnalyticsInput {
  userId: string;
  range?: string | null;
  timezone?: string | null;
  refDate?: string | null;
}

export class GetNutritionAnalyticsUseCase {
  constructor(
    private readonly nutritionRepo: IAnalyticsNutritionRepository,
    private readonly bodyRepo: IAnalyticsBodyRepository,
  ) {}

  async execute(input: GetNutritionAnalyticsInput): Promise<NutritionAnalyticsView> {
    if (!input.userId || !input.userId.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const range = normalizeAnalyticsRange(input.range, 'W');
    const timezone = validateTimezone(input.timezone ?? undefined);
    const now = parseReferenceDate(input.refDate);

    const buckets = createCalendarBuckets(range, now, timezone);
    if (buckets.length === 0) {
      return {
        range,
        avgCalories: 0,
        targetCalories: null,
        calorieAdherencePct: 0,
        proteinAdherencePct: 0,
        macroSplit: [],
        dailyTrends: [],
      };
    }

    const firstBucket = buckets[0]!;
    const lastBucket = buckets[buckets.length - 1]!;
    const startDateStr = firstBucket.dateStrings[0]!;
    const endDateStr = lastBucket.dateStrings[lastBucket.dateStrings.length - 1]!;

    const dateSeries = generateDateSeries(startDateStr, endDateStr);

    const [meals, profileGoals] = await Promise.all([
      this.nutritionRepo.getDailyMealAggregates(input.userId, startDateStr, endDateStr),
      this.bodyRepo.getUserProfileGoals(input.userId),
    ]);

    const targetCalories = profileGoals?.dailyCalorieTarget ?? null;
    const targetProtein = profileGoals?.dailyProteinGrams ?? null;

    const summary = summarizeNutritionAnalytics(meals, dateSeries, targetCalories, targetProtein);

    return {
      range,
      avgCalories: summary.avgCalories,
      targetCalories: summary.targetCalories,
      calorieAdherencePct: summary.calorieAdherencePct,
      proteinAdherencePct: summary.proteinAdherencePct,
      macroSplit: summary.macroSplit,
      dailyTrends: summary.dailyTrends,
    };
  }
}
