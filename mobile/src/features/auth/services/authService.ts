import { AuthService } from './auth-service';
import { AuthRepository } from '../api/auth-repository';

/**
 * Auth service bridge connecting UI screens to the production AuthService / backend API.
 */
export const authService = {
  async login(
    email: string,
    password: string
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await AuthService.login({ email, password });
      return { ok: true };
    } catch (error: any) {
      return {
        ok: false,
        error: error.message || 'Invalid email or password.',
      };
    }
  },

  async signup(
    name: string,
    email: string,
    password: string
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await AuthService.register({
        name: name || 'User',
        email,
        password,
        confirmPassword: password,
      });
      return { ok: true };
    } catch (error: any) {
      return {
        ok: false,
        error: error.message || 'Unable to create account. Please try again.',
      };
    }
  },

  async requestReset(email: string): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
    try {
      const trimmed = (email || '').trim().toLowerCase();
      if (!trimmed) {
        return { ok: false, error: 'Enter the email you signed up with.' };
      }
      const res = await AuthRepository.forgotPassword({ email: trimmed });
      return { ok: true, message: res?.message };
    } catch (error: any) {
      const msg =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Password reset is temporarily unavailable.';
      return {
        ok: false,
        error: msg,
      };
    }
  },

  async resetPassword(params: {
    token: string;
    newPassword: string;
  }): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
    try {
      const token = (params?.token || '').trim();
      const newPassword = params?.newPassword || '';
      if (!token) {
        return { ok: false, error: 'A valid reset token is required.' };
      }
      if (newPassword.length < 12) {
        return { ok: false, error: 'Password must be at least 12 characters.' };
      }
      const res = await AuthRepository.resetPassword({ token, newPassword });
      return { ok: true, message: res?.message };
    } catch (error: any) {
      const msg =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Unable to reset password. The link or token may be invalid or expired.';
      return {
        ok: false,
        error: msg,
      };
    }
  },
};
