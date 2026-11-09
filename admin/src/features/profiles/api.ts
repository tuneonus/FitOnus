import { apiClient } from '@/lib/api-client';
import type { AdminUserDetail, AdminUserActivity } from './types';

export const profilesApi = {
  async getUserDetail(id: string): Promise<AdminUserDetail> {
    const res = await apiClient<AdminUserDetail>(`/users/${id}`, {
      method: 'GET',
    });
    return res.data;
  },

  async getUserActivity(id: string): Promise<AdminUserActivity> {
    const res = await apiClient<AdminUserActivity>(`/users/${id}/activity`, {
      method: 'GET',
    });
    return res.data;
  },
};

