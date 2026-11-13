import type {
  NotificationEnvironment,
  NotificationPermissionState,
  NotificationsNative,
  PermissionSnapshot,
} from '../types/push';
import { ensureNotificationChannels } from './notification-channels';

export function isNotificationCapablePlatform(platform: string): boolean {
  return platform === 'android' || platform === 'ios';
}

/** Remote push APIs were removed from Expo Go on Android in SDK 53 and THROW there. */
export function isExpoGoAndroid(env: NotificationEnvironment): boolean {
  return env.platform === 'android' && env.isExpoGo;
}

/**
 * Whether device push-token APIs (`addPushTokenListener`, `getDevicePushTokenAsync`)
 * may be called at all in this runtime. Local notifications are unaffected.
 */
export function supportsRemotePushApis(env: NotificationEnvironment): boolean {
  return isNotificationCapablePlatform(env.platform) && !isExpoGoAndroid(env);
}

function mapSnapshot(snapshot: PermissionSnapshot): NotificationPermissionState {
  const status =
    snapshot.granted || snapshot.status === 'granted'
      ? 'granted'
      : snapshot.status === 'undetermined'
        ? 'undetermined'
        : 'denied';
  return {
    status,
    granted: status === 'granted',
    canAskAgain: snapshot.canAskAgain,
    requiresSystemSettings: status === 'denied' && !snapshot.canAskAgain,
  };
}

const UNSUPPORTED: NotificationPermissionState = {
  status: 'unsupported',
  granted: false,
  canAskAgain: false,
  requiresSystemSettings: false,
};

/** Read the current permission. Never shows a prompt. */
export async function getNotificationPermission(
  native: NotificationsNative,
  env: NotificationEnvironment,
): Promise<NotificationPermissionState> {
  if (!isNotificationCapablePlatform(env.platform)) return UNSUPPORTED;
  try {
    return mapSnapshot(await native.getPermissionsAsync());
  } catch {
    return UNSUPPORTED;
  }
}

export interface RequestPermissionOptions {
  /** Must be 'user-action': permission is never requested on launch or in the background. */
  trigger: 'user-action';
}

/**
 * Ask the OS for notification permission. Call ONLY from a handler of an
 * explicit user gesture (e.g. tapping an "Enable notifications" control).
 * The `trigger` argument is checked at runtime so a stray automatic call fails loudly.
 */
export async function requestNotificationPermissionFromUserAction(
  native: NotificationsNative,
  env: NotificationEnvironment,
  options: RequestPermissionOptions,
): Promise<NotificationPermissionState> {
  if (options?.trigger !== 'user-action') {
    throw new Error('Notification permission may only be requested from an explicit user action.');
  }

  const current = await getNotificationPermission(native, env);
  // Granted, unsupported, or permanently denied: showing a prompt is impossible or pointless.
  if (current.status === 'unsupported' || current.granted || current.requiresSystemSettings) {
    return current;
  }

  // SDK 58 reference: on Android 13+ "this prompt will not appear until at least one
  // notification channel is created".
  await ensureNotificationChannels(native, env);

  try {
    return mapSnapshot(await native.requestPermissionsAsync());
  } catch {
    return getNotificationPermission(native, env);
  }
}
