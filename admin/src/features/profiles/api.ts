import { apiClient } from '@/lib/api-client';
import type { AdminUserDetail } from './types';

export const profilesApi = {
  async getUserDetail(id: string): Promise<AdminUserDetail> {
    const res = await apiClient<AdminUserDetail>(`/users/${id}`, {
      method: 'GET',
    });
    return res.data;
  },
};

