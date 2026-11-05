import { apiClient } from '@/lib/api-client';
import type { DashboardStats } from './types';

export const dashboardApi = {
  async getStats(): Promise<DashboardStats> {
    const res = await apiClient<DashboardStats>('/dashboard/stats', {
      method: 'GET',
    });
    return res.data;
  },
};

