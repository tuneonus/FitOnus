import type { TimeBucket } from '../domain/calendar-bounds.js';
import type { DataPoint } from '../domain/ema-calculator.js';
import { buildWeightSeries } from '../domain/weight-series.js';
import type { IWeightRepository } from './ports.js';

/**
 * Loads the user's real weigh-ins for a set of calendar buckets and returns the raw chart series.
 *
 * The extra "last weigh-in before the range" lookup only runs when the first bucket has no weigh-in
 * of its own, because otherwise nothing needs to be carried into it. It reads `weight_logs` only:
 * the profile's onboarding weight is not a weigh-in and must not seed the chart.
 */
export async function loadRawWeightSeries(
  weightRepo: IWeightRepository,
  userId: string,
  buckets: readonly TimeBucket[],
): Promise<DataPoint[]> {
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  if (!first || !last) return [];

  const inRange = await weightRepo.listForUser(userId, {
    startDate: first.startDate,
    endDate: last.endDate,
    limit: 500,
  });

  const firstBucketHasWeighIn = inRange.logs.some(
    (log) => log.loggedAt >= first.startDate && log.loggedAt <= first.endDate,
  );

  let baselineKg: number | null = null;
  if (!firstBucketHasWeighIn) {
    // Newest first, so a single row is the most recent weigh-in before the range began.
    const before = await weightRepo.listForUser(userId, {
      endDate: new Date(first.startDate.getTime() - 1),
      limit: 1,
    });
    baselineKg = before.logs[0]?.weightKg ?? null;
  }

  return buildWeightSeries(buckets, inRange.logs, baselineKg);
}
