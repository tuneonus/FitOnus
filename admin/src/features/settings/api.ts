import { apiClient } from '@/lib/api-client';
import type {
  GetAppSettingsData,
  UpdateSettingPayloadItem,
  AppSettingRecord,
} from './types';

export const settingsApi = {
  /**
   * Retrieves all system application settings along with live daily AI usage statistics.
   */
  async getSettings(): Promise<GetAppSettingsData> {
    const res = await apiClient<GetAppSettingsData>('/application-settings');
    return res.data;
  },

  /**
   * Updates one or more settings with optimistic concurrency version check.
   */
  async updateSettings(settings: UpdateSettingPayloadItem[]): Promise<AppSettingRecord[]> {
    const res = await apiClient<AppSettingRecord[]>('/application-settings', {
      method: 'PATCH',
      body: JSON.stringify({ settings }),
    });
    return res.data;
  },
};
