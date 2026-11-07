/**
 * GetAnalyticsOverview Application Use Case
 *
 * Consolidated multi-domain activity summary comparing the current 7-day period
 * against the prior 7-day period with goal-aware favorability indicators.
 */

import { AppError } from '../../../../shared/errors/app-error.js';
import {
  addDaysToDateString,
  formatLocalDate,
  generateDateSeries,
  getUtcBoundsForLocalDateRange,
  getZonedDateParts,
  validateTimezone,
} from '../../domain/analytics-period.js';
import { calculateWorkoutConsistency } from '../../domain/workout-metrics.js';
import { summarizeNutritionAnalytics } from '../../domain/nutrition-metrics.js';
import { summarizeHydrationAnalytics } from '../../domain/hydration-metrics.js';
import { calculateWeightVelocity, calculateGoalWeightProgress } from '../../domain/body-analytics-metrics.js';
import { calculateMetricComparison, type PeriodComparisonItem } from '../../domain/overview-metrics.js';
import type {
  IAnalyticsWorkoutRepository,
  IAnalyticsNutritionRepository,
  IAnalyticsBodyRepository,
} from '../ports.js';
import type { ActivityOverviewView } from '../dtos.js';
import { parseReferenceDate } from '../period-helper.js';

export interface GetAnalyticsOverviewInput {
  userId: string;
  timezone?: string | null;
  refDate?: string | null;
}

export class GetAnalyticsOverviewUseCase {
  constructor(
    private readonly workoutRepo: IAnalyticsWorkoutRepository,
    private readonly nutritionRepo: IAnalyticsNutritionRepository,
    private readonly bodyRepo: IAnalyticsBodyRepository,
  ) {}

