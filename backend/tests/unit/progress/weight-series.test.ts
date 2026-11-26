import { describe, expect, it, vi } from 'vitest';
import { WeightLog } from '../../../src/modules/progress/domain/weight-log.js';
import type { TimeBucket } from '../../../src/modules/progress/domain/calendar-bounds.js';
import { buildWeightSeries } from '../../../src/modules/progress/domain/weight-series.js';
import { loadRawWeightSeries } from '../../../src/modules/progress/application/load-weight-series.js';
import type { IWeightRepository } from '../../../src/modules/progress/application/ports.js';

const userId = '11111111-1111-4111-8111-111111111111';
const DAY = 24 * 60 * 60 * 1000;

/** Five consecutive UTC calendar days: Mon 2026-11-02 .. Fri 2026-11-06. */
const buckets: TimeBucket[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((label, i) => {
  const start = new Date(Date.UTC(2026, 10, 2 + i, 0, 0, 0, 0));
  return {
    key: label,
    label,
    startDate: start,
    endDate: new Date(start.getTime() + DAY - 1),
  };
});
const noon = (dayIndex: number) => new Date(buckets[dayIndex]!.startDate.getTime() + 12 * 60 * 60 * 1000);
const sample = (weightKg: number, loggedAt: Date) => ({ weightKg, loggedAt });

describe('buildWeightSeries', () => {
  it('returns no points for an account with no weigh-ins (never a default weight)', () => {
    expect(buildWeightSeries(buckets, [], null)).toEqual([]);
  });

  it('does not back-fill buckets before the first recorded weight', () => {
    const series = buildWeightSeries(buckets, [sample(80, noon(2))], null);

    expect(series.map((p) => p.label)).toEqual(['Wed', 'Thu', 'Fri']);
    expect(series.map((p) => p.value)).toEqual([80, 80, 80]);
  });

  it('carries the last known weight forward across days without a weigh-in', () => {
    const series = buildWeightSeries(buckets, [sample(81, noon(0)), sample(79.5, noon(3))], null);

    expect(series.map((p) => p.value)).toEqual([81, 81, 81, 79.5, 79.5]);
  });

  it('seeds the range from the last weigh-in before it, so earlier days show a real value', () => {
    const series = buildWeightSeries(buckets, [sample(79, noon(3))], 82);

    expect(series.map((p) => p.value)).toEqual([82, 82, 82, 79, 79]);
  });

  it('uses the latest weigh-in of a day regardless of input order', () => {
    const morning = sample(80.4, new Date(buckets[1]!.startDate.getTime() + 6 * 60 * 60 * 1000));
    const evening = sample(80.0, new Date(buckets[1]!.startDate.getTime() + 20 * 60 * 60 * 1000));

    expect(buildWeightSeries(buckets, [morning, evening], null)[0]!.value).toBe(80.0);
    expect(buildWeightSeries(buckets, [evening, morning], null)[0]!.value).toBe(80.0);
  });

  it('ignores weigh-ins that fall outside every bucket', () => {
    const before = sample(90, new Date(buckets[0]!.startDate.getTime() - 1));
    const after = sample(60, new Date(buckets[4]!.endDate.getTime() + 1));

    expect(buildWeightSeries(buckets, [before, after], null)).toEqual([]);
  });
});

/**
 * A weight repository that behaves like the real one for the queries the loader makes: it filters by the
 * inclusive logged_at range and returns newest first, capped at `limit`.
 */
function repoWith(logs: WeightLog[]): { repo: IWeightRepository; listForUser: ReturnType<typeof vi.fn> } {
  const listForUser = vi.fn(
    async (_userId: string, filter?: { startDate?: Date; endDate?: Date; limit?: number }) => {
      const matching = logs
        .filter((l) => !filter?.startDate || l.loggedAt >= filter.startDate)
        .filter((l) => !filter?.endDate || l.loggedAt <= filter.endDate)
        .sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime());
      return { logs: matching.slice(0, filter?.limit ?? 50), total: matching.length };
    },
  );
  return { repo: { listForUser } as unknown as IWeightRepository, listForUser };
}
const log = (id: string, weightKg: number, loggedAt: Date) =>
  new WeightLog({ id, userId, weightKg, loggedAt });

describe('loadRawWeightSeries', () => {
  it('returns no points for an account with no weigh-ins', async () => {
    const { repo } = repoWith([]);

    expect(await loadRawWeightSeries(repo, userId, buckets)).toEqual([]);
  });

  it('carries a weigh-in from before the range into the days that precede the first in-range one', async () => {
    const { repo } = repoWith([
      log('old', 83, new Date(buckets[0]!.startDate.getTime() - 10 * DAY)),
      log('new', 80, noon(3)),
    ]);

    const series = await loadRawWeightSeries(repo, userId, buckets);

    expect(series.map((p) => p.value)).toEqual([83, 83, 83, 80, 80]);
  });

  it('only looks before the range when the first day has no weigh-in of its own', async () => {
    const { repo, listForUser } = repoWith([log('first-day', 81, noon(0)), log('later', 80, noon(3))]);

    const series = await loadRawWeightSeries(repo, userId, buckets);

    expect(series.map((p) => p.value)).toEqual([81, 81, 81, 80, 80]);
    expect(listForUser).toHaveBeenCalledTimes(1);
  });
});
