import axios, { InternalAxiosRequestConfig } from 'axios';
import { Config } from '../constants/config';
import { logger } from '../utils/logger';
import { SecureStorageService } from './secure-storage';
import { AuthRepository } from '../features/auth/api/auth-repository';
import { useAuthStore } from '../features/auth/stores/auth-store';

export const apiClient = axios.create({
  baseURL: Config.API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let failedQueue: {
  resolve: (value?: unknown) => void;
  reject: (reason?: any) => void;
}[] = [];

const processQueue = (error: any, token: string | null = null) => {
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
    const accessToken = await SecureStorageService.getItem('auth.access_token');
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    logger.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    logger.error('API Response Error:', error?.response?.data || error.message);
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await SecureStorageService.getItem('auth.refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const newTokens = await AuthRepository.refreshToken(refreshToken);
        await SecureStorageService.setItem('auth.access_token', newTokens.accessToken);
        await SecureStorageService.setItem('auth.refresh_token', newTokens.refreshToken);
        
        processQueue(null, newTokens.accessToken);
        
        originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
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
  }
);
