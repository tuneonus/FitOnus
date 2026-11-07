/**
 * FitOnus Advanced Analytics Formatters & Query Helpers
 *
 * Pure functions for URL query construction, timezone resolution,
 * and chart point / comparison transformation.
 */

import type {
  ActivityOverviewView,
  AnalyticsQueryParams,
  GoalsHabitsQueryParams,
  HydrationQueryParams,
  PeriodComparisonItem,
} from '../types/analytics';

export function resolveClientTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && typeof tz === 'string' && tz.trim().length > 0) {
      return tz;
    }
  } catch {
    // Fallback to UTC if timezone detection fails
  }
  return 'UTC';
}

export function buildAnalyticsQuery(
  params?: AnalyticsQueryParams | HydrationQueryParams | GoalsHabitsQueryParams
): Record<string, string | number> {
  const query: Record<string, string | number> = {
    timezone: params?.timezone || resolveClientTimezone(),
  };

  if (params?.refDate) {
    query.refDate = params.refDate;
  }

  if ('range' in (params || {}) && (params as AnalyticsQueryParams)?.range) {
    query.range = (params as AnalyticsQueryParams).range!;
  }

  if ('targetMl' in (params || {}) && (params as HydrationQueryParams)?.targetMl) {
    query.targetMl = (params as HydrationQueryParams).targetMl!;
  }

  if ('windowDays' in (params || {}) && (params as GoalsHabitsQueryParams)?.windowDays) {
    query.windowDays = (params as GoalsHabitsQueryParams).windowDays!;
  }

  return query;
}

export function formatComparisonValue(item: PeriodComparisonItem): {
  currentFormatted: string;
  priorFormatted: string;
} {
  const k = item.key.toLowerCase();
  if (k.includes('weight')) {
    return {
      currentFormatted: `${item.currentValue.toFixed(1)} kg`,
      priorFormatted: `${item.priorValue.toFixed(1)} kg`,
    };
  }
  if (k.includes('cal')) {
    return {
      currentFormatted: `${Math.round(item.currentValue).toLocaleString()} kcal`,
      priorFormatted: `${Math.round(item.priorValue).toLocaleString()} kcal`,
    };
  }
  if (k.includes('pro')) {
    return {
      currentFormatted: `${Math.round(item.currentValue)} g`,
      priorFormatted: `${Math.round(item.priorValue)} g`,
    };
  }
  if (k.includes('water') || k.includes('hydration')) {
    return {
      currentFormatted: `${(item.currentValue / 1000).toFixed(1)} L`,
      priorFormatted: `${(item.priorValue / 1000).toFixed(1)} L`,
    };
  }
  return {
    currentFormatted: item.currentValue.toLocaleString(),
    priorFormatted: item.priorValue.toLocaleString(),
  };
}

export function formatOverviewSummary(overview: ActivityOverviewView): {
  sessionsCompleted: number;
  calorieAdherencePct: number;
  waterAdherencePct: number;
  weeklyVelocityKg: number;
} {
  return {
    sessionsCompleted: overview.workoutSummary.completedSessions,
    calorieAdherencePct: overview.nutritionSummary.calorieAdherencePct,
    waterAdherencePct: overview.hydrationSummary.adherencePct,
    weeklyVelocityKg: overview.bodySummary.weeklyVelocityKg,
  };
}

