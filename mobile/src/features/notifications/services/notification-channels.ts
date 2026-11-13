import { NOTIFICATION_CHANNELS } from '../../../services/notificationService';
import type { AndroidChannelConfig, NotificationEnvironment, NotificationsNative } from '../types/push';

/**
 * Expo's `AndroidImportance` numbering for expo-notifications SDK 58.
 *
 * This is NOT Android's native 0–5 scale: HIGH is 6 here, while 4 means LOW.
 * `tests/notifications-foundation-native.test.ts` parses the installed SDK's
 * type declarations to keep these constants honest.
 */
export const EXPO_ANDROID_IMPORTANCE = {
  NONE: 2,
  MIN: 3,
  LOW: 4,
  DEFAULT: 5,
  HIGH: 6,
  MAX: 7,
} as const;

/** Channels introduced by this feature (the legacy three stay in notificationService). */
export const PUSH_CHANNELS = {
  GOAL: 'goal-reminders',
  REMOTE: 'remote-updates',
} as const;

const BRAND_COLOR = '#208AEF';

/**
 * Single source of truth for every channel the app owns.
 *
 * The three legacy channels mirror the names/sounds the existing service
 * already uses, but with importance values expressed in Expo's numbering.
 * (The existing service passes the raw numbers 4/3/2 labelled HIGH/DEFAULT/LOW,
 * which Expo interprets as LOW/MIN/NONE; the engine adapter applies these
 * canonical definitions instead.)
 */
export const CHANNEL_DEFINITIONS: Readonly<Record<string, AndroidChannelConfig>> = {
  [NOTIFICATION_CHANNELS.WORKOUT]: {
    name: 'Workout Reminders',
    importance: EXPO_ANDROID_IMPORTANCE.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: BRAND_COLOR,
    sound: 'default',
  },
  [NOTIFICATION_CHANNELS.WATER]: {
    name: 'Water & Hydration Reminders',
    importance: EXPO_ANDROID_IMPORTANCE.DEFAULT,
    vibrationPattern: [0, 200],
    lightColor: BRAND_COLOR,
    sound: 'default',
  },
  [NOTIFICATION_CHANNELS.SYSTEM]: {
    name: 'System Notifications',
    importance: EXPO_ANDROID_IMPORTANCE.LOW,
    sound: null,
  },
  [PUSH_CHANNELS.GOAL]: {
    name: 'Goal Reminders',
    importance: EXPO_ANDROID_IMPORTANCE.DEFAULT,
    vibrationPattern: [0, 200],
    lightColor: BRAND_COLOR,
    sound: 'default',
  },
  [PUSH_CHANNELS.REMOTE]: {
    name: 'Coach & Account Updates',
    importance: EXPO_ANDROID_IMPORTANCE.DEFAULT,
    vibrationPattern: [0, 200],
    lightColor: BRAND_COLOR,
    sound: 'default',
  },
};

/** Canonical definition for known channels; unknown channels pass through untouched. */
export function resolveChannelConfig(channelId: string, incoming: AndroidChannelConfig): AndroidChannelConfig {
  return CHANNEL_DEFINITIONS[channelId] ?? incoming;
}

export interface EnsureChannelsResult {
  ok: boolean;
  created: string[];
  failed: string[];
}

const ensured = new WeakMap<object, Promise<EnsureChannelsResult>>();

/**
 * Create every owned channel (Android only). Idempotent per native instance.
 * Per the SDK 58 reference, channels must exist before the Android 13+ permission prompt
 * can appear and before `getDevicePushTokenAsync`, so both flows call this first.
 */
export function ensureNotificationChannels(
  native: NotificationsNative,
  env: NotificationEnvironment,
): Promise<EnsureChannelsResult> {
  if (env.platform !== 'android') {
    return Promise.resolve({ ok: true, created: [], failed: [] });
  }

  const memo = ensured.get(native);
  if (memo) return memo;

  const run = (async (): Promise<EnsureChannelsResult> => {
    const created: string[] = [];
    const failed: string[] = [];
    for (const [id, definition] of Object.entries(CHANNEL_DEFINITIONS)) {
      try {
        await native.setNotificationChannelAsync(id, definition);
        created.push(id);
      } catch {
        failed.push(id);
      }
    }
    return { ok: failed.length === 0, created, failed };
  })();

  ensured.set(native, run);
  // A failed run must not be memoized forever, or a transient native error would
  // permanently block permission prompts.
  void run.then((result) => {
    if (!result.ok && ensured.get(native) === run) ensured.delete(native);
  });
  return run;
}
