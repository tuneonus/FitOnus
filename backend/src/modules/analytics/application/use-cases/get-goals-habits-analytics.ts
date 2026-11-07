/**
 * GetGoalsHabitsAnalytics Application Use Case
 *
 * Computes goal completion rates, habit streak metrics, and habit consistency heatmap.
 */

import { AppError } from '../../../../shared/errors/app-error.js';
import {
  addDaysToDateString,
  generateDateSeries,
  getZonedDateParts,
  validateTimezone,
} from '../../domain/analytics-period.js';
import { summarizeGoalsHabitsAnalytics } from '../../domain/goals-habits-metrics.js';
import type { IAnalyticsGoalsHabitsRepository } from '../ports.js';
import type { GoalsHabitsAnalyticsView } from '../dtos.js';
import { parseReferenceDate } from '../period-helper.js';

export interface GetGoalsHabitsAnalyticsInput {
  userId: string;
  windowDays?: number | null;
  timezone?: string | null;
  refDate?: string | null;
}

export class GetGoalsHabitsAnalyticsUseCase {
  constructor(private readonly goalsHabitsRepo: IAnalyticsGoalsHabitsRepository) {}

  async execute(input: GetGoalsHabitsAnalyticsInput): Promise<GoalsHabitsAnalyticsView> {
    if (!input.userId || !input.userId.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const timezone = validateTimezone(input.timezone ?? undefined);
    const now = parseReferenceDate(input.refDate);

    // Default 30-day window, clamped between 7 and 365 days
    const rawWindow = input.windowDays ?? 30;
    const windowDays = Math.max(7, Math.min(365, Number.isFinite(rawWindow) ? Math.round(rawWindow) : 30));

    const todayParts = getZonedDateParts(now, timezone);
    const todayStr = todayParts.dateString;
    const startStr = addDaysToDateString(todayStr, -(windowDays - 1));

    const dateSeries = generateDateSeries(startStr, todayStr);

    const [goals, habits] = await Promise.all([
      this.goalsHabitsRepo.getGoals(input.userId),
      this.goalsHabitsRepo.getHabitsWithCompletions(input.userId, startStr, todayStr),
    ]);

    const summary = summarizeGoalsHabitsAnalytics(goals, habits, dateSeries);

    return {
      goalStats: summary.goalStats,
      habitsSummary: summary.habitsSummary,
      overallHabitAdherencePct: summary.overallHabitAdherencePct,
      consistencyHeatmap: summary.consistencyHeatmap,
    };
  }
}
