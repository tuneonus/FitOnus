import type {
  KeyValueStore,
  NotificationEnvironment,
  NotificationPermissionState,
  NotificationsNative,
  PushTokenChange,
} from '../types/push';
import type { PushPlatform, RegistrationFailureKind } from '../types/push-contract';
import { registerDeviceWithRetry, type PushRegistrationApi } from './notification-api';
import {
  getNotificationPermission,
  requestNotificationPermissionFromUserAction,
} from './notification-permissions';
import { acquireDevicePushToken, type PushTokenFailureReason } from './notification-token';

export const PUSH_REGISTRATION_KEY = 'fitonus.push.registration.v1';

/**
 * What the app can honestly say about push right now.
 * `token-acquired` means "we hold a valid device token but the backend adapter is inactive":
 * it is deliberately NOT reported as `registered`.
 */
export type PushState =
  | { status: 'idle' }
  | { status: 'unsupported'; reason: PushTokenFailureReason }
  | { status: 'permission-required'; canAskAgain: boolean; requiresSystemSettings: boolean }
  | { status: 'token-acquired'; token: string; backend: 'inactive' }
  | { status: 'registered'; token: string }
  | { status: 'pending-retry'; token: string; attempts: number; kind: RegistrationFailureKind }
  | { status: 'failed'; reason: string; retryable: boolean };

interface StoredRegistration {
  installationId: string;
  userId: string;
  token: string;
  platform: PushPlatform;
  backendRegistered: boolean;
  updatedAt: number;
}

export interface CoordinatorDeps {
  native: NotificationsNative;
  env: NotificationEnvironment;
  api: PushRegistrationApi;
  store: KeyValueStore;
  /** Cancel every locally scheduled reminder (workout, water, goal). */
  cancelLocalReminders: () => Promise<void>;
  newInstallationId: () => string;
  /**
   * Runs after the user grants notification permission through `enablePushFromUserAction`, before
   * any push-token work, so local reminders exist as soon as consent does. Failures are ignored.
   */
  onPermissionGranted?: () => Promise<void> | void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  retry?: { maxAttempts: number; baseDelayMs: number };
  /** A registered token is not re-fetched more often than this unless something changed. */
  refreshIntervalMs?: number;
  cleanupTimeoutMs?: number;
}

export interface LogoutCleanupResult {
  backend: 'skipped' | 'inactive' | 'unregistered' | 'failed';
  deviceTokenInvalidated: boolean;
  localRegistrationCleared: boolean;
  remindersCancelled: boolean;
}

export interface NotificationCoordinator {
  getState: () => PushState;
  subscribe: (listener: (state: PushState) => void) => () => void;
  getPermission: () => Promise<NotificationPermissionState>;
  /** Call from a user gesture ONLY: this is the one path that may show the OS prompt. */
  enablePushFromUserAction: (userId: string) => Promise<{
    permission: NotificationPermissionState;
    state: PushState;
  }>;
  /** Never prompts. Registers only if permission was already granted. */
  syncOnAuthReady: (userId: string) => Promise<PushState>;
  handleDeviceTokenChanged: (userId: string, token: PushTokenChange) => Promise<PushState>;
  retryPending: (userId: string) => Promise<PushState>;
  logoutCleanup: () => Promise<LogoutCleanupResult>;
}

/**
 * A log-safe summary of a push state: the status plus the reason or counters, and NEVER the device token
 * (which `registered`, `token-acquired` and `pending-retry` carry).
 */
export function describePushState(state: PushState): Record<string, string | number | boolean> {
  switch (state.status) {
    case 'unsupported':
      return { status: state.status, reason: state.reason };
    case 'permission-required':
      return {
        status: state.status,
        canAskAgain: state.canAskAgain,
        requiresSystemSettings: state.requiresSystemSettings,
      };
    case 'pending-retry':
      return { status: state.status, kind: state.kind, attempts: state.attempts };
    case 'failed':
      return { status: state.status, reason: state.reason, retryable: state.retryable };
    default:
      return { status: state.status };
  }
}

