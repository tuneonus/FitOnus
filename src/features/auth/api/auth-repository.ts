import { apiClient } from '@/services/api-client';
import { z } from 'zod';
import { 
  loginSchema, 
  registerSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema 
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
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export const AuthRepository = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    // const response = await apiClient.post<AuthResponse>('/auth/login', data);
    // return response.data;
    
    // MOCK RESPONSE FOR NOW (No backend yet)
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          user: { id: '1', name: 'Test User', email: data.email, isEmailVerified: true },
          tokens: { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' },
        });
      }, 1000);
    });
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    // const response = await apiClient.post<AuthResponse>('/auth/register', {
    //   name: data.name,
    //   email: data.email,
    //   password: data.password,
    // });
    // return response.data;
    
    // MOCK RESPONSE
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          user: { id: '2', name: data.name, email: data.email, isEmailVerified: false },
          tokens: { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' },
        });
      }, 1000);
    });
  },

  forgotPassword: async (data: ForgotPasswordRequest): Promise<void> => {
    // await apiClient.post('/auth/forgot-password', data);
    
    // MOCK RESPONSE
    return new Promise((resolve) => setTimeout(resolve, 1000));
  },

  verifyEmail: async (code: string): Promise<void> => {
    // await apiClient.post('/auth/verify-email', { code });
    return new Promise((resolve) => setTimeout(resolve, 1000));
  },

  refreshToken: async (refreshToken: string): Promise<AuthTokens> => {
    // const response = await apiClient.post<AuthTokens>('/auth/refresh', { refreshToken });
    // return response.data;
    
    // MOCK RESPONSE
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          accessToken: 'mock-new-access-token',
          refreshToken: 'mock-new-refresh-token',
        });
      }, 500);
    });
  },
};
