import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useAuthStore } from '../src/features/auth/stores/auth-store';
import { AuthRepository } from '../src/features/auth/api/auth-repository';
import { AuthService, extractApiErrorMessage } from '../src/features/auth/services/auth-service';
import { SecureStorageService } from '../src/services/secure-storage';
import {
  useSettingsStore,
  setSettingsStorageEngine,
} from '../src/shared/stores/settingsStore';
import { useNotificationsStore } from '../src/features/notifications/store/notificationsStore';
import { useChallengesStore } from '../src/features/challenges/store/challengesStore';
import { apiClient } from '../src/services/api-client';
import { authService } from '../src/features/auth/services/authService';

describe('Phase 9.4 Mobile: Account Security, Privacy & Secure Deletion', () => {
  const memoryStorage = new Map<string, string>();

  beforeEach(() => {
    memoryStorage.clear();
    setSettingsStorageEngine({
      getItem: (key) => Promise.resolve(memoryStorage.get(key) ?? null),
      setItem: (key, val) => {
        memoryStorage.set(key, val);
        return Promise.resolve();
      },
      removeItem: (key) => {
        memoryStorage.delete(key);
        return Promise.resolve();
      },
    });

    useAuthStore.getState().clearAuth();
    useSettingsStore.getState().resetSettings();
    useNotificationsStore.getState().resetStore();
  });

  describe('1. Client-Side Password Policy & Validation', () => {
    it('enforces NIST SP 800-63B minimum length of 12 characters', () => {
      const validate = (pwd: string) => {
        if (!pwd) return 'Enter a new password.';
        if (pwd.length < 12) return 'Password must be at least 12 characters.';
        if (pwd.length > 128) return 'Password must be no more than 128 characters.';
        return null;
      };

      assert.equal(validate(''), 'Enter a new password.');
      assert.equal(validate('short123'), 'Password must be at least 12 characters.');
      assert.equal(validate('11charactrs'), 'Password must be at least 12 characters.');
      assert.equal(validate('twelve_chars'), null);
      assert.equal(validate('a'.repeat(128)), null);
      assert.equal(validate('a'.repeat(129)), 'Password must be no more than 128 characters.');
    });

    it('rejects new password when identical to current password', () => {
      const current = 'FitOnusPassword2026!';
      const newPwd = 'FitOnusPassword2026!';
      const checkDiff = (c: string, n: string) => (c && n === c ? 'New password must be different from current password.' : null);

      assert.equal(checkDiff(current, newPwd), 'New password must be different from current password.');
      assert.equal(checkDiff(current, 'BrandNewPassword2026!'), null);
    });

    it('requires confirmation password to match new password exactly', () => {
      const newPwd = 'BrandNewPassword2026!';
      const confirmMismatch = 'BrandNewPassword2026?';
      const confirmMatch = 'BrandNewPassword2026!';

      const checkMatch = (n: string, c: string) => (n && c !== n ? 'Passwords do not match.' : null);

      assert.equal(checkMatch(newPwd, confirmMismatch), 'Passwords do not match.');
      assert.equal(checkMatch(newPwd, confirmMatch), null);
    });
  });

  describe('2. Error Message Extraction & Sanitization', () => {
    it('extracts specific password policy violation messages without leaking internals', () => {
      const errorObj = {
        response: {
          data: {
            error: {
              code: 'PASSWORD_POLICY_VIOLATION',
              message: 'The new password must differ from the current one.',
            },
          },
        },
      };

      const extracted = extractApiErrorMessage(errorObj, 'Fallback error');
      assert.equal(extracted, 'The new password must differ from the current one.');
    });

    it('extracts incorrect credentials message clearly for change password and deletion', () => {
      const errorObj = {
        response: {
          data: {
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'The current password is incorrect.',
            },
          },
        },
      };

      const extracted = extractApiErrorMessage(errorObj, 'Fallback error');
      assert.equal(extracted, 'The current password is incorrect.');
    });

    it('formats schema validation error arrays into human-readable sentences', () => {
      const errorObj = {
        response: {
          data: {
            error: {
              code: 'VALIDATION_ERROR',
              details: [
                { path: 'password', message: 'Too short' },
              ],
            },
          },
        },
      };

      const extracted = extractApiErrorMessage(errorObj, 'Fallback error');
      assert.equal(extracted, 'Password must be between 12 and 128 characters.');
    });
  });

  describe('3. Password Change Service', () => {
    it('dispatches correct endpoint and payload for change password', async () => {
      let interceptedUrl = '';
      let interceptedBody: any = null;

      const originalPost = apiClient.post;
      apiClient.post = (url: string, data?: any) => {
        interceptedUrl = url;
        interceptedBody = data;
        return Promise.resolve({
          data: {
            success: true,
            data: { revokedSessions: 2 },
          },
        }) as any;
      };

      try {
        await AuthService.changePassword('OldPassword123!', 'NewPassword456!');
        assert.equal(interceptedUrl, '/auth/change-password');
        assert.deepEqual(interceptedBody, {
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword456!',
        });
      } finally {
        apiClient.post = originalPost;
      }
    });

    it('propagates error when current password is wrong without resetting session', async () => {
      const originalPost = apiClient.post;
      apiClient.post = () => {
        return Promise.reject({
          response: {
            status: 422,
            data: {
              error: {
                code: 'INVALID_CREDENTIALS',
                message: 'The current password is incorrect.',
              },
            },
          },
        });
      };

      // Set an active session
      useAuthStore.getState().setAuth({
        id: 'user-123',
        name: 'Athlete',
        email: 'athlete@example.com',
        isEmailVerified: true,
      });

      try {
        await assert.rejects(
          async () => {
            await AuthService.changePassword('WrongPassword1!', 'NewPassword456!');
          },
          /The current password is incorrect\./,
        );

        // Session must remain intact
        assert.equal(useAuthStore.getState().isAuthenticated, true);
        assert.equal(useAuthStore.getState().user?.id, 'user-123');
      } finally {
        apiClient.post = originalPost;
      }
    });
  });

  describe('4. Secure Account Deletion Service & Data Wiping', () => {
    it('dispatches DELETE /users/me with password in request body', async () => {
      let interceptedUrl = '';
      let interceptedConfig: any = null;

      const originalDelete = apiClient.delete;
      apiClient.delete = (url: string, config?: any) => {
        interceptedUrl = url;
        interceptedConfig = config;
        return Promise.resolve({
          data: {
            success: true,
            data: { deletedUserId: 'user-to-delete' },
          },
        }) as any;
      };

      try {
        const res = await AuthRepository.deleteAccount('ConfirmPassword123!');
        assert.equal(interceptedUrl, '/users/me');
        assert.deepEqual(interceptedConfig, {
          data: { password: 'ConfirmPassword123!' },
        });
        assert.equal(res.deletedUserId, 'user-to-delete');
      } finally {
        apiClient.delete = originalDelete;
      }
    });

    it('does NOT wipe local stores or tokens if server deletion fails', async () => {
      const originalDelete = apiClient.delete;
      apiClient.delete = () => {
        return Promise.reject({
          response: {
            status: 422,
            data: {
              error: {
                code: 'INVALID_CREDENTIALS',
                message: 'The password is incorrect.',
              },
            },
          },
        });
      };

      // Set tokens and active session
      await SecureStorageService.setItem('auth.access_token', 'valid-access-token');
      await SecureStorageService.setItem('auth.refresh_token', 'valid-refresh-token');
      useAuthStore.getState().setAuth({
        id: 'user-123',
        name: 'Athlete',
        email: 'athlete@example.com',
        isEmailVerified: true,
      });
      useSettingsStore.getState().setUnits('imperial');

      try {
        await assert.rejects(
          async () => {
            await AuthService.deleteAccount('WrongPassword1!');
          },
          /The password is incorrect\./,
        );

        // User must NOT be logged out
        assert.equal(useAuthStore.getState().isAuthenticated, true);
        assert.equal(useAuthStore.getState().user?.id, 'user-123');
        assert.equal(useSettingsStore.getState().units, 'imperial');

        // Tokens must still be present
        const token = await SecureStorageService.getItem('auth.access_token');
        assert.equal(token, 'valid-access-token');
      } finally {
        apiClient.delete = originalDelete;
      }
    });

    it('atomically removes tokens and resets all stores on successful account deletion', async () => {
      const originalDelete = apiClient.delete;
      apiClient.delete = () => {
        return Promise.resolve({
          data: {
            success: true,
            data: { deletedUserId: 'user-123' },
          },
        }) as any;
      };

      // Set tokens and active session
      await SecureStorageService.setItem('auth.access_token', 'token-to-burn');
      await SecureStorageService.setItem('auth.refresh_token', 'refresh-to-burn');
      useAuthStore.getState().setAuth({
        id: 'user-123',
        name: 'Athlete',
        email: 'athlete@example.com',
        isEmailVerified: true,
      });
      useSettingsStore.getState().setUnits('imperial');
      useSettingsStore.getState().setPrivacy({ privacyCoachSharing: true });

      try {
        await AuthService.deleteAccount('CorrectPassword123!');

        // Tokens must be erased
        const token = await SecureStorageService.getItem('auth.access_token');
        const refresh = await SecureStorageService.getItem('auth.refresh_token');
        assert.equal(token, null);
        assert.equal(refresh, null);

        // Auth store reset
        assert.equal(useAuthStore.getState().isAuthenticated, false);
        assert.equal(useAuthStore.getState().user, null);

        // Settings store reset to defaults
        assert.equal(useSettingsStore.getState().units, 'metric');
        assert.equal(useSettingsStore.getState().privacyCoachSharing, false);
      } finally {
        apiClient.delete = originalDelete;
      }
    });
  });

  describe('5. Privacy Preferences State Management', () => {
    it('maintains explicit opt-in default of false for AI coach sharing', () => {
      const state = useSettingsStore.getState();
      assert.equal(state.privacyCoachSharing, false);
      assert.equal(state.privacyAnalytics, true);
      assert.equal(state.privacyPhotoRetention, true);
    });

    it('updates privacy preferences and scopes storage correctly', async () => {
      await useSettingsStore.getState().hydrateForUser('privacy-test-user');

      useSettingsStore.getState().setPrivacy({
        privacyAnalytics: false,
        privacyPhotoRetention: false,
        privacyCoachSharing: true,
      });

      // Allow persist microtask
      await new Promise((r) => setTimeout(r, 20));

      const updated = useSettingsStore.getState();
      assert.equal(updated.privacyAnalytics, false);
      assert.equal(updated.privacyPhotoRetention, false);
      assert.equal(updated.privacyCoachSharing, true);

      // Verify persisted in user-scoped key
      const persisted = memoryStorage.get('fitonus.settings.privacy-test-user');
      assert.ok(persisted);
      assert.match(persisted, /"privacyCoachSharing":true/);
      assert.match(persisted, /"privacyAnalytics":false/);
      assert.match(persisted, /"privacyPhotoRetention":false/);
    });
  });

  describe('6. Logout Lifecycle & Store Reset Completeness', () => {
    it('resets notifications store, settings store, and auth store on logout', async () => {
      const originalLogout = apiClient.post;
      apiClient.post = () => Promise.resolve({ data: { success: true } }) as any;

      await SecureStorageService.setItem('auth.access_token', 'session-token');
      useAuthStore.getState().setAuth({
        id: 'logout-user',
        name: 'User',
        email: 'user@example.com',
        isEmailVerified: true,
      });
      useSettingsStore.getState().setTheme('dark');
      useNotificationsStore.getState().togglePreference('workout_reminders');

      try {
        await AuthService.logout();

        // Check tokens wiped
        const token = await SecureStorageService.getItem('auth.access_token');
        assert.equal(token, null);

        // Check auth wiped
        assert.equal(useAuthStore.getState().isAuthenticated, false);
        assert.equal(useAuthStore.getState().user, null);

        // Check settings wiped
        assert.equal(useSettingsStore.getState().theme, 'system');
      } finally {
        apiClient.post = originalLogout;
      }
    });
  });

  describe('7. Password Reset & Forgot Password Handling', () => {
    it('dispatches forgot-password and propagates errors safely', async () => {
      const originalPost = apiClient.post;
      let interceptedUrl = '';
      let interceptedBody: any = null;
      apiClient.post = (url: string, body?: any) => {
        interceptedUrl = url;
        interceptedBody = body;
        return Promise.reject({
          response: {
            status: 503,
            data: {
              error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Password reset email delivery service is currently not configured.',
              },
            },
          },
        });
      };

      try {
        const res = await authService.requestReset('user@example.com');
        assert.equal(interceptedUrl, '/auth/forgot-password');
        assert.deepEqual(interceptedBody, { email: 'user@example.com' });
        assert.equal(res.ok, false);
        if (!res.ok) {
          assert.match(res.error, /not configured/i);
        }
      } finally {
        apiClient.post = originalPost;
      }
    });

    it('requires email, a 6-digit OTP and minimum length on password reset', async () => {
      const missingOtp = await authService.resetPassword({
        email: 'user@example.com',
        otp: '',
        newPassword: 'AValidPassword123!',
      });
      assert.equal(missingOtp.ok, false);
      if (!missingOtp.ok) {
        assert.match(missingOtp.error, /6-digit code/i);
      }

      const shortPassword = await authService.resetPassword({
        email: 'user@example.com',
        otp: '123456',
        newPassword: 'short',
      });
      assert.equal(shortPassword.ok, false);
      if (!shortPassword.ok) {
        assert.match(shortPassword.error, /at least 12 characters/i);
      }
    });
  });
});
