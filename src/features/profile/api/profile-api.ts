import { apiClient } from '@/services/api-client';
import type {
  UserProfileView,
  UpdateProfilePayload,
  OnboardingStep,
  OnboardingCompleteView,
} from '../types/profile';

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

export const profileApi = {
  getProfile: async (): Promise<UserProfileView> => {
    const response = await apiClient.get<ApiResponse<UserProfileView>>('/profile/me');
    return response.data.data;
  },

  updateProfile: async (payload: UpdateProfilePayload): Promise<UserProfileView> => {
    try {
      const response = await apiClient.patch<ApiResponse<UserProfileView>>('/profile/me', payload);
      return response.data.data;
    } catch (error: any) {
      if (error?.response?.status === 409) {
        const errorObj = new Error('VERSION_CONFLICT');
        (errorObj as any).code = 'VERSION_CONFLICT';
        (errorObj as any).details = error.response.data;
        throw errorObj;
      }
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to update profile';
      throw new Error(message);
    }
  },

  saveOnboardingStep: async (
    step: OnboardingStep,
    data: Record<string, unknown>
  ): Promise<UserProfileView> => {
    const response = await apiClient.post<ApiResponse<UserProfileView>>('/profile/onboarding/step', {
      step,
      data,
    });
    return response.data.data;
  },

  completeOnboarding: async (): Promise<OnboardingCompleteView> => {
    const response = await apiClient.post<ApiResponse<OnboardingCompleteView>>(
      '/profile/onboarding/complete',
      {}
    );
    return response.data.data;
  },
};

