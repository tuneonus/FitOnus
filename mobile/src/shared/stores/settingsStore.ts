import { create } from 'zustand';
import type { UserSettingsView } from '../../features/profile/types/profile';
import { DEFAULT_NOTIFICATION_SCHEDULE } from '../../features/notifications/types/notification';

const logError = (msg: string, err?: any) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.error(`[SettingsStore] ${msg}`, err);
  }
};

export type ThemePreference = 'light' | 'dark' | 'system';
export type Units = 'metric' | 'imperial';
export type LanguagePreference = 'en' | 'ta';

export interface PrivacySettings {
  privacyAnalytics: boolean;
  privacyPhotoRetention: boolean;
  privacyCoachSharing: boolean;
}

export interface StorableSettings {
  theme: ThemePreference;
  units: Units;
  language: LanguagePreference;
  privacyAnalytics: boolean;
  privacyPhotoRetention: boolean;
  privacyCoachSharing: boolean;
  notificationsEnabled: boolean;
  notificationSchedule: Record<string, unknown>;
  updatedAt?: string;
}

export interface SettingsStorageEngine {
  getItem: (key: string) => Promise<string | null | undefined>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem?: (key: string) => Promise<void>;
}

export interface SettingsState extends StorableSettings {
  userId: string | null;
  isHydrated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setTheme: (theme: ThemePreference) => void;
  /** Loads the saved device theme into the store. Never throws. */
  hydrateTheme: () => Promise<ThemePreference>;
  setUnits: (units: Units) => void;
  setLanguage: (language: LanguagePreference) => void;
  setPrivacy: (privacy: Partial<PrivacySettings>) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setNotificationSchedule: (schedule: Record<string, unknown>) => void;
  hydrateForUser: (userId: string | null) => Promise<void>;
  syncFromServer: (settings: UserSettingsView) => Promise<void>;
  resetSettings: () => void;
  resetStore: () => void;
}

export const DEFAULT_SETTINGS: StorableSettings = {
  theme: 'system',
  units: 'metric',
  language: 'en',
  privacyAnalytics: true,
  privacyPhotoRetention: true,
  privacyCoachSharing: false, // Explicit opt-in
  notificationsEnabled: true,
  notificationSchedule: {},
};

export const THEME_STORAGE_KEY = 'app.theme_mode';

/**
 * The theme is a device-level preference: THEME_STORAGE_KEY is its single
 * source of truth on this device, and it is loaded once at the app root
 * (hydrateTheme) before any navigation renders. Per-user records, logout and
 * login must never reset it back to 'system' behind the user's back.
 *
 * Until the stored value has been read, nothing may write THEME_STORAGE_KEY,
 * otherwise an early setter (e.g. setUnits) would persist the default
 * 'system' over the saved choice.
 */
let themeLoaded = false;

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

let overrideStorage: SettingsStorageEngine | null = null;
const memoryFallback = new Map<string, string>();
const memoryFallbackStorage: SettingsStorageEngine = {
  getItem: (key) => Promise.resolve(memoryFallback.get(key) ?? null),
  setItem: (key, val) => {
    memoryFallback.set(key, val);
    return Promise.resolve();
  },
  removeItem: (key) => {
    memoryFallback.delete(key);
    return Promise.resolve();
  },
};

export function setSettingsStorageEngine(engine: SettingsStorageEngine | null) {
  overrideStorage = engine;
}

async function getStorageEngine(): Promise<SettingsStorageEngine> {
  if (overrideStorage) {
    return overrideStorage;
  }
  try {
    // Dynamic runtime resolution prevents esbuild from crawling native react-native during node test runner
    const req = eval('require');
    const { StorageService } = req('../../services/storage');
    return StorageService as unknown as SettingsStorageEngine;
  } catch {
    return memoryFallbackStorage;
  }
}

export function getSettingsStorageKey(userId: string | null): string {
  const cleanId = userId && userId.trim() ? userId.trim() : 'guest';
  return `fitonus.settings.${cleanId}`;
}

async function persistSettings(userId: string | null, settings: StorableSettings): Promise<void> {
  try {
    const key = getSettingsStorageKey(userId);
    const serialized = JSON.stringify(settings);
    const storage = await getStorageEngine();

    await storage.setItem(key, serialized);
    if (themeLoaded && settings.theme && storage.setItem) {
      await storage.setItem(THEME_STORAGE_KEY, settings.theme);
    }
  } catch (error) {
    logError('Failed to persist user settings to disk', error);
  }
}

async function readDeviceTheme(): Promise<ThemePreference | undefined> {
  try {
    const storage = await getStorageEngine();
    const saved = await storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(saved) ? saved : undefined;
  } catch (error) {
    logError('Failed to read saved theme', error);
    return undefined;
  }
}

