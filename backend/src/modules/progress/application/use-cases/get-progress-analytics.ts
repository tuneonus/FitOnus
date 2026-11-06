import { AppError } from '../../../../shared/errors/app-error.js';
import { calculateEma } from '../../domain/ema-calculator.js';
import { getTimeRangeBuckets, type TimeRange } from '../../domain/calendar-bounds.js';
import type { IProgressTelemetryPort, IWeightRepository } from '../ports.js';

export type MetricKey = 'weight' | 'calories' | 'sleep' | 'protein' | 'workouts' | 'recovery' | 'steps' | 'water';

export interface GetProgressAnalyticsInput {
  userId: string;
  metric: MetricKey;
  range?: TimeRange;
  timezone?: string;
}

export interface ProgressAnalyticsResult {
  metric: MetricKey;
  label: string;
  unit: string;
  chart: 'line' | 'bar';
  lowerIsBetter?: boolean;
  hasDeviceData: boolean;
  goal?: number;
  firstValue: number;
  latestValue: number;
  delta: number;
  points: { label: string; value: number }[];
}

export class GetProgressAnalyticsUseCase {
  constructor(
    private readonly weightRepo: IWeightRepository,
    private readonly telemetryPort: IProgressTelemetryPort,
  ) {}

  async execute(input: GetProgressAnalyticsInput): Promise<ProgressAnalyticsResult> {
    if (!input.userId) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const range: TimeRange = input.range ?? 'M';
    const timezone = input.timezone ?? 'UTC';
    const goals = await this.telemetryPort.getProfileGoals(input.userId);

    // 1. Wearable-dependent metrics without backend sync
    if (input.metric === 'sleep' || input.metric === 'recovery' || input.metric === 'steps') {
      const metadata = getMetricMetadata(input.metric, goals?.primaryGoal);
      return {
        metric: input.metric,
        label: metadata.label,
        unit: metadata.unit,
        chart: metadata.chart,
        lowerIsBetter: metadata.lowerIsBetter,
        hasDeviceData: false,
        goal: metadata.defaultGoal,
        firstValue: 0,
        latestValue: 0,
        delta: 0,
        points: [],
      };
    }

    // 2. Calendar buckets
    const now = new Date();
    const buckets = getTimeRangeBuckets(range, now, timezone);
    const rangeStart = buckets[0]?.startDate ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const rangeEnd = buckets[buckets.length - 1]?.endDate ?? now;

    // 3. Compute metric-specific series
    if (input.metric === 'weight') {
      const summary = await this.weightRepo.getUserWeightSummary(input.userId);
      const rangeLogs = await this.weightRepo.listForUser(input.userId, {
        startDate: rangeStart,
        endDate: rangeEnd,
        limit: 500,
      });

      const rawPoints: { label: string; value: number }[] = [];
      let lastKnown = summary.currentWeightKg ?? summary.startingWeightKg ?? 70.0;

      for (const b of buckets) {
        const inBucket = rangeLogs.logs.filter((l) => l.loggedAt >= b.startDate && l.loggedAt <= b.endDate);
        if (inBucket.length > 0) {
          lastKnown = inBucket[0]!.weightKg;
        }
        rawPoints.push({ label: b.label, value: lastKnown });
      }

      const points = calculateEma(rawPoints, { alpha: 0.1, decimals: 1 });
      const first = points[0]?.value ?? 0;
      const latest = points[points.length - 1]?.value ?? 0;
      const delta = Math.round((latest - first) * 10) / 10;
      const lowerIsBetter = goals?.primaryGoal !== 'gain';

      return {
        metric: 'weight',
        label: 'Weight',
        unit: 'kg',
        chart: 'line',
        lowerIsBetter,
        hasDeviceData: true,
        goal: goals?.targetWeightKg ?? undefined,
        firstValue: first,
        latestValue: latest,
        delta,
        points,
      };
    }

    if (input.metric === 'workouts') {
      const sessions = await this.telemetryPort.getWorkoutSessions(input.userId, rangeStart, rangeEnd);
      const points = buckets.map((b) => {
        const inBucket = sessions.filter((s) => s.startedAt >= b.startDate && s.startedAt <= b.endDate);
        return {
          label: b.label,
          value: inBucket.length,
        };
      });

      const first = points[0]?.value ?? 0;
      const latest = points[points.length - 1]?.value ?? 0;
      const delta = latest - first;

      return {
        metric: 'workouts',
        label: 'Workouts',
        unit: 'sessions',
        chart: 'bar',
        hasDeviceData: true,
        goal: goals?.workoutDaysPerWeek ?? undefined,
        firstValue: first,
        latestValue: latest,
        delta,
        points,
      };
    }

    if (input.metric === 'calories' || input.metric === 'protein') {
      const startStr = rangeStart.toISOString().slice(0, 10);
      const endStr = rangeEnd.toISOString().slice(0, 10);
      const aggregates = await this.telemetryPort.getNutritionAggregates(input.userId, startStr, endStr);

      const points = buckets.map((b) => {
        const inBucket = aggregates.filter(
          (a) => a.date >= b.startDate.toISOString().slice(0, 10) && a.date <= b.endDate.toISOString().slice(0, 10),
        );

        // DATA INTEGRITY: Distinguish missing logs from zero intake!
        // Only average across days that were actually logged.
        if (inBucket.length === 0) {
          return { label: b.label, value: 0 };
        }

        const sum = inBucket.reduce(
          (acc, cur) => acc + (input.metric === 'calories' ? cur.totalCalories : cur.totalProteinG),
          0,
        );
        const avg = Math.round(sum / inBucket.length);
        return { label: b.label, value: avg };
      });

      const first = points[0]?.value ?? 0;
      const latest = points[points.length - 1]?.value ?? 0;
      const delta = latest - first;
      const isCalories = input.metric === 'calories';

      return {
        metric: input.metric,
        label: isCalories ? 'Calories' : 'Protein',
        unit: isCalories ? 'kcal' : 'g',
        chart: 'bar',
        hasDeviceData: true,
        goal: (isCalories ? goals?.dailyCalorieTarget : goals?.dailyProteinGrams) ?? undefined,
        firstValue: first,
        latestValue: latest,
        delta,
        points,
      };
    }

    if (input.metric === 'water') {
      const startStr = rangeStart.toISOString().slice(0, 10);
      const endStr = rangeEnd.toISOString().slice(0, 10);
      const totals = await this.telemetryPort.getWaterTotals(input.userId, startStr, endStr);

      const points = buckets.map((b) => {
        const inBucket = totals.filter(
          (t) => t.date >= b.startDate.toISOString().slice(0, 10) && t.date <= b.endDate.toISOString().slice(0, 10),
        );

        if (inBucket.length === 0) {
          return { label: b.label, value: 0 };
        }

        const sum = inBucket.reduce((acc, cur) => acc + cur.totalMl, 0);
        // If daily view: exact ml. If multi-day bucket: average ml per logged day
        const avg = Math.round(sum / inBucket.length);
        return { label: b.label, value: avg };
      });

      const first = points[0]?.value ?? 0;
      const latest = points[points.length - 1]?.value ?? 0;
      const delta = latest - first;

      return {
        metric: 'water',
        label: 'Water',
        unit: 'ml',
        chart: 'bar',
        hasDeviceData: true,
        goal: 3000,
        firstValue: first,
        latestValue: latest,
        delta,
        points,
      };
    }

    throw new AppError('validation', 'VALIDATION_FAILED', `Unsupported metric: ${input.metric}`);
  }
}

function getMetricMetadata(
  metric: MetricKey,
  goalType?: string | null,
): { label: string; unit: string; chart: 'line' | 'bar'; lowerIsBetter?: boolean; defaultGoal?: number } {
  switch (metric) {
    case 'sleep':
      return { label: 'Sleep', unit: 'h', chart: 'bar', defaultGoal: 7.5 };
    case 'recovery':
      return { label: 'Recovery', unit: '', chart: 'line' };
    case 'steps':
      return { label: 'Steps', unit: 'steps', chart: 'bar', defaultGoal: 10000 };
    case 'weight':
      return { label: 'Weight', unit: 'kg', chart: 'line', lowerIsBetter: goalType !== 'gain' };
    default:
      return { label: metric, unit: '', chart: 'bar' };
  }
}
