/**
 * Composition root: wires the pure notification services to the real app
 * (expo-notifications, SecureStore, the axios API client, the existing
 * `notificationService`). Not importable from node tests (it loads native modules).
 */
import { apiClient } from '../../../services/api-client';
import { notificationService, setNotificationEngine } from '../../../services/notificationService';
import { SecureStorageService } from '../../../services/secure-storage';
import { useAuthStore } from '../../auth/stores/auth-store';
import { generateUUID } from '../../nutrition/utils/uuid';
import type { KeyValueStore, NotificationEnvironment, NotificationsNative } from '../types/push';
import { PUSH_BACKEND_CONFIG } from './notification-backend-config';
import { createPushRegistrationApi, type PushHttpClient } from './notification-api';
import { createInboxApi, type InboxApi } from './notification-inbox-api';
import { createNotificationCoordinator, type NotificationCoordinator } from './notification-coordinator';
import { createLegacyEngineAdapter, createPermissionGate } from './notification-engine-adapter';
import { createReconcileScheduler } from './notification-reconcile';
import { createNativeNotifications, createNotificationEnvironment } from './native';

export interface NotificationRuntime {
  native: NotificationsNative;
  env: NotificationEnvironment;
  coordinator: NotificationCoordinator;
  /** Device-level key/value storage (SecureStore) shared by the notification services. */
  store: KeyValueStore;
  /** Server inbox, receipts and category preferences. */
  inboxApi: InboxApi;
  /** Route the existing `notificationService` through the real expo-notifications module. */
  installLegacyEngine: () => void;
  /** Ask for the existing reminders to be re-synced with settings (debounced, single-flight). */
  requestReminderReconcile: () => void;
  /** Drop a queued reminder reconcile (e.g. when the session ends). */
  cancelReminderReconcile: () => void;
}

let runtime: NotificationRuntime | null = null;

export function getNotificationRuntime(): NotificationRuntime {
  if (runtime) return runtime;

  const native = createNativeNotifications();
  const env = createNotificationEnvironment();

  // Reminders are allowed only with OS permission AND a signed-in user.
  const gate = createPermissionGate(native, env, {
    isSignedIn: () => useAuthStore.getState().isAuthenticated,
  });

  const http: PushHttpClient = {
    put: (url, body) => apiClient.put(url, body),
    delete: (url) => apiClient.delete(url),
  };

  const store: KeyValueStore = {
    get: (key) => SecureStorageService.getItem(key),
    set: async (key, value) => {
      await SecureStorageService.setItem(key, value);
    },
    remove: async (key) => {
      await SecureStorageService.removeItem(key);
    },
  };

  const coordinator = createNotificationCoordinator({
    native,
    env,
    api: createPushRegistrationApi({ http, config: PUSH_BACKEND_CONFIG }),
    store,
    cancelLocalReminders: () => notificationService.cancelAllFitOnusReminders(),
    // The user just granted permission: schedule their (already-configured) reminders now.
    onPermissionGranted: async () => {
      gate.invalidate();
      await notificationService.reconcileNotificationSchedules();
    },
    newInstallationId: generateUUID,
  });

  const reminderReconciler = createReconcileScheduler({
    reconcile: () => notificationService.reconcileNotificationSchedules(),
  });

  let engineInstalled = false;
  const installLegacyEngine = () => {
    if (engineInstalled) return;
    engineInstalled = true;
    // Deliberately does NOT call `notificationService.initializeNotifications()`: AppShell already
    // does that at launch. This must simply run BEFORE it (see NotificationBridge, which installs
    // the engine at import time), so that init finds a working engine instead of a no-op.
    setNotificationEngine(createLegacyEngineAdapter({ native, gate }));
  };

  const inboxApi = createInboxApi({
    get: (url, config) => apiClient.get(url, config),
    post: (url, body) => apiClient.post(url, body),
    put: (url, body) => apiClient.put(url, body),
    delete: (url) => apiClient.delete(url),
  });

  runtime = {
    native,
    env,
    coordinator,
    store,
    inboxApi,
    installLegacyEngine,
    requestReminderReconcile: reminderReconciler.request,
    cancelReminderReconcile: reminderReconciler.cancel,
  };
  return runtime;
}
