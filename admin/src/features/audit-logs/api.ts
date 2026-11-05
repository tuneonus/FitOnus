import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';
import type { AuditLogItem, AuditLogsQuery } from './types';

export const auditLogsApi = {
  async listAuditLogs(
    params: AuditLogsQuery
  ): Promise<{ logs: AuditLogItem[]; meta: ApiResponse<unknown>['meta'] }> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.action) searchParams.set('action', params.action);

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const res = await apiClient<AuditLogItem[]>(`/audit-logs${query}`, {
      method: 'GET',
    });

    return {
      logs: res.data,
      meta: res.meta,
    };
  },
};

