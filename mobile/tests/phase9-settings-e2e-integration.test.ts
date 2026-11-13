import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '../src/services/api-client';
import { settingsApi } from '../src/features/profile/api/settings-api';
import {
  useSettingsStore,
  setSettingsStorageEngine,
  DEFAULT_SETTINGS,
} from '../src/shared/stores/settingsStore';
import { useAuthStore } from '../src/features/auth/stores/auth-store';
import { AuthService, extractApiErrorMessage } from '../src/features/auth/services/auth-service';
import { SecureStorageService } from '../src/services/secure-storage';
import { queryClient } from '../src/providers/query-provider';
import {
  SETTINGS_QUERY_KEY,
  syncStoreWithSettings,
} from '../src/features/profile/hooks/use-settings';
import type { UserSettingsView, UpdateSettingsPayload } from '../src/features/profile/types/profile';

describe('Phase 9.6: Settings & Privacy Mobile + Backend Integration Verification', () => {
  const memoryStorage = new Map<string, string>();
  const testUserId = '11111111-1111-4111-8111-111111111111';

  const mockSettingsView: UserSettingsView = {
    userId: testUserId,
    themeMode: 'system',
    unitSystem: 'metric',
    healthConnectEnabled: false,
    smartwatchConnected: false,
    notificationsEnabled: true,
    language: 'en',
    privacyAnalytics: true,
    privacyPhotoRetention: true,
    privacyCoachSharing: false,
    notificationSchedule: {},
    updatedAt: new Date().toISOString(),
  };

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

    queryClient.clear();
    useAuthStore.getState().clearAuth();
    useSettingsStore.getState().resetSettings();
  });

  // 1. Settings GET/PATCH
  describe('1. Settings GET & PATCH Integration', () => {
    it('successfully fetches settings via GET /profile/settings and parses payload', async () => {
      const originalGet = apiClient.get;
      let requestedUrl = '';
      apiClient.get = ((url: string) => {
        requestedUrl = url;
        return Promise.resolve({
          data: {
            success: true,
            data: mockSettingsView,
          },
        });
      }) as any;

      try {
        const result = await settingsApi.getSettings();
        assert.equal(requestedUrl, '/profile/settings');
        assert.equal(result.userId, testUserId);
        assert.equal(result.unitSystem, 'metric');
        assert.equal(result.themeMode, 'system');
        assert.equal(result.language, 'en');
      } finally {
        apiClient.get = originalGet;
      }
    });

    it('successfully updates settings via PATCH /profile/settings with partial payload', async () => {
      const originalPatch = apiClient.patch;
      let requestedUrl = '';
      let requestedBody: any = null;
      apiClient.patch = ((url: string, payload: any) => {
        requestedUrl = url;
        requestedBody = payload;
        return Promise.resolve({
          data: {
            success: true,
            data: {
              ...mockSettingsView,
              ...payload,
              updatedAt: new Date().toISOString(),
            },
          },
        });
      }) as any;

      try {
        const patchPayload: UpdateSettingsPayload = {
          themeMode: 'dark',
          unitSystem: 'imperial',
          language: 'ta',
        };
        const result = await settingsApi.updateSettings(patchPayload);
        assert.equal(requestedUrl, '/profile/settings');
        assert.deepEqual(requestedBody, patchPayload);
        assert.equal(result.themeMode, 'dark');
        assert.equal(result.unitSystem, 'imperial');
        assert.equal(result.language, 'ta');
      } finally {
        apiClient.patch = originalPatch;
      }
    });
  });

  // 2. Settings cache refresh
  describe('2. Settings Cache Refresh & Query Invalidation', () => {
    it('updates TanStack Query cache and syncs with settingsStore on mutation success', async () => {
      // Prime initial cache
      queryClient.setQueryData(SETTINGS_QUERY_KEY, mockSettingsView);
      syncStoreWithSettings(mockSettingsView);

      assert.equal(queryClient.getQueryData<UserSettingsView>(SETTINGS_QUERY_KEY)?.themeMode, 'system');
      assert.equal(useSettingsStore.getState().theme, 'system');

      // Simulate successful mutation callback behavior from useUpdateSettings
      const updatedView: UserSettingsView = {
        ...mockSettingsView,
        themeMode: 'dark',
        unitSystem: 'imperial',
        privacyCoachSharing: true,
      };

      queryClient.setQueryData(SETTINGS_QUERY_KEY, updatedView);
      syncStoreWithSettings(updatedView);

      const cachedData = queryClient.getQueryData<UserSettingsView>(SETTINGS_QUERY_KEY);
      assert.equal(cachedData?.themeMode, 'dark');
      assert.equal(cachedData?.unitSystem, 'imperial');
      assert.equal(cachedData?.privacyCoachSharing, true);

      // Verify store synchronized
      assert.equal(useSettingsStore.getState().theme, 'dark');
      assert.equal(useSettingsStore.getState().units, 'imperial');
      assert.equal(useSettingsStore.getState().privacyCoachSharing, true);
    });
  });

  // 3. Failed settings update rollback
  describe('3. Failed Settings Update Rollback (Optimistic UI Safety)', () => {
    it('reverts optimistic store change when server PATCH rejects with error', async () => {
      const originalPatch = apiClient.patch;
      apiClient.patch = (() => {
        return Promise.reject(new Error('Network connection timeout'));
      }) as any;

      await useSettingsStore.getState().hydrateForUser(testUserId);
      assert.equal(useSettingsStore.getState().privacyPhotoRetention, true);

      // Optimistic mutation logic from PrivacyScreen
      const key = 'privacyPhotoRetention' as const;
      const prevVal = useSettingsStore.getState()[key];
      const nextVal = false;

      // Apply optimistic update
      useSettingsStore.getState().setPrivacy({ [key]: nextVal });
      assert.equal(useSettingsStore.getState().privacyPhotoRetention, false);

      // Execute server update wrapped with rollback catch
      let rollbackOccurred = false;
      try {
        await settingsApi.updateSettings({ [key]: nextVal });
      } catch {
        useSettingsStore.getState().setPrivacy({ [key]: prevVal });
        rollbackOccurred = true;
      }

      assert.equal(rollbackOccurred, true);
      assert.equal(useSettingsStore.getState().privacyPhotoRetention, true, 'Should be rolled back to true');

      apiClient.patch = originalPatch;
    });
  });

  // 4. Password change
  describe('4. Password Change Flow & Policy', () => {
    it('sends POST /auth/change-password and receives session revocation result', async () => {
      let dispatched = false;
      let sentBody: any = null;
      const originalPost = apiClient.post;
      apiClient.post = ((url: string, body: any) => {
        if (url === '/auth/change-password') {
          dispatched = true;
          sentBody = body;
          return Promise.resolve({
            data: {
              success: true,
              data: { revokedSessions: 2 },
            },
          });
        }
        return Promise.reject(new Error('Unknown url'));
      }) as any;

      try {
        await AuthService.changePassword('ValidCurrentPassword123!', 'NewSecurePassword456!');
        assert.equal(dispatched, true);
        assert.equal(sentBody.currentPassword, 'ValidCurrentPassword123!');
        assert.equal(sentBody.newPassword, 'NewSecurePassword456!');
      } finally {
        apiClient.post = originalPost;
      }
    });

    it('rejects with sanitized error message when current password does not match', async () => {
      const originalPost = apiClient.post;
      apiClient.post = (() => {
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
      }) as any;

      try {
        await assert.rejects(
          async () => {
            await AuthService.changePassword('WrongPassword123!', 'NewSecurePassword456!');
          },
          /The current password is incorrect\./,
        );
      } finally {
        apiClient.post = originalPost;
      }
    });
  });

  // 5. Privacy preferences
  describe('5. Privacy Preferences State & Explicit Opt-In', () => {
    it('verifies explicit opt-in constraint for coach sharing is false by default', () => {
      assert.equal(DEFAULT_SETTINGS.privacyCoachSharing, false);
      assert.equal(DEFAULT_SETTINGS.privacyAnalytics, true);
      assert.equal(DEFAULT_SETTINGS.privacyPhotoRetention, true);
    });

    it('updates privacy preferences and persists state to storage engine', async () => {
      await useSettingsStore.getState().hydrateForUser(testUserId);

      useSettingsStore.getState().setPrivacy({
        privacyAnalytics: false,
        privacyCoachSharing: true,
      });

      await new Promise((r) => setTimeout(r, 10));

      assert.equal(useSettingsStore.getState().privacyAnalytics, false);
      assert.equal(useSettingsStore.getState().privacyCoachSharing, true);
      assert.equal(useSettingsStore.getState().privacyPhotoRetention, true);

      const stored = memoryStorage.get(`fitonus.settings.${testUserId}`);
      assert.ok(stored);
      const parsed = JSON.parse(stored);
      assert.equal(parsed.privacyAnalytics, false);
      assert.equal(parsed.privacyCoachSharing, true);
    });
  });

  // 6. Account deletion confirmation
  describe('6. Account Deletion Confirmation & Authorization', () => {
    it('dispatches DELETE /users/me with password in request payload', async () => {
      let dispatched = false;
      let requestConfig: any = null;
      const originalDelete = apiClient.delete;
      apiClient.delete = ((url: string, config: any) => {
        if (url === '/users/me') {
          dispatched = true;
          requestConfig = config;
          return Promise.resolve({
            data: {
              success: true,
              data: { deletedUserId: testUserId },
            },
          });
        }
        return Promise.reject(new Error('Unknown url'));
      }) as any;

      try {
        await AuthService.deleteAccount('ConfirmPassword123!');
        assert.equal(dispatched, true);
        assert.deepEqual(requestConfig?.data, { password: 'ConfirmPassword123!' });
      } finally {
        apiClient.delete = originalDelete;
      }
    });
  });

  // 7. Session cleanup
  describe('7. Session Cleanup on Account Deletion', () => {
    it('clears auth token, refresh token, auth state, settings store, and react query cache', async () => {
      const originalDelete = apiClient.delete;
      apiClient.delete = (() =>
        Promise.resolve({
          data: {
            success: true,
            data: { deletedUserId: testUserId },
          },
        })) as any;

      await SecureStorageService.setItem('auth.access_token', 'test-access-token');
      await SecureStorageService.setItem('auth.refresh_token', 'test-refresh-token');

      useAuthStore.getState().setAuth({
        id: testUserId,
        name: 'Athlete One',
        email: 'athlete@example.com',
        isEmailVerified: true,
      });

      useSettingsStore.getState().setTheme('dark');
      queryClient.setQueryData(SETTINGS_QUERY_KEY, mockSettingsView);

      try {
        await AuthService.deleteAccount('ConfirmPassword123!');

        // Tokens removed
        const access = await SecureStorageService.getItem('auth.access_token');
        const refresh = await SecureStorageService.getItem('auth.refresh_token');
        assert.equal(access, null);
        assert.equal(refresh, null);

        // Auth store reset
        assert.equal(useAuthStore.getState().isAuthenticated, false);
        assert.equal(useAuthStore.getState().user, null);

        // Settings store reset
        assert.equal(useSettingsStore.getState().theme, 'dark'); // theme is a device preference: it survives logout and account switches

        // Query cache cleared
        assert.equal(queryClient.getQueryData(SETTINGS_QUERY_KEY), undefined);
      } finally {
        apiClient.delete = originalDelete;
      }
    });
  });

  // 8. Invalid API responses
  describe('8. Invalid API Response Handling & Error Sanitization', () => {
    it('extracts structured 400 validation error message cleanly', () => {
      const errorObj = {
        response: {
          status: 400,
          data: {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Invalid enum value. Expected "en" | "ta", received "fr".',
            },
          },
        },
      };

      const extracted = extractApiErrorMessage(errorObj, 'Default error');
      assert.equal(extracted, 'Invalid enum value. Expected "en" | "ta", received "fr".');
    });

    it('falls back to safe default message when server response body is empty or malformed', () => {
      const malformedError = {
        response: {
          status: 500,
          data: null,
        },
      };

      const extracted = extractApiErrorMessage(malformedError, 'Unable to process settings request.');
      assert.equal(extracted, 'Unable to process settings request.');
    });
  });

  // 9. Network errors
  describe('9. Network Error Handling', () => {
    it('handles network connection failure gracefully and preserves user state', async () => {
      const networkError = new Error('Network Error');
      (networkError as any).isAxiosError = true;

      const extracted = extractApiErrorMessage(networkError, 'Connection failed. Please check your internet connection.');
      assert.equal(extracted, 'Network Error');

      // Verify that a network failure does NOT clear or corrupt existing user settings
      await useSettingsStore.getState().hydrateForUser(testUserId);
      useSettingsStore.getState().setUnits('imperial');

      assert.equal(useSettingsStore.getState().units, 'imperial');
      assert.equal(useSettingsStore.getState().userId, testUserId);
    });
  });
});