async function readSettings(userId: string | null): Promise<string | null | undefined> {
  const key = getSettingsStorageKey(userId);
  const storage = await getStorageEngine();
  return await storage.getItem(key);
}

function safeReconcile(settings: { notificationsEnabled: boolean; notificationSchedule: Record<string, unknown> }) {
  try {
    const req = eval('require');
    const { notificationService } = req('../../services/notificationService');
    if (notificationService?.reconcileNotificationSchedules) {
      void notificationService.reconcileNotificationSchedules({
        notificationsEnabled: settings.notificationsEnabled,
        schedule: settings.notificationSchedule,
      });
    }
  } catch {
    // Graceful fallback for headless or test runner
  }
}

function safeCancelAll() {
  try {
    const req = eval('require');
    const { notificationService } = req('../../services/notificationService');
    if (notificationService?.cancelAllFitOnusReminders) {
      void notificationService.cancelAllFitOnusReminders();
    }
  } catch {
    // Graceful fallback for headless or test runner
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  userId: null,
  isHydrated: false,
  isLoading: false,
  error: null,

  hydrateTheme: async () => {
    const saved = await readDeviceTheme();
    themeLoaded = true;
    if (saved && get().theme !== saved) set({ theme: saved });
    return get().theme;
  },

  setTheme: (theme: ThemePreference) => {
    themeLoaded = true;
    const nextState = { ...get(), theme };
    set({ theme });
    void persistSettings(get().userId, {
      theme: nextState.theme,
      units: nextState.units,
      language: nextState.language,
      privacyAnalytics: nextState.privacyAnalytics,
      privacyPhotoRetention: nextState.privacyPhotoRetention,
      privacyCoachSharing: nextState.privacyCoachSharing,
      notificationsEnabled: nextState.notificationsEnabled,
      notificationSchedule: nextState.notificationSchedule,
    });
  },

  setUnits: (units: Units) => {
    const nextState = { ...get(), units };
    set({ units });
    void persistSettings(get().userId, {
      theme: nextState.theme,
      units: nextState.units,
      language: nextState.language,
      privacyAnalytics: nextState.privacyAnalytics,
      privacyPhotoRetention: nextState.privacyPhotoRetention,
      privacyCoachSharing: nextState.privacyCoachSharing,
      notificationsEnabled: nextState.notificationsEnabled,
      notificationSchedule: nextState.notificationSchedule,
    });
  },

  setLanguage: (language: LanguagePreference) => {
    const nextState = { ...get(), language };
    set({ language });
    void persistSettings(get().userId, {
      theme: nextState.theme,
      units: nextState.units,
      language: nextState.language,
      privacyAnalytics: nextState.privacyAnalytics,
      privacyPhotoRetention: nextState.privacyPhotoRetention,
      privacyCoachSharing: nextState.privacyCoachSharing,
      notificationsEnabled: nextState.notificationsEnabled,
      notificationSchedule: nextState.notificationSchedule,
    });
  },

  setPrivacy: (privacy: Partial<PrivacySettings>) => {
    set((state) => {
      const nextPrivacy = {
        privacyAnalytics: privacy.privacyAnalytics ?? state.privacyAnalytics,
        privacyPhotoRetention: privacy.privacyPhotoRetention ?? state.privacyPhotoRetention,
        privacyCoachSharing: privacy.privacyCoachSharing ?? state.privacyCoachSharing,
      };
      void persistSettings(state.userId, {
        theme: state.theme,
        units: state.units,
        language: state.language,
        notificationsEnabled: state.notificationsEnabled,
        notificationSchedule: state.notificationSchedule,
        ...nextPrivacy,
      });
      return nextPrivacy;
    });
  },

  setNotificationsEnabled: (notificationsEnabled: boolean) => {
    const nextState = { ...get(), notificationsEnabled };
    set({ notificationsEnabled });
    void persistSettings(get().userId, {
      theme: nextState.theme,
      units: nextState.units,
      language: nextState.language,
      privacyAnalytics: nextState.privacyAnalytics,
      privacyPhotoRetention: nextState.privacyPhotoRetention,
      privacyCoachSharing: nextState.privacyCoachSharing,
      notificationsEnabled: nextState.notificationsEnabled,
      notificationSchedule: nextState.notificationSchedule,
    });
    safeReconcile(nextState);
  },

  setNotificationSchedule: (notificationSchedule: Record<string, unknown>) => {
    const nextState = { ...get(), notificationSchedule };
    set({ notificationSchedule });
    void persistSettings(get().userId, {
      theme: nextState.theme,
      units: nextState.units,
      language: nextState.language,
      privacyAnalytics: nextState.privacyAnalytics,
      privacyPhotoRetention: nextState.privacyPhotoRetention,
      privacyCoachSharing: nextState.privacyCoachSharing,
      notificationsEnabled: nextState.notificationsEnabled,
      notificationSchedule: nextState.notificationSchedule,
    });
    safeReconcile(nextState);
  },

  hydrateForUser: async (userId: string | null) => {
    set({ isLoading: true, error: null });
    try {
      const raw = await readSettings(userId);
      const deviceTheme = await readDeviceTheme();
      themeLoaded = true;
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StorableSettings>;
        const hydrated = {
          theme: deviceTheme ?? parsed.theme ?? DEFAULT_SETTINGS.theme,
          units: parsed.units ?? DEFAULT_SETTINGS.units,
          language: parsed.language ?? DEFAULT_SETTINGS.language,
          privacyAnalytics: parsed.privacyAnalytics ?? DEFAULT_SETTINGS.privacyAnalytics,
          privacyPhotoRetention: parsed.privacyPhotoRetention ?? DEFAULT_SETTINGS.privacyPhotoRetention,
          privacyCoachSharing: parsed.privacyCoachSharing ?? DEFAULT_SETTINGS.privacyCoachSharing,
          notificationsEnabled: parsed.notificationsEnabled ?? DEFAULT_SETTINGS.notificationsEnabled,
          notificationSchedule: parsed.notificationSchedule ?? DEFAULT_SETTINGS.notificationSchedule,
          userId,
          isHydrated: true,
          isLoading: false,
        };
        set(hydrated);
        safeReconcile(hydrated);
        return;
      }

      // No saved record yet for this user -> initialize with clean defaults
      const defaults = {
        ...DEFAULT_SETTINGS,
        theme: deviceTheme ?? get().theme,
        userId,
        isHydrated: true,
        isLoading: false,
      };
      set(defaults);
      safeReconcile(defaults);
    } catch (err: any) {
      logError(`Error hydrating settings for user ${userId}`, err);
      set({
        ...DEFAULT_SETTINGS,
        theme: get().theme,
        userId,
        isHydrated: true,
        isLoading: false,
        error: err?.message || 'Failed to load settings',
      });
    }
  },

  syncFromServer: async (serverSettings: UserSettingsView) => {
    const current = get();

    // Stale response guard: If the server response is for a different user, ignore it.
    if (current.userId && serverSettings.userId && current.userId !== serverSettings.userId) {
      return;
    }

    if (isThemePreference(serverSettings.themeMode)) themeLoaded = true;

    const merged: StorableSettings = {
      theme: isThemePreference(serverSettings.themeMode) ? serverSettings.themeMode : current.theme,
      units: (serverSettings.unitSystem as Units) || current.units,
      language: (serverSettings.language as LanguagePreference) || current.language || 'en',
      privacyAnalytics:
        serverSettings.privacyAnalytics !== undefined
          ? serverSettings.privacyAnalytics
          : current.privacyAnalytics,
      privacyPhotoRetention:
        serverSettings.privacyPhotoRetention !== undefined
          ? serverSettings.privacyPhotoRetention
          : current.privacyPhotoRetention,
      privacyCoachSharing:
        serverSettings.privacyCoachSharing !== undefined
          ? serverSettings.privacyCoachSharing
          : current.privacyCoachSharing,
      notificationsEnabled:
        serverSettings.notificationsEnabled !== undefined
          ? serverSettings.notificationsEnabled
          : current.notificationsEnabled,
      notificationSchedule:
        serverSettings.notificationSchedule !== undefined
          ? serverSettings.notificationSchedule
          : current.notificationSchedule,
      updatedAt: serverSettings.updatedAt,
    };

    set({
      ...merged,
      userId: serverSettings.userId || current.userId,
      isHydrated: true,
    });

    await persistSettings(serverSettings.userId || current.userId, merged);
    safeReconcile(merged);
  },

  resetSettings: () => {
    set({
      ...DEFAULT_SETTINGS,
      // Appearance belongs to the device, not the account: logging out keeps it.
      theme: get().theme,
      userId: null,
      isHydrated: true,
      isLoading: false,
      error: null,
    });
    safeCancelAll();
  },

  resetStore: () => {
    get().resetSettings();
  },
}));

/**
 * Optional helper to bind auth lifecycle changes to settings store.
 */
export function bindAuthToSettings(authStore: {
  getState: () => { user: { id: string } | null };
  subscribe: (listener: (state: any, prevState: any) => void) => () => void;
}) {
  return authStore.subscribe((state, prevState) => {
    const currentUserId = state.user?.id ?? null;
    const previousUserId = prevState.user?.id ?? null;

    if (currentUserId !== previousUserId) {
      if (!currentUserId) {
        useSettingsStore.getState().resetSettings();
      } else {
        void useSettingsStore.getState().hydrateForUser(currentUserId);
      }
    }
  });
}
