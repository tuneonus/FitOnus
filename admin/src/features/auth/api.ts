import { apiClient } from '@/lib/api-client';
import { setAuthToken, clearAuthToken } from '@/lib/token-storage';
import type { AdminLoginResult, AdminUser, LoginCredentials } from './types';

export const authApi = {
  async login(credentials: LoginCredentials): Promise<AdminLoginResult> {
    const res = await apiClient<{
      tokenType: string;
      accessToken: string;
      accessTokenExpiresAt: string;
      refreshToken: string;
      refreshTokenExpiresAt: string;
      user: AdminUser;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    if (res.data.accessToken) {
      setAuthToken(res.data.accessToken);
    }

    return {
      user: res.data.user,
      tokenType: res.data.tokenType,
      accessTokenExpiresAt: res.data.accessTokenExpiresAt,
      accessToken: res.data.accessToken,
    };
  },

  async getMe(): Promise<AdminUser> {
    const res = await apiClient<AdminUser>('/auth/me', {
      method: 'GET',
    });
    return res.data;
  },

  async logout(): Promise<void> {
    try {
      await apiClient('/auth/logout', {
        method: 'POST',
      });
    } finally {
      clearAuthToken();
    }
  },

  async changePassword(input: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ message: string; revokedSessions: number }> {
    const res = await apiClient<{ message: string; revokedSessions: number }>(
      '/auth/change-password',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
    return res.data;
  },
};

