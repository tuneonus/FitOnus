import type {
  NotificationLike,
  NotificationResponseLike,
  NotificationsNative,
  NotificationSubscription,
  PushTokenChange,
} from '../types/push';
import {
  destinationFromNotificationData,
  parseRemotePushPayload,
  type NotificationDestination,
  type RemotePushPayload,
} from './notification-routing';

/** Value of `Notifications.DEFAULT_ACTION_IDENTIFIER` (a parity test checks it against the SDK). */
export const DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';

export interface NotificationListenerCallbacks {
  /** The user tapped a notification whose payload mapped to a known destination. */
  onDestination: (destination: NotificationDestination) => void;
  /** A notification arrived while the app was in the foreground. */
  onForegroundNotification?: (notification: NotificationLike) => void;
  /** A server push arrived while the app was in the foreground (local reminders never reach this). */
  onRemoteReceived?: (payload: RemotePushPayload) => void;
  /** The user tapped a server push (whether or not it maps to a screen). */
  onRemoteOpened?: (payload: RemotePushPayload) => void;
  /** The OS rotated the device push token. */
  onDeviceTokenChanged?: (token: PushTokenChange) => void;
}

export type NotificationListenerKind = 'response' | 'foreground' | 'token';

export interface NotificationListenerHandle {
  /** Resolves once the cold-start (app launched by a tap) check has finished. */
  ready: Promise<void>;
  /** Subscriptions the runtime refused (e.g. push-token events in Expo Go on Android). */
  unavailable: NotificationListenerKind[];
  /** Removes every subscription. Safe to call more than once. */
  stop: () => void;
}

const RECENT_KEY_LIMIT = 20;

function responseKey(response: NotificationResponseLike): string | null {
  const { notification, actionIdentifier } = response;
  // Without a delivery timestamp we cannot tell two daily-repeat taps apart, so do not dedupe.
  if (typeof notification.date !== 'number') return null;
  return `${notification.request.identifier}|${notification.date}|${actionIdentifier}`;
}

/**
 * Subscribe to taps, foreground arrivals and token rotation. Everything is
 * removed by `stop()`; after `stop()` no callback can fire, even from an
 * in-flight cold-start lookup.
 */
export function startNotificationListeners(
  native: NotificationsNative,
  callbacks: NotificationListenerCallbacks,
): NotificationListenerHandle {
  let stopped = false;
  const subscriptions: NotificationSubscription[] = [];
  const recentKeys: string[] = [];

  const handleResponse = (response: NotificationResponseLike) => {
    if (stopped) return;
    if (response.actionIdentifier !== DEFAULT_ACTION_IDENTIFIER) return; // dismiss / custom actions

    const key = responseKey(response);
    if (key) {
      if (recentKeys.includes(key)) return;
      recentKeys.push(key);
      if (recentKeys.length > RECENT_KEY_LIMIT) recentKeys.shift();
    }

    const data = response.notification.request.content.data;
    const remote = parseRemotePushPayload(data);
    if (remote) callbacks.onRemoteOpened?.(remote);

    const destination = destinationFromNotificationData(data);
    if (destination) callbacks.onDestination(destination);
  };

  // Each subscription is created independently: some runtimes throw for individual APIs
  // (expo-notifications throws from `addPushTokenListener` in Expo Go on Android), and one
  // refusal must neither crash the caller nor stop the other listeners.
  const unavailable: NotificationListenerKind[] = [];
  const subscribe = (kind: NotificationListenerKind, create: () => NotificationSubscription) => {
    try {
      subscriptions.push(create());
    } catch {
      unavailable.push(kind);
    }
  };

  // Subscribe first so a tap that lands during the cold-start lookup is not lost.
  subscribe('response', () => native.addNotificationResponseReceivedListener(handleResponse));

  if (callbacks.onForegroundNotification || callbacks.onRemoteReceived) {
    const onForeground = callbacks.onForegroundNotification;
    const onRemote = callbacks.onRemoteReceived;
    const seenRemote: string[] = [];
    subscribe('foreground', () =>
      native.addNotificationReceivedListener((notification) => {
        if (stopped) return;
        onForeground?.(notification);
        const remote = parseRemotePushPayload(notification.request.content.data);
        if (!remote || !onRemote) return;
        // The OS can redeliver the same message; the inbox must see it once.
        if (seenRemote.includes(remote.notificationId)) return;
        seenRemote.push(remote.notificationId);
        if (seenRemote.length > RECENT_KEY_LIMIT) seenRemote.shift();
        onRemote(remote);
      }),
    );
  }

  if (callbacks.onDeviceTokenChanged) {
    const onToken = callbacks.onDeviceTokenChanged;
    subscribe('token', () =>
      native.addPushTokenListener((token) => {
        if (!stopped) onToken(token);
      }),
    );
  }

  const ready = (async () => {
    try {
      const last = await native.getLastNotificationResponseAsync();
      if (last) handleResponse(last);
    } catch {
      // Cold-start lookup is best-effort.
    }
    try {
      // Consume it so a remount (or fast refresh) cannot replay the same tap.
      await native.clearLastNotificationResponseAsync();
    } catch {
      // Ignore.
    }
  })();

  return {
    ready,
    unavailable,
    stop: () => {
      if (stopped) return;
      stopped = true;
      while (subscriptions.length > 0) {
        try {
          subscriptions.pop()?.remove();
        } catch {
          // A subscription that is already gone must not block the rest of the cleanup.
        }
      }
    },
  };
}
