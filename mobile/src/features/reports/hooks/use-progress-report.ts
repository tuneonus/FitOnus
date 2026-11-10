import { useQuery } from '@tanstack/react-query';
import { progressApi } from '@/features/progress/api/progress-api';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import type { ProgressReportResponse } from '@/features/progress/types/progress';

export function hasReportRecords(report?: ProgressReportResponse | null) {
  return (
    !!report &&
    (report.calories.length > 0 ||
      report.workouts.length > 0 ||
      !!report.stats.find((stat) => stat.label === 'Weight')?.note)
  );
}

export function useProgressReport(type: 'weekly' | 'monthly') {
  const userId = useAuthStore((s) => s.user?.id);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return useQuery({
    queryKey: ['dashboard', 'progress-report', userId, type, timezone],
    queryFn: () => progressApi.getProgressReport({ type, timezone }),
    enabled: !!userId,
  });
}
