import { mockDelay } from '../../../shared/utils/mockDelay';

/**
 * Mock auth boundary. Replace with Supabase Auth in production.
 * Prototype rule: password "wrong" returns an authentication error.
 */
export const authService = {
  async login(email: string, password: string): Promise<{ok: true;} | {ok: false;error: string;}> {
    await mockDelay(null, 900);
    if (password === 'wrong') return { ok: false, error: 'That email and password don’t match. Try again or reset your password.' };
    return { ok: true };
  },
  async signup(): Promise<{ok: true;}> {
    await mockDelay(null, 1000);
    return { ok: true };
  },
  async requestReset(): Promise<{ok: true;}> {
    await mockDelay(null, 900);
    return { ok: true };
  },
  async resetPassword(): Promise<{ok: true;}> {
    await mockDelay(null, 900);
    return { ok: true };
  }
};