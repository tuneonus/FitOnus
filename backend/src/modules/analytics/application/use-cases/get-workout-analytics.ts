/**
 * GetWorkoutAnalytics Application Use Case
 *
 * Aggregates completed workouts into frequency, volume, and duration trends
 * across requested calendar bucketing.
 */

import { AppError } from '../../../../shared/errors/app-error.js';
import { createCalendarBuckets, validateTimezone } from '../../domain/analytics-period.js';
import { summarizeWorkoutAnalytics } from '../../domain/workout-metrics.js';
import type { IAnalyticsWorkoutRepository, IAnalyticsBodyRepository } from '../ports.js';
import type { WorkoutAnalyticsView } from '../dtos.js';
import { normalizeAnalyticsRange, parseReferenceDate } from '../period-helper.js';

export interface GetWorkoutAnalyticsInput {
  userId: string;
  range?: string | null;
  timezone?: string | null;
  refDate?: string | null;
}

export class GetWorkoutAnalyticsUseCase {
  constructor(
    private readonly workoutRepo: IAnalyticsWorkoutRepository,
    private readonly bodyRepo: IAnalyticsBodyRepository,
  ) {}

  async execute(input: GetWorkoutAnalyticsInput): Promise<WorkoutAnalyticsView> {
    if (!input.userId || !input.userId.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const range = normalizeAnalyticsRange(input.range, 'M');
    const timezone = validateTimezone(input.timezone ?? undefined);
    const now = parseReferenceDate(input.refDate);

    const buckets = createCalendarBuckets(range, now, timezone);
    if (buckets.length === 0) {
      return {
        range,
        totalSessions: 0,
        totalVolumeKg: 0,
        avgDurationMin: 0,
        consistencyPct: 0,
        frequencySeries: [],
        volumeSeries: [],
        durationSeries: [],
      };
    }

    const startUtc = buckets[0]!.startDate;
    const endUtc = buckets[buckets.length - 1]!.endDate;

    const [sessions, profileGoals] = await Promise.all([
      this.workoutRepo.getCompletedSessions(input.userId, startUtc, endUtc),
      this.bodyRepo.getUserProfileGoals(input.userId),
    ]);

    const targetDaysPerWeek = profileGoals?.workoutDaysPerWeek ?? 3;
    const summary = summarizeWorkoutAnalytics(sessions, buckets, targetDaysPerWeek);

    return {
      range,
      totalSessions: summary.totalSessions,
      totalVolumeKg: summary.totalVolumeKg,
      avgDurationMin: summary.avgDurationMin,
      consistencyPct: summary.consistencyPct,
      frequencySeries: summary.frequencySeries,
      volumeSeries: summary.volumeSeries,
      durationSeries: summary.durationSeries,
    };
  }
}
