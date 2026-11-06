import { create } from 'zustand';
import type { TimeRange } from '@/shared/types/health';
import type {
  AchievementItem,
  MetricKey,
  PeriodComparisonResponse,
  ProgressAnalyticsResponse,
  ProgressReportResponse,
} from '@/features/progress/types/progress';
import { progressApi } from '@/features/progress/api/progress-api';
import { logger } from '@/utils/logger';

export interface ProgressState {
  metric: MetricKey;
  range: TimeRange;
  analyticsData: Record<string, ProgressAnalyticsResponse>;
  periodComparison: PeriodComparisonResponse | null;
  currentComparisonPeriod: 'month' | 'week' | null;
  achievements: AchievementItem[];
  weeklyReport: ProgressReportResponse | null;
  monthlyReport: ProgressReportResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  setMetric: (metric: MetricKey) => void;
  setRange: (range: TimeRange) => void;
  fetchAnalytics: (metric?: MetricKey, range?: TimeRange, force?: boolean) => Promise<void>;
  fetchPeriodComparison: (period?: 'month' | 'week', force?: boolean) => Promise<void>;
  fetchAchievements: (force?: boolean) => Promise<void>;
  fetchReports: (force?: boolean) => Promise<void>;
  refreshAll: () => Promise<void>;
  resetStore: () => void;
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  metric: 'weight',
  range: 'M',
  analyticsData: {},
  periodComparison: null,
  currentComparisonPeriod: null,
  achievements: [],
  weeklyReport: null,
  monthlyReport: null,
  isLoading: false,
  isRefreshing: false,
  error: null,

  resetStore: () => {
    set({
      analyticsData: {},
      periodComparison: null,
      currentComparisonPeriod: null,
      achievements: [],
      weeklyReport: null,
      monthlyReport: null,
      isLoading: false,
      isRefreshing: false,
      error: null,
    });
  },

  setMetric: (metric: MetricKey) => {
    set({ metric });
    get().fetchAnalytics(metric, get().range).catch(() => {});
  },

  setRange: (range: TimeRange) => {
    set({ range });
    get().fetchAnalytics(get().metric, range).catch(() => {});
  },

  fetchAnalytics: async (
    metric: MetricKey = get().metric,
    range: TimeRange = get().range,
    force = false,
  ) => {
    const key = `${metric}-${range}`;
    if (!force && get().analyticsData[key]) {
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const data = await progressApi.getAnalytics({
        metric,
        range,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });

      if (data) {
        set({
          analyticsData: {
            ...get().analyticsData,
            [key]: data,
          },
          isLoading: false,
        });
      }
    } catch (err: any) {
      logger.warn(`Failed to fetch analytics for ${metric} (${range}):`, err?.message);
      set({ isLoading: false, error: err?.message || 'Failed to load analytics data' });
    }
  },

  fetchPeriodComparison: async (period = 'month', force = false) => {
    if (!force && get().periodComparison && get().currentComparisonPeriod === period) {
      return;
    }

    try {
      const data = await progressApi.getPeriodComparison({
        period,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
      if (data) {
        set({ periodComparison: data, currentComparisonPeriod: period });
      }
    } catch (err: any) {
      logger.warn('Failed to fetch period comparison:', err?.message);
    }
  },

  fetchAchievements: async (_force = false) => {
    try {
      const data = await progressApi.getAchievements();
      if (data && data.achievements) {
        set({ achievements: data.achievements });
      }
    } catch (err: any) {
      logger.warn('Failed to fetch achievements from server:', err?.message);
    }
  },

  fetchReports: async (_force = false) => {
    try {
      const [weekly, monthly] = await Promise.allSettled([
        progressApi.getProgressReport({ type: 'weekly' }),
        progressApi.getProgressReport({ type: 'monthly' }),
      ]);

      set({
        weeklyReport: weekly.status === 'fulfilled' ? weekly.value : get().weeklyReport,
        monthlyReport: monthly.status === 'fulfilled' ? monthly.value : get().monthlyReport,
      });
    } catch (err: any) {
      logger.warn('Failed to fetch reports:', err?.message);
    }
  },

  refreshAll: async () => {
    set({ isRefreshing: true });
    try {
      const currentPeriod = get().range === 'W' ? 'week' : 'month';
      await Promise.allSettled([
        get().fetchAnalytics(get().metric, get().range, true),
        get().fetchPeriodComparison(currentPeriod, true),
        get().fetchAchievements(true),
        get().fetchReports(true),
      ]);
    } finally {
      set({ isRefreshing: false });
    }
  },
}));
