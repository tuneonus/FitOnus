import { useQuery } from '@tanstack/react-query';
import { InsightsApi } from '../services/insights-api';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { queryClient } from '@/providers/query-provider';
import type { CoachInsightsResponse } from '../types/coach';

export const COACH_INSIGHTS_QUERY_KEY = ['coach-insights'] as const;

export const invalidateCoachInsights = () => {
  return queryClient.invalidateQueries({ queryKey: COACH_INSIGHTS_QUERY_KEY });
};

export interface UseCoachInsightsOptions {
  lang?: string | undefined;
  enabled?: boolean | undefined;
}

export const useCoachInsights = (options?: UseCoachInsightsOptions) => {
  const userId = useAuthStore((state) => state.user?.id);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery<CoachInsightsResponse, Error>({
    queryKey: [...COACH_INSIGHTS_QUERY_KEY, userId, options?.lang || 'en'],
    queryFn: () => InsightsApi.getInsights({ lang: options?.lang }),
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 1000 * 60 * 15,
    retry: 1,
  });
};
