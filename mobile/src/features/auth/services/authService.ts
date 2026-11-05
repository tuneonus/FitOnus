import { AuthService } from './auth-service';

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

  async requestReset(email?: string): Promise<{ ok: true } | { ok: false; error: string }> {
    return { ok: true };
  },

  async resetPassword(): Promise<{ ok: true }> {
    return { ok: true };
  },
};
