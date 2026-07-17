import { SecureStorageService } from '@/services/secure-storage';
import { AuthRepository, LoginRequest, RegisterRequest } from '../api/auth-repository';
import { useAuthStore } from '../stores/auth-store';
import { logger } from '@/utils/logger';
import { storage as MMKVStorage } from '@/services/storage';

const ACCESS_TOKEN_KEY = 'auth.access_token';
const REFRESH_TOKEN_KEY = 'auth.refresh_token';

export const AuthService = {
  initialize: async () => {
    const setAuth = useAuthStore.getState().setAuth;
    const setLoading = useAuthStore.getState().setLoading;

    try {
      const accessToken = await SecureStorageService.getItem(ACCESS_TOKEN_KEY);
      
      if (accessToken) {
        // Here we could validate the token or fetch the user profile.
        // For Phase 2 mock, we just assume token is valid and set a mock user.
        // In real app, call apiClient.get('/users/me')
        setAuth({
          id: '1',
          name: 'Session User',
          email: 'session@example.com',
          isEmailVerified: true,
        });
      }
    } catch (error) {
      logger.error('Failed to initialize auth state', error);
    } finally {
      setLoading(false);
    }
  },

  login: async (data: LoginRequest) => {
    try {
      const response = await AuthRepository.login(data);
      
      // Save tokens securely
      await SecureStorageService.setItem(ACCESS_TOKEN_KEY, response.tokens.accessToken);
      await SecureStorageService.setItem(REFRESH_TOKEN_KEY, response.tokens.refreshToken);
      
      // Update store
      useAuthStore.getState().setAuth(response.user);
      
      return response.user;
    } catch (error) {
      logger.error('Login failed', error);
      throw error;
    }
  },

  register: async (data: RegisterRequest) => {
    try {
      const response = await AuthRepository.register(data);
      
      await SecureStorageService.setItem(ACCESS_TOKEN_KEY, response.tokens.accessToken);
      await SecureStorageService.setItem(REFRESH_TOKEN_KEY, response.tokens.refreshToken);
      
      useAuthStore.getState().setAuth(response.user);
      
      return response.user;
    } catch (error) {
      logger.error('Registration failed', error);
      throw error;
    }
  },

  logout: async () => {
    try {
      // Clear secure storage
      await SecureStorageService.removeItem(ACCESS_TOKEN_KEY);
      await SecureStorageService.removeItem(REFRESH_TOKEN_KEY);
      
      // Clear MMKV cache (e.g. any cached API responses if needed)
      // Note: we don't clear all MMKV because onboarding state is there
      // MMKVStorage.remove('some-cache-key');
      
      // Clear store
      useAuthStore.getState().clearAuth();
    } catch (error) {
      logger.error('Logout failed', error);
      // Force clear store even if storage fails
      useAuthStore.getState().clearAuth();
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
  }
};
