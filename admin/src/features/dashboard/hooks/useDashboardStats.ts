'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { dashboardApi } from '../api';
import type { EnhancedDashboardData, DashboardTimeframe } from '../types';

export function useDashboardStats() {
  const [data, setData] = useState<EnhancedDashboardData | null>(null);
  const [timeframe, setTimeframe] = useState<DashboardTimeframe>('7d');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef(false);

  const fetchEnhancedStats = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const result = await dashboardApi.getEnhancedDashboard();
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
        inFlightRef.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    dashboardApi
      .getEnhancedDashboard()
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

  return {
    data,
    timeframe,
    setTimeframe,
    isLoading,
    isRefreshing,
    error,
    refresh,
  };
}
