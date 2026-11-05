import { apiClient } from '@/services/api-client';
import { SecureStorageService } from '@/services/secure-storage';
import { z } from 'zod';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../utils/auth-schemas';

export type LoginRequest = z.infer<typeof loginSchema>;
export type RegisterRequest = z.infer<typeof registerSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  isEmailVerified: boolean;
  avatarUrl?: string;
  onboardingCompleted?: boolean;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

interface BackendTokensResponse {
  tokenType: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    requestId?: string;
    details?: Array<{ location?: string; path?: string; message: string }>;
  };
}

export const AuthRepository = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<ApiResponse<BackendTokensResponse>>('/auth/login', {
      email: data.email.trim().toLowerCase(),
      password: data.password,
    });

    const tokens: AuthTokens = {
      accessToken: response.data.data.accessToken,
      refreshToken: response.data.data.refreshToken,
    };

    // Store tokens immediately
    await SecureStorageService.setItem('auth.access_token', tokens.accessToken);
    await SecureStorageService.setItem('auth.refresh_token', tokens.refreshToken);

    // Retrieve user identity using the freshly issued access token
    const userRes = await apiClient.get<ApiResponse<{ id: string; displayName: string; email: string }>>(
      '/users/me',
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      }
    );

    let onboardingCompleted = false;
    try {
      const profileRes = await apiClient.get<ApiResponse<{ onboardingCompleted: boolean }>>(
        '/profile/me',
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        }
      );
      onboardingCompleted = Boolean(profileRes.data?.data?.onboardingCompleted);
    } catch {
      onboardingCompleted = false;
    }

    const user: User = {
      id: userRes.data.data.id,
      name: userRes.data.data.displayName,
      email: userRes.data.data.email,
      isEmailVerified: true,
      onboardingCompleted,
    };

    return { user, tokens };
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<ApiResponse<BackendTokensResponse>>('/auth/register', {
      email: data.email.trim().toLowerCase(),
      displayName: data.name.trim(),
      password: data.password,
    });

    const tokens: AuthTokens = {
      accessToken: response.data.data.accessToken,
      refreshToken: response.data.data.refreshToken,
    };

    // Store tokens immediately
    await SecureStorageService.setItem('auth.access_token', tokens.accessToken);
    await SecureStorageService.setItem('auth.refresh_token', tokens.refreshToken);

    const userRes = await apiClient.get<ApiResponse<{ id: string; displayName: string; email: string }>>(
      '/users/me',
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      }
    );

    const user: User = {
      id: userRes.data.data.id,
      name: userRes.data.data.displayName,
      email: userRes.data.data.email,
      isEmailVerified: true,
      onboardingCompleted: false,
    };

    return { user, tokens };
  },

  refreshToken: async (refreshToken: string): Promise<AuthTokens> => {
    const response = await apiClient.post<ApiResponse<BackendTokensResponse>>('/auth/refresh', {
      refreshToken,
    });

    return {
      accessToken: response.data.data.accessToken,
      refreshToken: response.data.data.refreshToken,
    };
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<ApiResponse<{ id: string; displayName: string; email: string }>>(
      '/users/me'
    );

    let onboardingCompleted = false;
    try {
      const profileRes = await apiClient.get<ApiResponse<{ onboardingCompleted: boolean }>>(
        '/profile/me'
      );
      onboardingCompleted = Boolean(profileRes.data?.data?.onboardingCompleted);
    } catch {
      onboardingCompleted = false;
    }

    return {
      id: response.data.data.id,
      name: response.data.data.displayName,
      email: response.data.data.email,
      isEmailVerified: true,
      onboardingCompleted,
    };
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    }
  },

  forgotPassword: async (data: ForgotPasswordRequest): Promise<void> => {
    try {
      await apiClient.post('/auth/forgot-password', data);
    } catch {
      // Endpoint may not be active yet; allow client flow to continue gracefully
    }
  },

  verifyEmail: async (code: string): Promise<void> => {
    try {
      await apiClient.post('/auth/verify-email', { code });
    } catch {
      // Endpoint may not be active yet
    }
  },
};
