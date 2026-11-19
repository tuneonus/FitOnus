import type { TimeBucket } from './calendar-bounds.js';
import type { DataPoint } from './ema-calculator.js';

/** A recorded weigh-in (only the fields the series needs). */
export interface WeightSample {
  weightKg: number;
  loggedAt: Date;
}

/**
 * Builds the raw (unsmoothed) weight series for a chart: one point per calendar bucket, carrying the
 * last recorded weight forward across buckets that have no weigh-in.
 *
 * A bucket only gets a point once a real weigh-in is known. Buckets before the user's first recorded
 * weight are omitted instead of being back-filled, so an account with no weigh-ins gets no points at
 * all. In particular the series is never seeded from a default or from the profile weight: a chart
 * must only show weights the user actually recorded.
 *
 * `baselineKg` is the last weigh-in recorded before the first bucket began (or null if there is none).
 * It lets buckets before the first in-range weigh-in carry the previous real value forward.
 */
export function buildWeightSeries(
  buckets: readonly Pick<TimeBucket, 'label' | 'startDate' | 'endDate'>[],
  logs: readonly WeightSample[],
  baselineKg: number | null,
): DataPoint[] {
  const points: DataPoint[] = [];
  let lastKnown = baselineKg;

  for (const bucket of buckets) {
    // The latest weigh-in inside the bucket wins. A strict ">" keeps the first one seen on a tie,
    // which is the most recently created because the repository lists newest first.
    let latest: WeightSample | undefined;
    for (const log of logs) {
      if (log.loggedAt < bucket.startDate || log.loggedAt > bucket.endDate) continue;
      if (!latest || log.loggedAt > latest.loggedAt) latest = log;
    }
    if (latest) lastKnown = latest.weightKg;
    if (lastKnown !== null) points.push({ label: bucket.label, value: lastKnown });
  }

  return points;
}
