import { apiClient } from '@/services/api-client';
import type { UserSettingsView, UpdateSettingsPayload } from '../types/profile';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export const settingsApi = {
  getSettings: async (): Promise<UserSettingsView> => {
    const response = await apiClient.get<ApiResponse<UserSettingsView>>('/profile/settings');
    return response.data.data;
  },

  updateSettings: async (payload: UpdateSettingsPayload): Promise<UserSettingsView> => {
    const response = await apiClient.patch<ApiResponse<UserSettingsView>>('/profile/settings', payload);
    return response.data.data;
  },
};

