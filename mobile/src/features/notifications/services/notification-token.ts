import type { NotificationEnvironment, NotificationsNative, PushTokenChange } from '../types/push';
import { ensureNotificationChannels } from './notification-channels';
import {
  getNotificationPermission,
  isExpoGoAndroid,
  isNotificationCapablePlatform,
} from './notification-permissions';

export type PushTokenFailureReason =
  | 'unsupported-platform'
  | 'expo-go-android'
  | 'missing-project-id'
  | 'permission-not-granted'
  | 'fcm-not-configured'
  | 'play-services-unavailable'
  | 'network-error'
  | 'token-unavailable'
  | 'invalid-token';

export interface PushTokenFailure {
  ok: false;
  reason: PushTokenFailureReason;
  message: string;
  retryable: boolean;
}

export type PushTokenResult = { ok: true; token: string } | PushTokenFailure;

/**
 * FCM registration tokens are URL-safe strings (letters, digits, `_ - : .`), well under 4096 characters.
 * The same shape the backend accepts: anything else is not a token and is never sent to the server.
 */
const DEVICE_PUSH_TOKEN_PATTERN = /^[A-Za-z0-9_\-:.]{20,4096}$/;

export function isValidDevicePushToken(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_PUSH_TOKEN_PATTERN.test(value);
}

function fail(reason: PushTokenFailureReason, message: string, retryable = false): PushTokenFailure {
  return { ok: false, reason, message, retryable };
}

const PLAY_SERVICES_HINTS = ['play services', 'google play', 'missing_instanceid_service', 'google_play_services'];
const FCM_HINTS = ['firebaseapp', 'firebase', 'google-services', 'fcm-credentials', 'fcm credentials'];
const NETWORK_HINTS = [
  'network',
  'timeout',
  'timed out',
  'offline',
  'unable to resolve host',
  'econn',
  'etimedout',
  'fetch failed',
  'service_not_available',
];

export function classifyTokenError(error: unknown): PushTokenFailure {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const code = (error as { code?: unknown } | null)?.code;

  // expo-notifications rejects with this code when no EAS project id is available.
  if (code === 'ERR_NOTIFICATIONS_NO_EXPERIENCE_ID') {
    return fail('missing-project-id', 'No EAS project id is configured (expo.extra.eas.projectId).');
  }
  if (PLAY_SERVICES_HINTS.some((hint) => lower.includes(hint))) {
    return fail(
      'play-services-unavailable',
      'Google Play services is unavailable on this device, so a push token cannot be issued.',
    );
  }
  if (FCM_HINTS.some((hint) => lower.includes(hint))) {
    return fail(
      'fcm-not-configured',
      'Firebase Cloud Messaging is not configured for this build (google-services.json / FCM credentials).',
    );
  }
  if (NETWORK_HINTS.some((hint) => lower.includes(hint))) {
    return fail('network-error', message, true);
  }
  return fail('token-unavailable', message, true);
}

export interface AcquireTokenInput {
  native: NotificationsNative;
  env: NotificationEnvironment;
  /**
   * When the OS has just reported a rotated token, pass it through: asking for a token inside the rotation
   * listener would trigger the listener again.
   */
  devicePushToken?: PushTokenChange;
}

/**
 * Obtain the native FCM device token. This NEVER prompts: it only proceeds when the OS permission was already
 * granted through an explicit user action.
 *
 * Emulators are deliberately NOT blocked: Expo's docs state push works on "Android emulators with Google Play
 * services". A device that cannot issue a token fails with a classified error (`play-services-unavailable`,
 * `fcm-not-configured`, ...) instead. No EAS project id is needed: the backend talks to FCM directly, not through
 * the Expo push service.
 */
export async function acquireDevicePushToken({
  native,
  env,
  devicePushToken,
}: AcquireTokenInput): Promise<PushTokenResult> {
  if (!isNotificationCapablePlatform(env.platform)) {
    return fail('unsupported-platform', `Push notifications are not supported on ${env.platform}.`);
  }
  if (isExpoGoAndroid(env)) {
    return fail(
      'expo-go-android',
      'Remote push is not available in Expo Go on Android. Use a development build.',
    );
  }

  const permission = await getNotificationPermission(native, env);
  if (!permission.granted) {
    return fail('permission-not-granted', 'Notification permission has not been granted.');
  }

  // Android requires the notification channels to exist before a device token is requested. Idempotent.
  await ensureNotificationChannels(native, env);

  // A rotated token reported by the OS is already the answer; do not ask again.
  if (devicePushToken) {
    return isValidDevicePushToken(devicePushToken.data)
      ? { ok: true, token: devicePushToken.data }
      : fail('invalid-token', 'The OS reported a malformed push token.', true);
  }

  try {
    const result = await native.getDevicePushTokenAsync();
    if (!isValidDevicePushToken(result?.data)) {
      return fail('invalid-token', 'The device returned a malformed push token.', true);
    }
    return { ok: true, token: result.data };
  } catch (error) {
    return classifyTokenError(error);
  }
}
