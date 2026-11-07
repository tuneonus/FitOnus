import { SecureStorageService } from '@/services/secure-storage';
import { AuthRepository, type LoginRequest, type RegisterRequest } from '../api/auth-repository';
import { useAuthStore } from '../stores/auth-store';
import { logger } from '@/utils/logger';
import { queryClient } from '@/providers/query-provider';
import { useNutritionStore } from '@/features/nutrition/store/nutritionStore';
import { useWeightStore } from '@/features/weight-tracking/store/weightStore';
import { useWorkoutStore } from '@/features/workouts/store/workoutStore';
import { useProgressStore } from '@/features/analytics/store/progressStore';
import { useProfileSetupStore } from '@/features/onboarding/store/profileSetupStore';
import { useHealthStore } from '@/features/health-integration/store/healthStore';
import { useGoalsStore } from '@/features/goals/store/goalsStore';
import { useAdvancedAnalyticsStore } from '@/features/analytics/store/advancedAnalyticsStore';

const ACCESS_TOKEN_KEY = 'auth.access_token';
const REFRESH_TOKEN_KEY = 'auth.refresh_token';

function resetAllUserStores() {
  useAuthStore.getState().clearAuth();
  useNutritionStore.getState().resetStore().catch(() => {});
  useWeightStore.getState().resetStore();
  useWorkoutStore.getState().resetStore();
  useProgressStore.getState().resetStore();
  useAdvancedAnalyticsStore.getState().resetStore();
  useGoalsStore.getState().resetStore().catch(() => {});
  useProfileSetupStore.getState().reset();
  useHealthStore.getState().resetStore();
}

export function extractApiErrorMessage(error: any, fallback: string): string {
  const errData = error?.response?.data;
  if (errData?.error) {
    const { details, message, code } = errData.error;
    if (Array.isArray(details) && details.length > 0) {
      const messages = details.map((d: any) => {
        if (d.path === 'password') {
          return 'Password must be between 12 and 128 characters.';
        }
        if (d.path === 'email') {
          return 'Please enter a valid email address.';
        }
        if (d.path === 'displayName') {
          return 'Please enter your name.';
        }
        return d.message || d.path;
      });
      return messages.join('. ');
    }
    if (code === 'EMAIL_TAKEN') {
      return 'An account with this email address already exists. Please sign in.';
    }
    if (code === 'INVALID_CREDENTIALS') {
      return 'Invalid email or password. Please try again.';
    }
    if (code === 'PASSWORD_POLICY_VIOLATION') {
      return 'Password must be between 12 and 128 characters.';
    }
    if (code === 'REGISTRATION_DISABLED') {
      return 'Registration is currently disabled.';
    }
    if (message && message !== 'The request is invalid.') {
      return message;
    }
  }
  return errData?.message || error?.message || fallback;
}

export const AuthService = {
  initialize: async () => {
    const setAuth = useAuthStore.getState().setAuth;
    const clearAuth = useAuthStore.getState().clearAuth;
    const setLoading = useAuthStore.getState().setLoading;

    try {
      const accessToken = await SecureStorageService.getItem(ACCESS_TOKEN_KEY);
      const refreshToken = await SecureStorageService.getItem(REFRESH_TOKEN_KEY);

      // Rule 1: No stored token means unauthenticated state
      if (!accessToken && !refreshToken) {
        clearAuth();
        return;
      }

      // If we have an accessToken, try to get user
      if (accessToken) {
        try {
          const user = await AuthRepository.getCurrentUser();
          setAuth(user);
          return;
        } catch {
          // If getCurrentUser fails with 401, apiClient might have refreshed or failed refresh.
          const restoredUser = useAuthStore.getState().user;
          if (restoredUser) {
            return;
          }
        }
      }

      // If accessToken failed or missing, but refreshToken exists, try refresh
      if (refreshToken) {
        try {
          const newTokens = await AuthRepository.refreshToken(refreshToken);
          await SecureStorageService.setItem(ACCESS_TOKEN_KEY, newTokens.accessToken);
          await SecureStorageService.setItem(REFRESH_TOKEN_KEY, newTokens.refreshToken);
          const user = await AuthRepository.getCurrentUser();
          setAuth(user);
          return;
        } catch {
          // Refresh token invalid or expired
        }
      }

      // Rule 3: Invalid refresh token clears the invalid session
      await SecureStorageService.removeItem(ACCESS_TOKEN_KEY);
      await SecureStorageService.removeItem(REFRESH_TOKEN_KEY);
      clearAuth();
    } catch (error) {
      logger.error('Failed to initialize auth state', error);
      await SecureStorageService.removeItem(ACCESS_TOKEN_KEY).catch(() => {});
      await SecureStorageService.removeItem(REFRESH_TOKEN_KEY).catch(() => {});
      clearAuth();
    } finally {
      setLoading(false);
    }
  },

  login: async (data: LoginRequest) => {
    // Clear any previous stale tokens before logging in
    await SecureStorageService.removeItem(ACCESS_TOKEN_KEY).catch(() => {});
    await SecureStorageService.removeItem(REFRESH_TOKEN_KEY).catch(() => {});
    resetAllUserStores();

    try {
      const response = await AuthRepository.login(data);

      await SecureStorageService.setItem(ACCESS_TOKEN_KEY, response.tokens.accessToken);
      await SecureStorageService.setItem(REFRESH_TOKEN_KEY, response.tokens.refreshToken);

      useAuthStore.getState().setAuth(response.user);

      return response.user;
    } catch (error: any) {
      const message = extractApiErrorMessage(error, 'Invalid email or password.');
      logger.error('Login failed', { message });
      throw new Error(message);
    }
  },

  register: async (data: RegisterRequest) => {
    // Clear any previous stale tokens before registering
    await SecureStorageService.removeItem(ACCESS_TOKEN_KEY).catch(() => {});
    await SecureStorageService.removeItem(REFRESH_TOKEN_KEY).catch(() => {});
    resetAllUserStores();

    try {
      const response = await AuthRepository.register(data);

      await SecureStorageService.setItem(ACCESS_TOKEN_KEY, response.tokens.accessToken);
      await SecureStorageService.setItem(REFRESH_TOKEN_KEY, response.tokens.refreshToken);

      useAuthStore.getState().setAuth(response.user);

      return response.user;
    } catch (error: any) {
      const message = extractApiErrorMessage(error, 'Unable to create account. Please try again.');
      logger.error('Registration failed', { message });
      throw new Error(message);
    }
  },

  logout: async () => {
    try {
      await AuthRepository.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      await SecureStorageService.removeItem(ACCESS_TOKEN_KEY);
      await SecureStorageService.removeItem(REFRESH_TOKEN_KEY);
      resetAllUserStores();
      queryClient.clear();
    }
  },

  getToken: async () => {
    return await SecureStorageService.getItem(ACCESS_TOKEN_KEY);
  },

  getRefreshToken: async () => {
    return await SecureStorageService.getItem(REFRESH_TOKEN_KEY);
  },

  saveTokens: async (accessToken: string, refreshToken: string) => {
    await SecureStorageService.setItem(ACCESS_TOKEN_KEY, accessToken);
    await SecureStorageService.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
};
