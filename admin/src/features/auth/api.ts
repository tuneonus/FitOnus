import { apiClient } from '@/lib/api-client';
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

    return {
      user: res.data.user,
      tokenType: res.data.tokenType,
      accessTokenExpiresAt: res.data.accessTokenExpiresAt,
    };
  },

  async getMe(): Promise<AdminUser> {
    const res = await apiClient<AdminUser>('/auth/me', {
      method: 'GET',
    });
    return res.data;
  },

  async logout(): Promise<void> {
    await apiClient('/auth/logout', {
      method: 'POST',
    });
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

