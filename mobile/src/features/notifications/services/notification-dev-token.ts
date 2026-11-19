import type { NotificationEnvironment, NotificationsNative } from '../types/push';
import { acquireDevicePushToken, type PushTokenFailureReason } from './notification-token';

/**
 * TEMPORARY, development-only helper: copies this device's native FCM token to the clipboard so it can be pasted
 * into the Firebase console ("Send test message") while testing push on a physical phone.
 *
 * The token goes ONLY to the clipboard. It is never returned to the caller, displayed, logged or sent anywhere:
 * the result carries a fixed message and nothing derived from the token. Remove this file, its component and the
 * `expo-clipboard` dependency once FCM testing is finished.
 */
export type CopyDevTokenResult = { ok: true; message: string } | { ok: false; message: string };

const FAILURE_MESSAGES: Record<PushTokenFailureReason, string> = {
  'unsupported-platform': 'Push tokens are not available on this platform.',
  'expo-go-android': 'Remote push is not available in Expo Go. Use a development build.',
  'missing-project-id': 'No project id is configured for this build.',
  'permission-not-granted': 'Allow notifications first (Settings → Notifications), then try again.',
  'fcm-not-configured': 'Firebase is not configured in this build (google-services.json).',
  'play-services-unavailable': 'Google Play services is unavailable on this device.',
  'network-error': 'Network error while requesting the token. Try again.',
  'token-unavailable': 'The device could not provide a push token. Try again.',
  'invalid-token': 'The device returned an invalid push token. Try again.',
};

export interface CopyDevTokenInput {
  native: NotificationsNative;
  env: NotificationEnvironment;
  /** Writes the text to the system clipboard. */
  copyToClipboard: (text: string) => Promise<void>;
  /** Pass `__DEV__`. Refuses to do anything when false, even if called by mistake. */
  isDev: boolean;
}

/**
 * Reuses `acquireDevicePushToken`: it never shows a permission prompt, creates the notification channels first,
 * asks the OS for the native FCM token (`getDevicePushTokenAsync`) and validates it.
 */
export async function copyDeviceTokenForDev({
  native,
  env,
  copyToClipboard,
  isDev,
}: CopyDevTokenInput): Promise<CopyDevTokenResult> {
  if (!isDev) return { ok: false, message: 'Only available in development builds.' };

  try {
    const result = await acquireDevicePushToken({ native, env });
    if (!result.ok) return { ok: false, message: FAILURE_MESSAGES[result.reason] };

    try {
      await copyToClipboard(result.token);
    } catch {
      return { ok: false, message: 'Could not copy to the clipboard.' };
    }
    return { ok: true, message: 'FCM token copied to clipboard' };
  } catch {
    return { ok: false, message: 'Could not get the FCM token.' };
  }
}