const DEFAULT_SLEEP = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export function createNotificationCoordinator(deps: CoordinatorDeps): NotificationCoordinator {
  const { native, env, api, store } = deps;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? DEFAULT_SLEEP;
  const retry = deps.retry ?? { maxAttempts: 3, baseDelayMs: 1000 };
  const refreshIntervalMs = deps.refreshIntervalMs ?? 12 * 60 * 60 * 1000;
  const cleanupTimeoutMs = deps.cleanupTimeoutMs ?? 4000;

  let state: PushState = { status: 'idle' };
  const listeners = new Set<(state: PushState) => void>();
  let inflight: Promise<PushState> | null = null;
  // Bumped on logout so any in-flight sync/retry knows its session ended and must not write state.
  let generation = 0;

  const setState = (next: PushState) => {
    state = next;
    listeners.forEach((listener) => listener(next));
    return next;
  };

  const readStored = async (): Promise<StoredRegistration | null> => {
    try {
      const raw = await store.get(PUSH_REGISTRATION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<StoredRegistration>;
      if (
        typeof parsed.installationId === 'string' &&
        typeof parsed.userId === 'string' &&
        typeof parsed.token === 'string' &&
        typeof parsed.backendRegistered === 'boolean'
      ) {
        return parsed as StoredRegistration;
      }
    } catch {
      // Corrupt record: treat as absent.
    }
    return null;
  };

  const writeStored = async (record: StoredRegistration) => {
    try {
      await store.set(PUSH_REGISTRATION_KEY, JSON.stringify(record));
    } catch {
      // Persistence is an optimization; a failed write only means a redundant re-register later.
    }
  };

  const failureState = async (reason: PushTokenFailureReason, retryable: boolean): Promise<PushState> => {
    if (reason === 'permission-not-granted') {
      const permission = await getNotificationPermission(native, env);
      return setState({
        status: 'permission-required',
        canAskAgain: permission.canAskAgain,
        requiresSystemSettings: permission.requiresSystemSettings,
      });
    }
    if (
      reason === 'unsupported-platform' ||
      reason === 'expo-go-android' ||
      reason === 'missing-project-id' ||
      reason === 'fcm-not-configured' ||
      reason === 'play-services-unavailable'
    ) {
      return setState({ status: 'unsupported', reason });
    }
    return setState({ status: 'failed', reason, retryable });
  };

  const runSync = async (
    userId: string,
    options: { devicePushToken?: PushTokenChange; force: boolean },
  ): Promise<PushState> => {
    const session = generation;
    const ended = () => session !== generation;

    const stored = await readStored();
    if (
      !options.force &&
      stored &&
      stored.userId === userId &&
      stored.backendRegistered &&
      now() - stored.updatedAt < refreshIntervalMs
    ) {
      return setState({ status: 'registered', token: stored.token });
    }

    const acquireInput: Parameters<typeof acquireDevicePushToken>[0] = { native, env };
    if (options.devicePushToken) acquireInput.devicePushToken = options.devicePushToken;
    const result = await acquireDevicePushToken(acquireInput);
    if (ended()) return state;
    if (!result.ok) return failureState(result.reason, result.retryable);

    const token = result.token;
    if (stored && stored.userId === userId && stored.token === token && stored.backendRegistered) {
      await writeStored({ ...stored, updatedAt: now() });
      return setState({ status: 'registered', token });
    }

    const record: StoredRegistration = {
      installationId: stored?.installationId ?? deps.newInstallationId(),
      userId,
      token,
      platform: env.platform === 'ios' ? 'ios' : 'android',
      backendRegistered: false,
      updatedAt: now(),
    };
    await writeStored(record);
    if (ended()) return state;

    if (!api.isActive) {
      return setState({ status: 'token-acquired', token, backend: 'inactive' });
    }

    const outcome = await registerDeviceWithRetry(
      api,
      {
        installationId: record.installationId,
        pushToken: token,
        platform: record.platform,
        appVersion: env.appVersion,
        timeZone: env.getTimeZone(),
      },
      { ...retry, sleep, shouldAbort: ended },
    );
    if (ended()) return state;

    if (outcome.status === 'registered') {
      await writeStored({ ...record, backendRegistered: true, updatedAt: now() });
      return setState({ status: 'registered', token });
    }
    if (outcome.status === 'failed' && outcome.retryable) {
      return setState({ status: 'pending-retry', token, attempts: outcome.attempts, kind: outcome.kind });
    }
    return setState({
      status: 'failed',
      reason: outcome.status === 'failed' ? outcome.kind : 'inactive',
      retryable: false,
    });
  };

  const syncRegistration = (
    userId: string,
    options: { devicePushToken?: PushTokenChange; force?: boolean } = {},
  ): Promise<PushState> => {
    // Coalesce overlapping passive triggers (auth-ready + foreground) into one run.
    if (inflight && !options.force) return inflight;
    const syncOptions: { devicePushToken?: PushTokenChange; force: boolean } = {
      force: options.force ?? false,
    };
    if (options.devicePushToken) syncOptions.devicePushToken = options.devicePushToken;

    // A forced sync (permission just granted, token rotated) must not adopt the result of a run that started
    // earlier: that run may have read the permission BEFORE it was granted (the foreground re-sync fires when
    // the system dialog closes) and would report `permission-required` with no device registered. Run after it.
    const previous = inflight;
    const run = (async () => {
      if (previous) await previous.catch(() => undefined);
      return runSync(userId, syncOptions);
    })()
      .catch((error: unknown) =>
        setState({
          status: 'failed',
          reason: error instanceof Error ? error.message : 'unknown',
          retryable: true,
        }),
      )
      .finally(() => {
        if (inflight === run) inflight = null;
      });
    inflight = run;
    return run;
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getPermission: () => getNotificationPermission(native, env),

    async enablePushFromUserAction(userId) {
      const permission = await requestNotificationPermissionFromUserAction(native, env, {
        trigger: 'user-action',
      });
      if (permission.status === 'unsupported') {
        return { permission, state: setState({ status: 'unsupported', reason: 'unsupported-platform' }) };
      }
      if (!permission.granted) {
        return {
          permission,
          state: setState({
            status: 'permission-required',
            canAskAgain: permission.canAskAgain,
            requiresSystemSettings: permission.requiresSystemSettings,
          }),
        };
      }
      try {
        await deps.onPermissionGranted?.();
      } catch {
        // Reminder scheduling is independent of push registration; never let it block the latter.
      }
      return { permission, state: await syncRegistration(userId, { force: true }) };
    },

    syncOnAuthReady: (userId) => syncRegistration(userId),

    handleDeviceTokenChanged: (userId, token) =>
      syncRegistration(userId, { devicePushToken: token, force: true }),

    async retryPending(userId) {
      const current = state;
      const retryable =
        current.status === 'pending-retry' || (current.status === 'failed' && current.retryable);
      return retryable ? syncRegistration(userId, { force: true }) : current;
    },

    async logoutCleanup() {
      generation += 1; // abort any in-flight registration/backoff
      const result: LogoutCleanupResult = {
        backend: 'skipped',
        deviceTokenInvalidated: false,
        localRegistrationCleared: false,
        remindersCancelled: false,
      };

      const stored = await readStored();
      if (stored) {
        if (!api.isActive) {
          result.backend = 'inactive';
        } else {
          // Attempt this even when `backendRegistered` is false: the server may have stored the
          // device while the response was lost. Deleting a missing row is treated as success.
          try {
            const outcome = await withTimeout(api.unregister(stored.installationId), cleanupTimeoutMs);
            result.backend = outcome !== 'timeout' && outcome.status === 'unregistered' ? 'unregistered' : 'failed';
          } catch {
            result.backend = 'failed';
          }
        }

        // Invalidate the device's FCM token so a token the backend could not delete
        // (offline, 401 after expiry) can no longer reach this device.
        try {
          const invalidated = await withTimeout(native.unregisterForNotificationsAsync(), cleanupTimeoutMs);
          result.deviceTokenInvalidated = invalidated !== 'timeout';
        } catch {
          result.deviceTokenInvalidated = false;
        }

        try {
          await store.remove(PUSH_REGISTRATION_KEY);
          result.localRegistrationCleared = true;
        } catch {
          result.localRegistrationCleared = false;
        }
      } else {
        result.localRegistrationCleared = true;
      }

      try {
        await deps.cancelLocalReminders();
        result.remindersCancelled = true;
      } catch {
        result.remindersCancelled = false;
      }

      inflight = null;
      setState({ status: 'idle' });
      return result;
    },
  };
}
