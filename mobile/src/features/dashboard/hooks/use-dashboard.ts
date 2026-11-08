import { useQuery } from '@tanstack/react-query';
import { DashboardService } from '../services/dashboard-service';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { queryClient } from '@/providers/query-provider';

export const DASHBOARD_QUERY_KEY = ['dashboard'] as const;

export const invalidateDashboard = () => {
  return queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
};

export const useDashboard = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: () => DashboardService.getDashboardData(),
    enabled: isAuthenticated, // Only fetch if user is authenticated
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });
};
