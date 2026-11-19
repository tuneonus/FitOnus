'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { dashboardApi } from '../api';
import type { EnhancedDashboardData, DashboardTimeframe } from '../types';
import {
  createTimeframeSwitcher,
  type TimeframeSwitcherState,
} from '../utils/timeframe-switcher';

export const DEFAULT_DASHBOARD_TIMEFRAME: DashboardTimeframe = '7d';

export function useDashboardStats() {
  const [data, setData] = useState<EnhancedDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switcherState, setSwitcherState] = useState<TimeframeSwitcherState>({
    selected: DEFAULT_DASHBOARD_TIMEFRAME,
    loaded: DEFAULT_DASHBOARD_TIMEFRAME,
    isSwitching: false,
    error: null,
  });

  const inFlightRef = useRef(false);
  const loadingRef = useRef(true);

  // Selecting a timeframe requests it from the backend. Only the member stats depend on it, so the
  // workout, nutrition and challenge cards are not refetched.
  const [switcher] = useState(() =>
    createTimeframeSwitcher({
      initial: DEFAULT_DASHBOARD_TIMEFRAME,
      fetchStats: (timeframe) => dashboardApi.getStats(timeframe),
      onStats: (userStats) =>
        setData((previous) => (previous ? { ...previous, userStats } : previous)),
      onState: setSwitcherState,
    }),
  );

  const fetchEnhancedStats = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        // Refresh the timeframe that is on screen, so the labels keep describing the data.
        const timeframe = switcher.getState().loaded;
        const result = await dashboardApi.getEnhancedDashboard(timeframe);
        // The admin switched timeframe while this was loading: these stats are for the old one.
        if (switcher.getState().loaded !== timeframe) return;
        setData(result);
        if (!opts.silent) {
          setError(null);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch dashboard metrics.',
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        loadingRef.current = false;
        inFlightRef.current = false;
      }
    },
    [switcher],
  );

  useEffect(() => {
    let isMounted = true;

    dashboardApi
      .getEnhancedDashboard(DEFAULT_DASHBOARD_TIMEFRAME)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to fetch dashboard metrics.',
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
          loadingRef.current = false;
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchEnhancedStats({ silent: true });
  }, [fetchEnhancedStats]);

  const setTimeframe = useCallback(
    (timeframe: DashboardTimeframe) => {
      // There is nothing to attach a different window to until the first load has finished.
      if (loadingRef.current) return;
      void switcher.select(timeframe);
    },
    [switcher],
  );

  return {
    data,
    /** What the selector shows as chosen. */
    timeframe: switcherState.selected,
    /** The timeframe the stats on screen were requested for; labels and totals follow this one. */
    loadedTimeframe: switcherState.loaded,
    setTimeframe,
    isLoading,
    isRefreshing: isRefreshing || switcherState.isSwitching,
    error,
    /** Why the last timeframe switch failed (the selection has already reverted), or null. */
    timeframeError: switcherState.error,
    refresh,
  };
}
