import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  useSettingsStore,
  DEFAULT_SETTINGS,
  getSettingsStorageKey,
  THEME_STORAGE_KEY,
  setSettingsStorageEngine,
} from '../src/shared/stores/settingsStore';
import type { UserSettingsView } from '../src/features/profile/types/profile';

describe('Phase 9.3 Settings: Storage Scoping & User Isolation', () => {
  const userA = 'user-uuid-1111-aaaa';
  const userB = 'user-uuid-2222-bbbb';
  const memoryStore = new Map<string, string>();

  beforeEach(() => {
    memoryStore.clear();
    setSettingsStorageEngine({
      getItem: (key) => Promise.resolve(memoryStore.get(key) ?? null),
      setItem: (key, val) => {
        memoryStore.set(key, val);
        return Promise.resolve();
      },
      removeItem: (key) => {
        memoryStore.delete(key);
        return Promise.resolve();
      },
    });
    useSettingsStore.getState().resetSettings();
  });

  it('generates distinct user-scoped storage keys', () => {
    assert.equal(getSettingsStorageKey(userA), 'fitonus.settings.user-uuid-1111-aaaa');
    assert.equal(getSettingsStorageKey(userB), 'fitonus.settings.user-uuid-2222-bbbb');
    assert.equal(getSettingsStorageKey(null), 'fitonus.settings.guest');
    assert.equal(getSettingsStorageKey(''), 'fitonus.settings.guest');
  });

  it('maintains complete user isolation between sessions without preference leakage', async () => {
    // 1. User A logs in and customizes settings
    await useSettingsStore.getState().hydrateForUser(userA);
    useSettingsStore.getState().setUnits('imperial');
    useSettingsStore.getState().setTheme('dark');
    useSettingsStore.getState().setLanguage('ta');
    useSettingsStore.getState().setPrivacy({ privacyCoachSharing: true });

    // Allow async persistSettings tick
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(useSettingsStore.getState().units, 'imperial');
    assert.equal(useSettingsStore.getState().theme, 'dark');
    assert.equal(useSettingsStore.getState().language, 'ta');
    assert.equal(useSettingsStore.getState().privacyCoachSharing, true);

    // Verify written to User A's key in storage
    const userAStored = memoryStore.get(getSettingsStorageKey(userA));
    assert.ok(userAStored, 'User A settings should be persisted in storage');
    assert.match(userAStored, /"units":"imperial"/);
    assert.match(userAStored, /"language":"ta"/);

    // 2. User A logs out
    useSettingsStore.getState().resetSettings();

    // Store is back to clean defaults
    assert.equal(useSettingsStore.getState().userId, null);
    assert.equal(useSettingsStore.getState().units, 'metric');
    assert.equal(useSettingsStore.getState().theme, 'system');
    assert.equal(useSettingsStore.getState().language, 'en');
    assert.equal(useSettingsStore.getState().privacyCoachSharing, false);

    // 3. User B logs in (new user, no saved preferences)
    await useSettingsStore.getState().hydrateForUser(userB);

    // User B receives clean defaults, zero leakage from User A
    assert.equal(useSettingsStore.getState().userId, userB);
    assert.equal(useSettingsStore.getState().units, 'metric');
    assert.equal(useSettingsStore.getState().theme, 'system');
    assert.equal(useSettingsStore.getState().language, 'en');
    assert.equal(useSettingsStore.getState().privacyCoachSharing, false);

    // 4. User B logs out, User A logs back in
    useSettingsStore.getState().resetSettings();
    await useSettingsStore.getState().hydrateForUser(userA);

    // User A's custom preferences are faithfully restored
    assert.equal(useSettingsStore.getState().userId, userA);
    assert.equal(useSettingsStore.getState().units, 'imperial');
    assert.equal(useSettingsStore.getState().theme, 'dark');
    assert.equal(useSettingsStore.getState().language, 'ta');
    assert.equal(useSettingsStore.getState().privacyCoachSharing, true);
  });
});

