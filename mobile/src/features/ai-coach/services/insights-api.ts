import { apiClient } from '@/services/api-client';
import type { CoachInsightsResponse } from '../types/coach';

export interface GetInsightsParams {
  timezone?: string | undefined;
  lang?: string | undefined;
  refresh?: boolean | undefined;
}

export const InsightsApi = {
  getInsights: async (params?: GetInsightsParams): Promise<CoachInsightsResponse> => {
    let tz = 'UTC';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      tz = 'UTC';
    }

    const response = await apiClient.get<{
      success: boolean;
      data: CoachInsightsResponse;
      message?: string;
    }>('/coach/insights', {
      params: {
        timezone: params?.timezone || tz,
        lang: params?.lang || 'en',
        refresh: params?.refresh ? 'true' : undefined,
      },
      timeout: 25_000,
    });

    if (!response.data?.data) {
      throw new Error('Invalid response received from AI coach insights service.');
    }

    return response.data.data;
  },
};

