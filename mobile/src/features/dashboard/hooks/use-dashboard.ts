import { useQuery } from '@tanstack/react-query';
import { DashboardService } from '../services/dashboard-service';
import { useAuthStore } from '@/features/auth/stores/auth-store';

export const useDashboard = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => DashboardService.getDashboardData(),
    enabled: isAuthenticated, // Only fetch if user is authenticated
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });
};
