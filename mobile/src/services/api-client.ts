import axios, { type InternalAxiosRequestConfig } from 'axios';
import { captureUserSession } from './user-session';

import { Config } from '../constants/config';
import { logger } from '../utils/logger';
import { SecureStorageService } from './secure-storage';
import { AuthRepository } from '../features/auth/api/auth-repository';
import { useAuthStore } from '../features/auth/stores/auth-store';

declare module 'axios' {
  interface AxiosRequestConfig {
    fitonusSession?: ReturnType<typeof captureUserSession>;
  }
}

export const apiClient = axios.create({
  baseURL: Config.API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let failedQueue: {
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    config.fitonusSession ??= captureUserSession();
    config.fitonusSession.assertCurrent();
    config.baseURL = Config.API_BASE_URL;

    const isPublicAuthRoute =
      config.url?.includes('/auth/login') ||
      config.url?.includes('/auth/register') ||
      config.url?.includes('/auth/refresh') ||
      config.url?.includes('/auth/forgot-password') ||
      config.url?.includes('/auth/reset-password');

    if (!isPublicAuthRoute) {
      const accessToken = await SecureStorageService.getItem('auth.access_token');
      if (accessToken && config.headers && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
    } else if (config.headers?.Authorization) {
      delete config.headers.Authorization;
    }
    config.fitonusSession.assertCurrent();
    return config;
  },
  (error) => {
    logger.error('API Request Error:', error);
    return Promise.reject(error);
  },
);

apiClient.interceptors.response.use(
  (response) => {
    response.config.fitonusSession?.assertCurrent();
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    originalRequest?.fitonusSession?.assertCurrent();
    const errorData = error?.response?.data;
    const errorMessage = errorData?.error?.message || errorData?.message || error.message;

    logger.error('API Response Error:', {
      status: error.response?.status,
      baseURL: originalRequest?.baseURL,
      url: originalRequest?.url,
      message: errorMessage,
    });

    const isAuthRoute =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/forgot-password') ||
      originalRequest?.url?.includes('/auth/reset-password');

    if (
      originalRequest &&
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthRoute
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.fitonusSession?.assertCurrent();
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await SecureStorageService.getItem('auth.refresh_token');
        originalRequest.fitonusSession?.assertCurrent();
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const newTokens = await AuthRepository.refreshToken(refreshToken);
        originalRequest.fitonusSession?.assertCurrent();
        await SecureStorageService.setItem('auth.access_token', newTokens.accessToken);
        await SecureStorageService.setItem('auth.refresh_token', newTokens.refreshToken);

        processQueue(null, newTokens.accessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        if (!originalRequest.fitonusSession?.isCurrent()) {
          processQueue(refreshError, null);
          return Promise.reject(refreshError);
        }
        processQueue(refreshError, null);
        useAuthStore.getState().clearAuth();
        await SecureStorageService.removeItem('auth.access_token');
        await SecureStorageService.removeItem('auth.refresh_token');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);
