import { AuthService } from './auth-service';
import { AuthRepository } from '../api/auth-repository';
import { isValidEmail, isValidOtp } from '../utils/validation';

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
    email: string;
    otp: string;
    newPassword: string;
  }): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
    try {
      const email = (params?.email || '').trim().toLowerCase();
      const otp = (params?.otp || '').trim();
      const newPassword = params?.newPassword || '';
      if (!isValidEmail(email)) {
        return { ok: false, error: 'Enter the email you signed up with.' };
      }
      if (!isValidOtp(otp)) {
        return { ok: false, error: 'Enter the 6-digit code from your email.' };
      }
      if (newPassword.length < 12) {
        return { ok: false, error: 'Password must be at least 12 characters.' };
      }
      const res = await AuthRepository.resetPassword({ email, otp, newPassword });
      return { ok: true, message: res?.message };
    } catch (error: any) {
      const msg =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Unable to reset password. The code may be invalid or expired.';
      return {
        ok: false,
        error: msg,
      };
    }
  },
};
