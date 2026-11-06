import { apiClient } from '@/services/api-client';
import type { TimeRange } from '@/shared/types/health';
import type {
  AchievementsResponse,
  LogMeasurementInput,
  LogMeasurementResponse,
  LogWeightInput,
  LogWeightResponse,
  MeasurementHistoryResponse,
  MetricKey,
  PeriodComparisonResponse,
  ProgressAnalyticsResponse,
  ProgressReportResponse,
  UpdateWeightInput,
  WeightHistoryResponse,
} from '../types/progress';
import { logger } from '@/utils/logger';

export interface GetWeightHistoryParams {
  range?: TimeRange | undefined;
  timezone?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface GetMeasurementsParams {
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface GetAnalyticsParams {
  metric: MetricKey;
  range?: TimeRange | undefined;
  timezone?: string | undefined;
}

export interface GetPeriodComparisonParams {
  period?: 'month' | 'week' | undefined;
  timezone?: string | undefined;
}

export interface GetProgressReportParams {
  type: 'weekly' | 'monthly';
  date?: string | undefined;
  timezone?: string | undefined;
}

export const progressApi = {
  /**
   * Fetch weight tracking summary, trend points, and paginated logs.
   */
  async getWeightHistory(params?: GetWeightHistoryParams): Promise<WeightHistoryResponse> {
    const res = await apiClient.get('/progress/weight', { params });
    return res.data?.data;
  },

  /**
   * Log a new weight entry with client idempotency key.
   */
  async logWeight(data: LogWeightInput): Promise<LogWeightResponse> {
    const res = await apiClient.post('/progress/weight', data);
    return res.data?.data;
  },

  /**
   * Update an existing weight log entry by ID.
   */
  async updateWeight(id: string, data: UpdateWeightInput): Promise<LogWeightResponse['log']> {
    const res = await apiClient.put(`/progress/weight/${id}`, data);
    return res.data?.data;
  },

  /**
   * Soft-delete a weight log entry by ID.
   */
  async deleteWeight(id: string): Promise<{ id: string; deleted: boolean }> {
    const res = await apiClient.delete(`/progress/weight/${id}`);
    return res.data?.data;
  },

  /**
   * Fetch body measurements latest stats, diffs, and history.
   */
  async getMeasurements(params?: GetMeasurementsParams): Promise<MeasurementHistoryResponse> {
    const res = await apiClient.get('/progress/measurements', { params });
    return res.data?.data;
  },

  /**
   * Log body measurements with client idempotency key.
   */
  async logMeasurement(data: LogMeasurementInput): Promise<LogMeasurementResponse> {
    const res = await apiClient.post('/progress/measurements', data);
    return res.data?.data;
  },

  /**
   * Update body measurements entry by ID.
   */
  async updateMeasurement(id: string, data: Partial<LogMeasurementInput>): Promise<LogMeasurementResponse['measurement']> {
    const res = await apiClient.put(`/progress/measurements/${id}`, data);
    return res.data?.data;
  },

  /**
   * Soft-delete a body measurement entry by ID.
   */
  async deleteMeasurement(id: string): Promise<{ id: string; deleted: boolean }> {
    const res = await apiClient.delete(`/progress/measurements/${id}`);
    return res.data?.data;
  },

  /**
   * Fetch time-bucketed analytics trend points and goal comparison for a metric.
   */
  async getAnalytics(params: GetAnalyticsParams): Promise<ProgressAnalyticsResponse> {
    const res = await apiClient.get('/progress/analytics', { params });
    return res.data?.data;
  },

  /**
   * Fetch period comparison (Month-over-Month or Week-over-Week).
   */
  async getPeriodComparison(params?: GetPeriodComparisonParams): Promise<PeriodComparisonResponse> {
    const res = await apiClient.get('/progress/comparison', { params });
    return res.data?.data;
  },

  /**
   * Fetch earned personal records, workout consistency milestones, and weight achievements.
   */
  async getAchievements(): Promise<AchievementsResponse> {
    const res = await apiClient.get('/progress/achievements');
    return res.data?.data;
  },

  /**
   * Fetch deterministic weekly or monthly progress reports.
   */
  async getProgressReport(params: GetProgressReportParams): Promise<ProgressReportResponse> {
    const res = await apiClient.get('/progress/reports', { params });
    return res.data?.data;
  },
};
