import { captureUserSession, sessionSetter, registerUserStore } from '@/services/user-session';
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
import { onFitnessRefresh } from '@/services/fitness-refresh';
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

export const useProgressStore = create<ProgressState>((storeSet, get) => {
  const set = storeSet;
  return {
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
    },

    setRange: (range: TimeRange) => {
      set({ range });
    },

    fetchAnalytics: async (
      metric: MetricKey = get().metric,
      range: TimeRange = get().range,
      force = true,
    ) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
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
        if (!session.isCurrent()) return;

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
        if (!session.isCurrent()) return;
        logger.warn(`Failed to fetch analytics for ${metric} (${range}):`, err?.message);
        set({ isLoading: false, error: err?.message || 'Failed to load analytics data' });
      }
    },

    fetchPeriodComparison: async (period = 'month', force = true) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      if (!force && get().periodComparison && get().currentComparisonPeriod === period) {
        return;
      }

      try {
        const data = await progressApi.getPeriodComparison({
          period,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        });
        if (!session.isCurrent()) return;
        if (data) {
          set({ periodComparison: data, currentComparisonPeriod: period });
        }
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to fetch period comparison:', err?.message);
      }
    },

    fetchAchievements: async (_force = true) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      try {
        const data = await progressApi.getAchievements();
        if (!session.isCurrent()) return;
        if (data && data.achievements) {
          set({ achievements: data.achievements });
        }
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to fetch achievements from server:', err?.message);
      }
    },

    fetchReports: async (_force = true) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      try {
        const [weekly, monthly] = await Promise.allSettled([
          progressApi.getProgressReport({ type: 'weekly' }),
          progressApi.getProgressReport({ type: 'monthly' }),
        ]);
        if (!session.isCurrent()) return;

        set({
          weeklyReport: weekly.status === 'fulfilled' ? weekly.value : get().weeklyReport,
          monthlyReport: monthly.status === 'fulfilled' ? monthly.value : get().monthlyReport,
        });
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to fetch reports:', err?.message);
      }
    },

    refreshAll: async () => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      set({ isRefreshing: true });
      try {
        const currentPeriod = get().range === 'W' ? 'week' : 'month';
        await Promise.allSettled([
          get().fetchAnalytics(get().metric, get().range, true),
          get().fetchPeriodComparison(currentPeriod, true),
          get().fetchAchievements(true),
          get().fetchReports(true),
        ]);
        if (!session.isCurrent()) return;
      } finally {
        set({ isRefreshing: false });
      }
    },
  };
});

registerUserStore(useProgressStore);

onFitnessRefresh(() => {
  const state = useProgressStore.getState();
  for (const key of Object.keys(state.analyticsData)) {
    const [metric, range] = key.split('-');
    void state.fetchAnalytics(metric as MetricKey, range as TimeRange, true).catch(() => {});
  }
  if (state.periodComparison)
    void state
      .fetchPeriodComparison(state.currentComparisonPeriod ?? 'month', true)
      .catch(() => {});
  if (state.achievements.length) void state.fetchAchievements(true).catch(() => {});
});
