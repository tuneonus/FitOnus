import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { useSettingsStore } from '../../../shared/stores/settingsStore';
import { useAuthStore } from '../../auth/stores/auth-store';
import {
  startNotificationListeners,
  type NotificationListenerCallbacks,
  type NotificationListenerHandle,
} from '../services/notification-listeners';
import { registerSessionEndCleanup } from '../services/notification-logout-hook';
import { supportsRemotePushApis } from '../services/notification-permissions';
import { getNotificationRuntime } from '../services/notification-runtime';
import { createRemoteHandlers } from '../services/notification-remote-handlers';
import { createPendingNavigation, NAVIGATION_BLOCKED_ROUTES } from '../services/notification-routing';
import { useNotificationsStore } from '../store/notificationsStore';

// Route the EXISTING notificationService through the real expo-notifications module.
// This must happen at import time: AppShell's launch-time `initializeNotifications()` effect
// runs after the first render, and the engine has to exist by then. It is idempotent and must
// never be able to crash app start-up.
try {
  getNotificationRuntime().installLegacyEngine();
} catch {
  // Leave the existing service in its previous (inert) state.
}

/**
 * Headless integration point (renders nothing), mounted once by AppShell.
 *
 * It NEVER requests notification permission (that only happens from an explicit user action:
 * the "Enable notifications" button via the useNotifications hook, or the existing preferences
 * toggle). It:
 *  - listens for notification taps / foreground arrivals / token rotation and cleans up on unmount,
 *  - holds a tap until the user is signed in and past onboarding, then navigates once,
 *  - re-syncs LOCAL reminders when the user signs in or changes the notification preferences,
 *  - re-syncs the push token after sign-in only if permission was ALREADY granted
 *    (a no-op until the backend registers devices),
 *  - registers logout cleanup (token deregistration, FCM token invalidation, reminder cancellation).
 */
export function NotificationBridge(): null {
  const navigation = useNavigation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const userId = useAuthStore((state) => state.user?.id ?? null);

  const navigationRef = useRef(navigation);
  const pendingRef = useRef(createPendingNavigation());
  const wasAuthenticatedRef = useRef(false);

  useEffect(() => {
    navigationRef.current = navigation;
  });

  const flushPending = useRef(() => {
    const nav = navigationRef.current;
    const auth = useAuthStore.getState();
    const canNavigate =
      auth.isAuthenticated && !auth.isLoading && !NAVIGATION_BLOCKED_ROUTES.has(nav.route.name);
    pendingRef.current.flush(canNavigate, { navigate: nav.navigate, switchTab: nav.switchTab });
  });

  // One-time setup + teardown.
  useEffect(() => {
    const { native, env, coordinator, inboxApi, requestReminderReconcile, cancelReminderReconcile } =
      getNotificationRuntime();

    // The inbox store talks to the server through this API; it is detached again on unmount.
    const inbox = useNotificationsStore.getState();
    inbox.attachInboxApi(inboxApi);
    const remote = createRemoteHandlers({
      api: inboxApi,
      syncInbox: () => useNotificationsStore.getState().syncInbox(),
      markReadLocally: (id) => useNotificationsStore.getState().markRead(id),
    });
    const signedIn = () => useAuthStore.getState().isAuthenticated;

    const callbacks: NotificationListenerCallbacks = {
      onDestination: (destination) => {
        pendingRef.current.set(destination);
        flushPending.current();
      },
      // A server push is only acted on for a signed-in user; the inbox belongs to the account.
      onRemoteReceived: (payload) => {
        if (signedIn()) remote.onReceived(payload);
      },
      onRemoteOpened: (payload) => {
        if (signedIn()) remote.onOpened(payload);
      },
    };
    // Push-token events throw in Expo Go on Android; only subscribe where they exist.
    if (supportsRemotePushApis(env)) {
      callbacks.onDeviceTokenChanged = (token) => {
        const auth = useAuthStore.getState();
        if (auth.isAuthenticated && auth.user?.id) {
          void coordinator.handleDeviceTokenChanged(auth.user.id, token);
        }
      };
    }

    const listeners: NotificationListenerHandle = startNotificationListeners(native, callbacks);
    const unregisterCleanup = registerSessionEndCleanup(async () => {
      await coordinator.logoutCleanup();
    });

    // Keep the existing reminders in step with the user's notification preferences. The settings
    // store asks for this itself via a by-name `eval('require')` that cannot resolve in a bundle.
    const unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
      if (!useAuthStore.getState().isAuthenticated) return;
      if (
        state.notificationsEnabled !== previous.notificationsEnabled ||
        state.notificationSchedule !== previous.notificationSchedule
      ) {
        requestReminderReconcile();
      }
    });

    return () => {
      useNotificationsStore.getState().attachInboxApi(null);
      listeners.stop();
      unregisterCleanup();
      unsubscribeSettings();
      cancelReminderReconcile();
    };
  }, []);

  // Deliver a held tap as soon as auth + route allow it.
  const routeName = navigation.route.name;
  useEffect(() => {
    flushPending.current();
  }, [routeName, isAuthenticated, isAuthLoading]);

  // Auth lifecycle: sync after sign-in (no prompt), clean up when the session ends.
  useEffect(() => {
    const { coordinator, requestReminderReconcile, cancelReminderReconcile } = getNotificationRuntime();

    if (isAuthenticated && !isAuthLoading && userId) {
      wasAuthenticatedRef.current = true;
      // The consent gate also requires a signed-in user, so reminders are (re)synced now.
      requestReminderReconcile();
      void coordinator.syncOnAuthReady(userId);
      void useNotificationsStore.getState().syncInbox();
      return;
    }

    if (!isAuthenticated && !isAuthLoading && wasAuthenticatedRef.current) {
      // Covers forced sign-outs (expired refresh token) that never went through AuthService.logout.
      wasAuthenticatedRef.current = false;
      pendingRef.current.clear();
      cancelReminderReconcile();
      void coordinator.logoutCleanup();
    }
  }, [isAuthenticated, isAuthLoading, userId]);

  // Retry a transient registration failure when the app returns to the foreground.
  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    const { coordinator } = getNotificationRuntime();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void coordinator.retryPending(userId);
      // Pushes that arrived while the app was in the background show up as soon as the user is back.
      void useNotificationsStore.getState().syncInbox();
    });
    return () => subscription.remove();
  }, [isAuthenticated, userId]);

  return null;
}