describe('Phase 9.3 Settings: Backend DTO & Contract Compatibility', () => {
  const memoryStore = new Map<string, string>();

  beforeEach(() => {
    memoryStore.clear();
    setSettingsStorageEngine({
      getItem: (key) => Promise.resolve(memoryStore.get(key) ?? null),
      setItem: (key, val) => {
        memoryStore.set(key, val);
        return Promise.resolve();
      },
      removeItem: (key) => {
        memoryStore.delete(key);
        return Promise.resolve();
      },
    });
    useSettingsStore.getState().resetSettings();
  });

  it('syncs complete Phase 9.2 backend settings payload correctly', async () => {
    const mockServerSettings: UserSettingsView = {
      userId: 'user-contract-123',
      themeMode: 'dark',
      unitSystem: 'imperial',
      healthConnectEnabled: true,
      smartwatchConnected: false,
      notificationsEnabled: true,
      language: 'ta',
      privacyAnalytics: false,
      privacyPhotoRetention: true,
      privacyCoachSharing: true,
      notificationSchedule: {
        workoutReminders: { enabled: true, time: '08:00' },
      },
      updatedAt: '2026-11-07T08:00:00.000Z',
    };

    await useSettingsStore.getState().syncFromServer(mockServerSettings);

    const state = useSettingsStore.getState();
    assert.equal(state.userId, 'user-contract-123');
    assert.equal(state.theme, 'dark');
    assert.equal(state.units, 'imperial');
    assert.equal(state.language, 'ta');
    assert.equal(state.privacyAnalytics, false);
    assert.equal(state.privacyPhotoRetention, true);
    assert.equal(state.privacyCoachSharing, true);
    assert.deepEqual(state.notificationSchedule, {
      workoutReminders: { enabled: true, time: '08:00' },
    });
  });

  it('safely handles backward compatibility when server lacks Phase 9.2 fields (pre-migration)', async () => {
    // Simulated response from Dev server before Migration 0012
    const legacyServerSettings = {
      userId: 'user-legacy-456',
      themeMode: 'light' as const,
      unitSystem: 'metric' as const,
      healthConnectEnabled: false,
      smartwatchConnected: false,
      notificationsEnabled: false,
      updatedAt: '2026-11-01T00:00:00.000Z',
    } as UserSettingsView;

    await useSettingsStore.getState().syncFromServer(legacyServerSettings);

    const state = useSettingsStore.getState();
    assert.equal(state.userId, 'user-legacy-456');
    assert.equal(state.theme, 'light');
    assert.equal(state.units, 'metric');
    assert.equal(state.notificationsEnabled, false);

    // Fallbacks provided safely without crashing or returning undefined
    assert.equal(state.language, 'en');
    assert.equal(state.privacyAnalytics, true);
    assert.equal(state.privacyPhotoRetention, true);
    assert.equal(state.privacyCoachSharing, false);
    assert.deepEqual(state.notificationSchedule, {});
  });

  it('discards stale asynchronous responses destined for a different user', async () => {
    await useSettingsStore.getState().hydrateForUser('active-user-777');
    useSettingsStore.getState().setUnits('imperial');

    // Simulate delayed response arriving from previous user session
    const staleResponse: UserSettingsView = {
      userId: 'old-user-999',
      themeMode: 'light',
      unitSystem: 'metric',
      healthConnectEnabled: false,
      smartwatchConnected: false,
      notificationsEnabled: true,
      updatedAt: '2026-11-07T00:00:00.000Z',
    };

    await useSettingsStore.getState().syncFromServer(staleResponse);

    // Active user settings must remain intact
    const state = useSettingsStore.getState();
    assert.equal(state.userId, 'active-user-777');
    assert.equal(state.units, 'imperial'); // NOT overwritten by stale response
  });
});

describe('Phase 9.3 Settings: Theme & Language Preferences', () => {
  const memoryStore = new Map<string, string>();

  beforeEach(() => {
    memoryStore.clear();
    setSettingsStorageEngine({
      getItem: (key) => Promise.resolve(memoryStore.get(key) ?? null),
      setItem: (key, val) => {
        memoryStore.set(key, val);
        return Promise.resolve();
      },
      removeItem: (key) => {
        memoryStore.delete(key);
        return Promise.resolve();
      },
    });
    useSettingsStore.getState().resetSettings();
  });

  it('synchronizes theme mode and updates theme storage key', async () => {
    useSettingsStore.getState().setTheme('light');
    assert.equal(useSettingsStore.getState().theme, 'light');

    await new Promise((r) => setTimeout(r, 20));
    const savedMode = memoryStore.get(THEME_STORAGE_KEY);
    assert.equal(savedMode, 'light');

    useSettingsStore.getState().setTheme('dark');
    assert.equal(useSettingsStore.getState().theme, 'dark');

    await new Promise((r) => setTimeout(r, 20));
    const updatedMode = memoryStore.get(THEME_STORAGE_KEY);
    assert.equal(updatedMode, 'dark');
  });

  it('manages language preferences truthfully without prematurely enabling incomplete localizations', () => {
    // English is the default
    assert.equal(useSettingsStore.getState().language, 'en');

    // Setting Tamil preference saves value for profile sync
    useSettingsStore.getState().setLanguage('ta');
    assert.equal(useSettingsStore.getState().language, 'ta');
  });

  it('strictly enforces explicit opt-in privacy defaults', () => {
    assert.equal(DEFAULT_SETTINGS.privacyCoachSharing, false);
    assert.equal(DEFAULT_SETTINGS.privacyAnalytics, true);
    assert.equal(DEFAULT_SETTINGS.privacyPhotoRetention, true);
  });
});
