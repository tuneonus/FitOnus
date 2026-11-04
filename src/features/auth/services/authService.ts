import { delay } from '../../../shared/utils/mockDelay';

/**
 * Mock auth service matching Magic Patterns.
 * Password "wrong" triggers mock auth error for testing.
 */
export const authService = {
  async login(
    email: string,
    password: string
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    await delay(900);
    if (password === 'wrong') {
      return {
        ok: false,
        error:
          'That email and password don’t match. Try again or reset your password.',
      };
    }
    return { ok: true };
  },
  async signup(): Promise<{ ok: true }> {
    await delay(1000);
    return { ok: true };
  },
  async requestReset(): Promise<{ ok: true }> {
    await delay(900);
    return { ok: true };
  },
  async resetPassword(): Promise<{ ok: true }> {
    await delay(900);
    return { ok: true };
  },
};

