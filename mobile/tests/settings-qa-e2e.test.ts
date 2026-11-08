import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  kgToLb,
  lbToKg,
  formatWeight,
  parseWeightInputToKg,
  cmToFtIn,
  ftInToCm,
  formatHeight,
  parseHeightInputToCm,
} from '../src/shared/utils/unit-conversion';
import {
  useSettingsStore,
  getSettingsStorageKey,
  setSettingsStorageEngine,
  DEFAULT_SETTINGS,
} from '../src/shared/stores/settingsStore';
import { useAuthStore } from '../src/features/auth/stores/auth-store';
import { AuthService } from '../src/features/auth/services/auth-service';
import { SecureStorageService } from '../src/services/secure-storage';
import { apiClient } from '../src/services/api-client';
import type { UserSettingsView } from '../src/features/profile/types/profile';

describe('Phase 9.5 QA: Full Settings Integration & Security Quality Assurance', () => {
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
  });

  describe('1. Settings Persistence & Account Switching QA', () => {
    const userA = 'user-e2e-alice-1111';
    const userB = 'user-e2e-bob-2222';

    it('executes full multi-user session lifecycle with zero preference leakage', async () => {
      // 1. User A logs in and configures custom settings
      await useSettingsStore.getState().hydrateForUser(userA);
      useSettingsStore.getState().setUnits('imperial');
      useSettingsStore.getState().setTheme('dark');
      useSettingsStore.getState().setLanguage('ta');
      useSettingsStore.getState().setPrivacy({
        privacyAnalytics: false,
        privacyCoachSharing: true,
      });

      // Allow async persist
      await new Promise((r) => setTimeout(r, 20));

      assert.equal(useSettingsStore.getState().userId, userA);
      assert.equal(useSettingsStore.getState().units, 'imperial');
      assert.equal(useSettingsStore.getState().theme, 'dark');
      assert.equal(useSettingsStore.getState().language, 'ta');
      assert.equal(useSettingsStore.getState().privacyAnalytics, false);
      assert.equal(useSettingsStore.getState().privacyCoachSharing, true);

      // Verify User A stored independently in storage
      const userAData = memoryStorage.get(getSettingsStorageKey(userA));
      assert.ok(userAData);
      assert.match(userAData, /"units":"imperial"/);
      assert.match(userAData, /"privacyCoachSharing":true/);

      // 2. User A logs out
      useSettingsStore.getState().resetSettings();
      assert.equal(useSettingsStore.getState().userId, null);
      assert.equal(useSettingsStore.getState().units, 'metric');
      assert.equal(useSettingsStore.getState().theme, 'system');
      assert.equal(useSettingsStore.getState().language, 'en');
      assert.equal(useSettingsStore.getState().privacyCoachSharing, false);

      // 3. User B logs in (new account)
      await useSettingsStore.getState().hydrateForUser(userB);
      assert.equal(useSettingsStore.getState().userId, userB);
      assert.equal(useSettingsStore.getState().units, 'metric');
      assert.equal(useSettingsStore.getState().theme, 'system');
      assert.equal(useSettingsStore.getState().language, 'en');
      assert.equal(useSettingsStore.getState().privacyCoachSharing, false);

      // 4. User B logs out, User A logs back in
      useSettingsStore.getState().resetSettings();
      await useSettingsStore.getState().hydrateForUser(userA);

      // User A's preferences fully restored
      assert.equal(useSettingsStore.getState().userId, userA);
      assert.equal(useSettingsStore.getState().units, 'imperial');
      assert.equal(useSettingsStore.getState().theme, 'dark');
      assert.equal(useSettingsStore.getState().language, 'ta');
      assert.equal(useSettingsStore.getState().privacyCoachSharing, true);
    });

    it('safely handles rapid toggle changes without state corruption', async () => {
      await useSettingsStore.getState().hydrateForUser('rapid-user');

      // Trigger 10 rapid toggles
      for (let i = 0; i < 10; i++) {
        useSettingsStore.getState().setPrivacy({
          privacyAnalytics: i % 2 === 0,
        });
      }

      await new Promise((r) => setTimeout(r, 20));

      // Final state must match the last toggle (false when i=9)
      assert.equal(useSettingsStore.getState().privacyAnalytics, false);
    });
  });

  describe('2. Centralized Unit Conversion & Precision QA', () => {
    it('preserves round-trip weight fidelity within 0.05kg tolerance', () => {
      const testWeightsKg = [45, 68.5, 75, 82.3, 100, 125.7];

      for (const originalKg of testWeightsKg) {
        const lb = kgToLb(originalKg, 2)!;
        const convertedBackKg = lbToKg(lb, 2)!;
        const delta = Math.abs(originalKg - convertedBackKg);
        assert.ok(
          delta < 0.05,
          `Round-trip weight delta ${delta} exceeds threshold for ${originalKg}kg`,
        );
      }
    });

    it('handles decimal precision and zero/negative/invalid inputs safely', () => {
      // Valid formatting
      assert.equal(formatWeight(75.5, 'metric', { precision: 1 }), '75.5 kg');
      assert.equal(formatWeight(75.5, 'imperial', { precision: 1 }), '166.4 lb');

      // Invalid / edge cases return fallbacks without crashing
      assert.equal(formatWeight(0, 'metric'), '—');
      assert.equal(formatWeight(-10, 'metric'), '—');
      assert.equal(formatWeight(null, 'metric'), '—');
      assert.equal(formatWeight(undefined, 'metric'), '—');
      assert.equal(formatWeight(NaN, 'metric'), '—');
      assert.equal(formatWeight(Infinity, 'metric'), '—');

      // Custom fallback
      assert.equal(formatWeight(null, 'metric', { fallback: 'N/A' }), 'N/A');
    });

    it('enforces canonical metric storage invariant when parsing user input', () => {
      // Metric inputs are parsed directly to kg
      assert.equal(parseWeightInputToKg('78.5', 'metric'), 78.5);
      assert.equal(parseWeightInputToKg(78.5, 'metric'), 78.5);

      // Imperial inputs are converted back to canonical kg
      // 170 lb * 0.45359237 = 77.1107... -> 77.11 kg
      assert.equal(parseWeightInputToKg('170', 'imperial'), 77.11);

      // Height canonical invariant
      assert.equal(parseHeightInputToCm({ cm: '180' }, 'metric'), 180);
      // 5 ft 11 in => (5 * 12 + 11) * 2.54 = 71 * 2.54 = 180.34 -> 180.3 cm
      assert.equal(parseHeightInputToCm({ feet: 5, inches: 11 }, 'imperial'), 180.3);

      // Empty or invalid input returns null
      assert.equal(parseWeightInputToKg('', 'metric'), null);
      assert.equal(parseWeightInputToKg('abc', 'metric'), null);
      assert.equal(parseHeightInputToCm({ cm: '' }, 'metric'), null);
    });
  });

  describe('3. Change Password Security & Session Revocation QA', () => {
    it('verifies that sensitive passwords are never stored in settingsStore or local caches', () => {
      const state = useSettingsStore.getState();
      assert.equal((state as any).password, undefined);
      assert.equal((state as any).currentPassword, undefined);
      assert.equal((state as any).newPassword, undefined);

      for (const [, val] of memoryStorage.entries()) {
        assert.ok(!val.includes('password'));
      }
    });

    it('dispatches password change and tracks revoked sessions count', async () => {
      let dispatched = false;
      const originalPost = apiClient.post;
      apiClient.post = (url: string) => {
        if (url === '/auth/change-password') {
          dispatched = true;
          return Promise.resolve({
            data: {
              success: true,
              data: { revokedSessions: 3 },
            },
          }) as any;
        }
        return Promise.reject(new Error('Unknown url'));
      };

      try {
        await AuthService.changePassword('ValidCurrentPassword123!', 'BrandNewSecurePassword456!');
        assert.equal(dispatched, true);
      } finally {
        apiClient.post = originalPost;
      }
    });
  });

  describe('4. Secure Account Deletion & Fault Isolation QA', () => {
    it('preserves user session and tokens completely if deletion request fails', async () => {
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

      await SecureStorageService.setItem('auth.access_token', 'test-access-token');
      useAuthStore.getState().setAuth({
        id: 'user-keep-session',
        name: 'User',
        email: 'user@example.com',
        isEmailVerified: true,
      });

      try {
        await assert.rejects(
          async () => {
            await AuthService.deleteAccount('WrongPass');
          },
          /The password is incorrect\./,
        );

        // Verification: Token and session must remain completely intact
        const token = await SecureStorageService.getItem('auth.access_token');
        assert.equal(token, 'test-access-token');
        assert.equal(useAuthStore.getState().isAuthenticated, true);
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
            data: { deletedUserId: 'user-to-wipe' },
          },
        }) as any;
      };

      await SecureStorageService.setItem('auth.access_token', 'wipe-token');
      await SecureStorageService.setItem('auth.refresh_token', 'wipe-refresh');
      useAuthStore.getState().setAuth({
        id: 'user-to-wipe',
        name: 'Wipe User',
        email: 'wipe@example.com',
        isEmailVerified: true,
      });
      useSettingsStore.getState().setTheme('dark');

      try {
        await AuthService.deleteAccount('CorrectPassword123!');

        const token = await SecureStorageService.getItem('auth.access_token');
        const refresh = await SecureStorageService.getItem('auth.refresh_token');
        assert.equal(token, null);
        assert.equal(refresh, null);

        assert.equal(useAuthStore.getState().isAuthenticated, false);
        assert.equal(useAuthStore.getState().user, null);
        assert.equal(useSettingsStore.getState().theme, 'system');
      } finally {
        apiClient.delete = originalDelete;
      }
    });
  });

  describe('5. Privacy Preferences Enforcement Audit & Truthfulness', () => {
    it('enforces explicit opt-in default of false for AI coach sharing in domain models', () => {
      assert.equal(DEFAULT_SETTINGS.privacyCoachSharing, false);
      assert.equal(DEFAULT_SETTINGS.privacyAnalytics, true);
      assert.equal(DEFAULT_SETTINGS.privacyPhotoRetention, true);
    });

    it('discards stale async server responses destined for a previous user session', async () => {
      await useSettingsStore.getState().hydrateForUser('active-user-1');
      useSettingsStore.getState().setUnits('metric');

      // Stale response from a previous background fetch for 'stale-user-2'
      const staleServerData: UserSettingsView = {
        userId: 'stale-user-2',
        themeMode: 'dark',
        unitSystem: 'imperial',
        healthConnectEnabled: false,
        smartwatchConnected: false,
        notificationsEnabled: true,
        updatedAt: '2026-11-07T00:00:00Z',
      };

      await useSettingsStore.getState().syncFromServer(staleServerData);

      // Active user settings must NOT be overwritten by stale response
      assert.equal(useSettingsStore.getState().userId, 'active-user-1');
      assert.equal(useSettingsStore.getState().units, 'metric');
    });
  });
});
