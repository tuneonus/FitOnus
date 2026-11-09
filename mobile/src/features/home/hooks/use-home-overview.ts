import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { nutritionApi } from '@/features/nutrition/api/nutrition-api';
import { useNutritionStore } from '@/features/nutrition/store/nutritionStore';
import { buildHomeNutrition, localDateKey } from '../utils/home-overview';

export function useHomeOverview() {
  const [date, setDate] = useState(() => localDateKey());
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const cachedSummary = useNutritionStore((s) => s.dailySummary);
  const entries = useNutritionStore((s) => s.entries);
  const selectedDate = useNutritionStore((s) => s.selectedDate);
  const waterMl = useNutritionStore((s) => s.waterMl);
  const pendingSyncCount = useNutritionStore((s) => s.pendingSyncCount);
  const dashboard = useDashboard();
  const { dataUpdatedAt, refetch: refetchDashboard } = dashboard;
  // The dashboard prefix is invalidated by the existing meal/water/offline logging actions.
  // Read today independently, without changing the diary's selected date or writing its stores.
  const nutrition = useQuery({
    queryKey: ['dashboard', 'home-nutrition', date],
    queryFn: () => nutritionApi.getDailyNutrition(date),
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: 1,
  });

  useEffect(() => {
    const update = () => setDate(localDateKey());
    const timer = setInterval(update, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated && dataUpdatedAt > 0 && localDateKey(new Date(dataUpdatedAt)) !== date) {
      void refetchDashboard();
    }
  }, [date, isAuthenticated, dataUpdatedAt, refetchDashboard]);

  const overview = buildHomeNutrition({
    date,
    summary: nutrition.data ?? null,
    cachedSummary,
    entries,
    selectedDate,
    waterMl,
  });

  return {
    date,
    overview,
    dashboard,
    isLoading: nutrition.isLoading && !overview.available,
    isRefreshing: nutrition.isRefetching || dashboard.isRefetching,
    isError: nutrition.isError,
    pendingSyncCount,
    refresh: () => Promise.allSettled([nutrition.refetch(), dashboard.refetch()]),
  };
}
