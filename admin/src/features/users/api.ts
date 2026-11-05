import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';
import type { AdminUserListItem, UserListQuery } from './types';

export const usersApi = {
  async listUsers(
    params: UserListQuery
  ): Promise<{ users: AdminUserListItem[]; meta: ApiResponse<unknown>['meta'] }> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.search) searchParams.set('search', params.search);
    if (params.status) searchParams.set('status', params.status);
    if (params.role) searchParams.set('role', params.role);
    if (params.onboarding) searchParams.set('onboarding', params.onboarding);
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.order) searchParams.set('order', params.order);

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const res = await apiClient<AdminUserListItem[]>(`/users${query}`, {
      method: 'GET',
    });

    return {
      users: res.data,
      meta: res.meta,
    };
  },

  async suspendUser(id: string, reason?: string): Promise<unknown> {
    const res = await apiClient(`/users/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || undefined }),
    });
    return res.data;
  },

  async reactivateUser(id: string, reason?: string): Promise<unknown> {
    const res = await apiClient(`/users/${id}/reactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || undefined }),
    });
    return res.data;
  },
};

