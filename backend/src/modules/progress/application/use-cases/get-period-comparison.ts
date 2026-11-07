import { AppError } from '../../../../shared/errors/app-error.js';
import { getZonedDateParts } from '../../domain/calendar-bounds.js';
import type { IProgressTelemetryPort, IWeightRepository } from '../ports.js';

export interface GetPeriodComparisonInput {
  userId: string;
  period?: 'month' | 'week';
  timezone?: string;
}

export interface ComparisonItem {
  label: string;
  current: string;
  previous: string;
  better: boolean;
}

export interface PeriodComparisonResult {
  title: string;
  comparisons: ComparisonItem[];
}

export class GetPeriodComparisonUseCase {
  constructor(
    private readonly weightRepo: IWeightRepository,
    private readonly telemetryPort: IProgressTelemetryPort,
  ) {}

  async execute(input: GetPeriodComparisonInput): Promise<PeriodComparisonResult> {
    if (!input.userId) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const timezone = input.timezone ?? 'UTC';
    const now = new Date();
    const parts = getZonedDateParts(now, timezone);
    const goals = await this.telemetryPort.getProfileGoals(input.userId);
    const goalType = goals?.primaryGoal ?? 'lose';

    let title: string;
    let currStart: Date;
    let currEnd: Date;
    let prevStart: Date;
    let prevEnd: Date;

    if (input.period === 'week') {
      // Current 7 days vs previous 7 days
      currEnd = now;
      currStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevEnd = currStart;
      prevStart = new Date(currStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      title = 'This Week vs Last Week';
    } else {
      // Month-over-Month
      // Current month: 1st of current month to now
      currStart = new Date(Date.UTC(parts.year, parts.month - 1, 1));
      currEnd = now;

      // Previous month: 1st of prev month to end of prev month
      const prevYear = parts.month === 1 ? parts.year - 1 : parts.year;
      const prevMonth = parts.month === 1 ? 12 : parts.month - 1;
      prevStart = new Date(Date.UTC(prevYear, prevMonth - 1, 1));
      prevEnd = new Date(Date.UTC(parts.year, parts.month - 1, 1, 0, 0, 0, -1));

      const currMonthName = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(
        currStart,
      );
      const prevMonthName = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(
        prevStart,
      );
      title = `${currMonthName} vs ${prevMonthName}`;
    }

    // 1. Workouts comparison
    const currSessions = await this.telemetryPort.getWorkoutSessions(input.userId, currStart, currEnd);
    const prevSessions = await this.telemetryPort.getWorkoutSessions(input.userId, prevStart, prevEnd);
    const currWorkoutsCount = currSessions.length;
    const prevWorkoutsCount = prevSessions.length;
    const workoutsBetter = currWorkoutsCount >= prevWorkoutsCount;

    // 2. Weight change comparison
    const currLogs = await this.weightRepo.listForUser(input.userId, {
      startDate: currStart,
      endDate: currEnd,
      limit: 100,
    });
    const prevLogs = await this.weightRepo.listForUser(input.userId, {
      startDate: prevStart,
      endDate: prevEnd,
      limit: 100,
    });

    const currDelta = calculateNetDelta(currLogs.logs);
    const prevDelta = calculateNetDelta(prevLogs.logs);
    const weightBetter = evaluateWeightProgress(currDelta, prevDelta, goalType);

    // 3. Nutrition averages (calories & protein on logged days)
    const currNutr = await this.telemetryPort.getNutritionAggregates(
      input.userId,
      currStart.toISOString().slice(0, 10),
      currEnd.toISOString().slice(0, 10),
    );
    const prevNutr = await this.telemetryPort.getNutritionAggregates(
      input.userId,
      prevStart.toISOString().slice(0, 10),
      prevEnd.toISOString().slice(0, 10),
    );

    const currAvgProtein = calculateDailyAverage(currNutr.map((n) => n.totalProteinG));
    const prevAvgProtein = calculateDailyAverage(prevNutr.map((n) => n.totalProteinG));
    const proteinBetter = currAvgProtein >= prevAvgProtein;

    const currAvgCalories = calculateDailyAverage(currNutr.map((n) => n.totalCalories));
    const prevAvgCalories = calculateDailyAverage(prevNutr.map((n) => n.totalCalories));
    const caloriesBetter =
      goalType === 'lose' ? currAvgCalories <= prevAvgCalories : currAvgCalories >= prevAvgCalories;

    const comparisons: ComparisonItem[] = [
      {
        label: 'Workouts',
        current: `${currWorkoutsCount}`,
        previous: `${prevWorkoutsCount}`,
        better: workoutsBetter,
      },
      {
        label: 'Weight change',
        current: formatDelta(currDelta),
        previous: formatDelta(prevDelta),
        better: weightBetter,
      },
      {
        label: 'Avg sleep',
        current: '—',
        previous: '—',
        better: true,
      },
      {
        label: 'Avg protein',
        current: currAvgProtein > 0 ? `${currAvgProtein} g` : '—',
        previous: prevAvgProtein > 0 ? `${prevAvgProtein} g` : '—',
        better: proteinBetter,
      },
      {
        label: 'Avg calories',
        current: currAvgCalories > 0 ? `${currAvgCalories.toLocaleString()} kcal` : '—',
        previous: prevAvgCalories > 0 ? `${prevAvgCalories.toLocaleString()} kcal` : '—',
        better: caloriesBetter,
      },
    ];

    return {
      title,
      comparisons,
    };
  }
}

function calculateNetDelta(logs: { weightKg: number }[]): number | null {
  if (logs.length < 2) return null;
  // logs are sorted in DESC order (latest is logs[0], earliest is logs[length-1])
  const latest = logs[0]!.weightKg;
  const earliest = logs[logs.length - 1]!.weightKg;
  return Math.round((latest - earliest) * 10) / 10;
}

function evaluateWeightProgress(
  currDelta: number | null,
  prevDelta: number | null,
  goalType: string,
): boolean {
  if (currDelta === null) return true;
  if (goalType === 'gain') {
    // For muscle gain: positive weight delta is better
    return currDelta > 0;
  }
  if (goalType === 'maintain') {
    // For maintenance: smaller absolute deviation is better
    const prevAbs = prevDelta !== null ? Math.abs(prevDelta) : 999;
    return Math.abs(currDelta) <= prevAbs;
  }
  // Default 'lose': negative weight delta is better
  return currDelta <= 0;
}

function calculateDailyAverage(values: number[]): number {
  if (!values || values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

function formatDelta(delta: number | null): string {
  if (delta === null) return '—';
  if (delta > 0) return `+${delta.toFixed(1)} kg`;
  if (delta < 0) return `−${Math.abs(delta).toFixed(1)} kg`;
  return '0.0 kg';
}