  async execute(input: GetAnalyticsOverviewInput): Promise<ActivityOverviewView> {
    if (!input.userId || !input.userId.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const timezone = validateTimezone(input.timezone ?? undefined);
    const now = parseReferenceDate(input.refDate);

    // 1. Compute 7-day current window and 7-day prior window
    const todayParts = getZonedDateParts(now, timezone);
    const currEndStr = todayParts.dateString;
    const currStartStr = addDaysToDateString(currEndStr, -6);

    const prevEndStr = addDaysToDateString(currStartStr, -1);
    const prevStartStr = addDaysToDateString(prevEndStr, -6);

    const currDateSeries = generateDateSeries(currStartStr, currEndStr);
    const prevDateSeries = generateDateSeries(prevStartStr, prevEndStr);

    const { startUtc: totalStartUtc, endUtc: totalEndUtc } = getUtcBoundsForLocalDateRange(
      prevStartStr,
      currEndStr,
    );

    // 2. Fetch parallel data across repositories
    const [sessions, meals, water, weights, profileGoals] = await Promise.all([
      this.workoutRepo.getCompletedSessions(input.userId, totalStartUtc, totalEndUtc),
      this.nutritionRepo.getDailyMealAggregates(input.userId, prevStartStr, currEndStr),
      this.nutritionRepo.getDailyWaterAggregates(input.userId, prevStartStr, currEndStr),
      this.bodyRepo.getWeightLogs(input.userId, totalStartUtc, totalEndUtc),
      this.bodyRepo.getUserProfileGoals(input.userId),
    ]);

    // 3. Workouts aggregation
    const currSessions = sessions.filter((s) => {
      const d = formatLocalDate(s.startedAt, timezone);
      return d >= currStartStr && d <= currEndStr;
    });
    const prevSessions = sessions.filter((s) => {
      const d = formatLocalDate(s.startedAt, timezone);
      return d >= prevStartStr && d <= prevEndStr;
    });

    const currVol = Math.round(currSessions.reduce((acc, s) => acc + s.totalVolumeKg, 0) * 10) / 10;
    const prevVol = Math.round(prevSessions.reduce((acc, s) => acc + s.totalVolumeKg, 0) * 10) / 10;

    const currDurationMin = Math.round(currSessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60);

    const targetSessions = profileGoals?.workoutDaysPerWeek ?? 3;
    const consistencyPct = calculateWorkoutConsistency(currSessions.length, targetSessions);

    // 4. Nutrition aggregation
    const currMeals = meals.filter((m) => m.date >= currStartStr && m.date <= currEndStr);
    const prevMeals = meals.filter((m) => m.date >= prevStartStr && m.date <= prevEndStr);

    const currNut = summarizeNutritionAnalytics(
      currMeals,
      currDateSeries,
      profileGoals?.dailyCalorieTarget ?? null,
      profileGoals?.dailyProteinGrams ?? null,
    );
    const prevNut = summarizeNutritionAnalytics(
      prevMeals,
      prevDateSeries,
      profileGoals?.dailyCalorieTarget ?? null,
      profileGoals?.dailyProteinGrams ?? null,
    );

    const currLoggedDays = currMeals.filter((m) => m.mealCount > 0).length;
    const currProteinGrams = currNut.macroSplit.find((m) => m.label === 'Protein')?.grams ?? 0;
    const prevProteinGrams = prevNut.macroSplit.find((m) => m.label === 'Protein')?.grams ?? 0;

    // 5. Hydration aggregation
    const currWater = water.filter((w) => w.date >= currStartStr && w.date <= currEndStr);
    const prevWater = water.filter((w) => w.date >= prevStartStr && w.date <= prevEndStr);

    const currHyd = summarizeHydrationAnalytics(currWater, currDateSeries, 3000);
    const prevHyd = summarizeHydrationAnalytics(prevWater, prevDateSeries, 3000);

    // 6. Body composition aggregation
    const currWeights = weights.filter((w) => {
      const d = formatLocalDate(w.loggedAt, timezone);
      return d >= currStartStr && d <= currEndStr;
    });
    const prevWeights = weights.filter((w) => {
      const d = formatLocalDate(w.loggedAt, timezone);
      return d >= prevStartStr && d <= prevEndStr;
    });

    const currentWeightKg =
      currWeights.length > 0
        ? currWeights[currWeights.length - 1]!.weightKg
        : (profileGoals?.currentWeightKg ?? null);

    const prevWeightKg = prevWeights.length > 0 ? prevWeights[prevWeights.length - 1]!.weightKg : null;

    const startWeightKg = profileGoals?.startingWeightKg ?? null;
    const targetWeightKg = profileGoals?.targetWeightKg ?? null;

    const sortedWeights = [...weights].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
    const firstWeight = sortedWeights[0] ?? null;
    const lastWeight = sortedWeights[sortedWeights.length - 1] ?? null;
    const weeklyVelocityKg = calculateWeightVelocity(firstWeight, lastWeight);

    const progressPct = calculateGoalWeightProgress(startWeightKg, currentWeightKg, targetWeightKg);

    // 7. Comparative Analytics
    const comparisonVsPriorPeriod: PeriodComparisonItem[] = [
      calculateMetricComparison(currSessions.length, prevSessions.length, 'workouts'),
      calculateMetricComparison(currVol, prevVol, 'volume'),
      calculateMetricComparison(currNut.avgCalories, prevNut.avgCalories, 'calories', {
        primaryGoal: profileGoals?.primaryGoal,
      }),
      calculateMetricComparison(currHyd.avgWaterMl, prevHyd.avgWaterMl, 'water'),
      calculateMetricComparison(currProteinGrams, prevProteinGrams, 'protein'),
    ];

    if (currentWeightKg !== null && prevWeightKg !== null) {
      comparisonVsPriorPeriod.push(
        calculateMetricComparison(currentWeightKg, prevWeightKg, 'weight', {
          primaryGoal: profileGoals?.primaryGoal,
        }),
      );
    }

    // 8. Human-readable period label (e.g. "Oct 3 – Oct 9, 2026")
    const startParts = getZonedDateParts(parseReferenceDate(currStartStr), timezone);
    const endParts = todayParts;
    const periodLabel = `${startParts.monthShort} ${startParts.day} – ${endParts.monthShort} ${endParts.day}, ${endParts.year}`;

    return {
      period: periodLabel,
      workoutSummary: {
        completedSessions: currSessions.length,
        targetSessions,
        totalVolumeKg: currVol,
        totalDurationMinutes: currDurationMin,
        consistencyPct,
      },
      nutritionSummary: {
        avgCalories: currNut.avgCalories,
        targetCalories: currNut.targetCalories,
        avgProteinGrams: currProteinGrams,
        targetProteinGrams: profileGoals?.dailyProteinGrams ?? null,
        calorieAdherencePct: currNut.calorieAdherencePct,
        proteinAdherencePct: currNut.proteinAdherencePct,
        loggedDays: currLoggedDays,
      },
      hydrationSummary: {
        avgWaterMl: currHyd.avgWaterMl,
        targetWaterMl: currHyd.targetWaterMl,
        adherencePct: currHyd.adherencePct,
      },
      bodySummary: {
        currentWeightKg,
        startWeightKg,
        targetWeightKg,
        weeklyVelocityKg,
        progressPct,
      },
      comparisonVsPriorPeriod,
    };
  }
}
