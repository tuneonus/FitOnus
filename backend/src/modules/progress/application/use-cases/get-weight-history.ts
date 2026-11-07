import { AppError } from '../../../../shared/errors/app-error.js';
import { calculateEma, type DataPoint } from '../../domain/ema-calculator.js';
import { getTimeRangeBuckets, type TimeRange } from '../../domain/calendar-bounds.js';
import type { IWeightRepository, UserWeightSummary } from '../ports.js';

export interface GetWeightHistoryInput {
  userId: string;
  range?: TimeRange;
  timezone?: string;
  limit?: number;
  offset?: number;
}

export interface GetWeightHistoryResult {
  summary: UserWeightSummary;
  points: DataPoint[];
  entries: {
    id: string;
    date: string;
    time?: string;
    value: number;
    source: 'manual' | 'synced';
    note?: string;
  }[];
  total: number;
}

export class GetWeightHistoryUseCase {
  constructor(private readonly weightRepo: IWeightRepository) {}

  async execute(input: GetWeightHistoryInput): Promise<GetWeightHistoryResult> {
    if (!input.userId) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const range: TimeRange = input.range ?? 'W';
    const timezone = input.timezone ?? 'UTC';
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);
    const offset = Math.max(input.offset ?? 0, 0);

    // 1. Fetch user summary
    const summary = await this.weightRepo.getUserWeightSummary(input.userId);

    // 2. Fetch paginated entries for list view
    const listRes = await this.weightRepo.listForUser(input.userId, { limit, offset });

    // 3. Compute time-series points with EMA smoothing
    const buckets = getTimeRangeBuckets(range, new Date(), timezone);
    const rangeStart = buckets[0]?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rangeEnd = buckets[buckets.length - 1]?.endDate ?? new Date();

    const rangeLogsRes = await this.weightRepo.listForUser(input.userId, {
      startDate: rangeStart,
      endDate: rangeEnd,
      limit: 500,
    });

    const rawPoints: DataPoint[] = [];
    let lastKnownWeight = summary.currentWeightKg ?? summary.startingWeightKg ?? 70.0;

    for (const b of buckets) {
      // Find logs falling within this bucket (chronologically)
      const inBucket = rangeLogsRes.logs.filter((l) => l.loggedAt >= b.startDate && l.loggedAt <= b.endDate);

      if (inBucket.length > 0) {
        // Latest log in bucket
        lastKnownWeight = inBucket[0]!.weightKg;
      }

      rawPoints.push({
        label: b.label,
        value: lastKnownWeight,
      });
    }

    // Apply EMA smoothing
    const smoothedPoints = calculateEma(rawPoints, { alpha: 0.1, decimals: 1 });

    // Format entries for mobile WeightEntry format
    const formattedEntries = listRes.logs.map((l) => ({
      id: l.id,
      date: formatDateShort(l.loggedAt),
      time: formatTimeShort(l.loggedAt),
      value: l.weightKg,
      source: l.source,
      note: l.notes ?? undefined,
    }));

    return {
      summary,
      points: smoothedPoints,
      entries: formattedEntries,
      total: listRes.total,
    };
  }
}

function formatDateShort(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function formatTimeShort(date: Date): string {
  let hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
}
