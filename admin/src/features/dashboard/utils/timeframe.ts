import type { DashboardStats, DashboardTimeframe, RegistrationTrendPoint } from '../types';

export const TIMEFRAME_DAYS: Record<DashboardTimeframe, number> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
};

export const timeframeLabel = (timeframe: DashboardTimeframe) => timeframe.toUpperCase();

export interface TimeframeSummary {
  /** The daily registration trend exactly as the backend returned it for the requested timeframe. */
  trend: RegistrationTrendPoint[];
  newRegistrations: number;
  activeUsers: number;
  /** The backend only counts activity over 7 or 30 days, so this can be shorter than the timeframe. */
  activeWindowDays: 7 | 30;
  activeWindowLabel: '7D' | '30D';
  /** True when the active-user count covers a shorter window than the selected timeframe. */
  activeWindowIsShorter: boolean;
}

/**
 * Reads the figures for `timeframe` out of a stats response that was requested for that same timeframe.
 *
 * The trend is rendered as returned (no client-side slicing). Registration totals use the backend's own
 * 7-day and 30-day counters, and for 14 and 90 days are the sum of the returned daily trend, so each number
 * always matches the window it is labelled with. Activity is only available for 7 or 30 days.
 */
export function summarizeTimeframe(
  stats: DashboardStats,
  timeframe: DashboardTimeframe,
): TimeframeSummary {
  const trend = stats.registrationTrend;
  const trendTotal = trend.reduce((total, point) => total + point.count, 0);

  const newRegistrations =
    timeframe === '7d'
      ? stats.newRegistrations7d
      : timeframe === '30d'
        ? stats.newRegistrations30d
        : trendTotal;

  const activeWindowDays = timeframe === '7d' ? 7 : 30;
  const activeUsers = activeWindowDays === 7 ? stats.activeUsers7d : stats.activeUsers30d;

  return {
    trend,
    newRegistrations,
    activeUsers,
    activeWindowDays,
    activeWindowLabel: activeWindowDays === 7 ? '7D' : '30D',
    activeWindowIsShorter: activeWindowDays < TIMEFRAME_DAYS[timeframe],
  };
}
