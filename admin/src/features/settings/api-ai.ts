import { apiClient } from '@/lib/api-client';
import type {
  GeminiConfigResponse,
  UpdateGeminiConfigPayload,
  TestGeminiConnectionPayload,
  TestGeminiConnectionResponse,
  RollbackGeminiKeyPayload,
  GeminiModelInfo,
  GeminiUsageSummaryResponse,
  FeatureUsageBreakdown,
  ModelUsageBreakdown,
  DailyUsageTrend,
  GeminiUsageEventsResponse,
} from './types-ai';

export const geminiAdminApi = {
  /**
   * Fetches active Gemini configuration (masked key, resolved models, version).
   */
  async getConfiguration(): Promise<GeminiConfigResponse> {
    const res = await apiClient<GeminiConfigResponse>('/ai/configuration');
    return res.data;
  },

  /**
   * Updates Gemini configuration (encrypted key, default and per-feature model overrides)
   * with optimistic concurrency version control.
   */
  async updateConfiguration(payload: UpdateGeminiConfigPayload): Promise<GeminiConfigResponse> {
    const res = await apiClient<GeminiConfigResponse>('/ai/configuration', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  /**
   * Tests connection to Google Gemini API with candidate key or active key.
   */
  async testConnection(payload: TestGeminiConnectionPayload = {}): Promise<TestGeminiConnectionResponse> {
    const res = await apiClient<TestGeminiConnectionResponse>('/ai/test-connection', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  /**
   * Rolls back to previous working API key.
   */
  async rollbackKey(payload: RollbackGeminiKeyPayload = {}): Promise<GeminiConfigResponse> {
    const res = await apiClient<GeminiConfigResponse>('/ai/rollback-key', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  /**
   * Lists supported Gemini models with token pricing per million.
   */
  async getModels(): Promise<GeminiModelInfo[]> {
    const res = await apiClient<GeminiModelInfo[]>('/ai/models');
    return res.data;
  },

  /**
   * Retrieves high-level token consumption and estimated API cost summary.
   */
  async getUsageSummary(): Promise<GeminiUsageSummaryResponse> {
    const res = await apiClient<GeminiUsageSummaryResponse>('/ai/usage/summary');
    return res.data;
  },

  /**
   * Retrieves token and cost breakdown per feature.
   */
  async getUsageByFeature(): Promise<FeatureUsageBreakdown[]> {
    const res = await apiClient<FeatureUsageBreakdown[]>('/ai/usage/by-feature');
    return res.data;
  },

  /**
   * Retrieves token and cost breakdown per Gemini model.
   */
  async getUsageByModel(): Promise<ModelUsageBreakdown[]> {
    const res = await apiClient<ModelUsageBreakdown[]>('/ai/usage/by-model');
    return res.data;
  },

  /**
   * Retrieves daily request, token, and cost trends for past N days.
   */
  async getDailyTrends(days: number = 30): Promise<DailyUsageTrend[]> {
    const res = await apiClient<DailyUsageTrend[]>(`/ai/usage/trends?days=${days}`);
    return res.data;
  },

  /**
   * Retrieves paginated telemetry request events.
   */
  async getUsageEvents(params: {
    limit?: number;
    offset?: number;
    feature?: string;
  } = {}): Promise<GeminiUsageEventsResponse> {
    const search = new URLSearchParams();
    if (params.limit) search.set('limit', String(params.limit));
    if (params.offset) search.set('offset', String(params.offset));
    if (params.feature) search.set('feature', params.feature);

    const query = search.toString();
    const endpoint = query ? `/ai/usage?${query}` : '/ai/usage';
    const res = await apiClient<GeminiUsageEventsResponse>(endpoint);
    return res.data;
  },
};
