// In-memory stand-ins for expo-notifications and the runtime environment so the
// notification foundation can be unit-tested in node (no native modules loaded).
import type {
  AndroidChannelConfig,
  DevicePushTokenLike,
  KeyValueStore,
  NotificationEnvironment,
  NotificationHandlerLike,
  NotificationLike,
  NotificationResponseLike,
  NotificationsNative,
  PermissionSnapshot,
  PushTokenChange,
  ScheduleRequestLike,
} from '../../src/features/notifications/types/push';

export const GRANTED: PermissionSnapshot = { granted: true, canAskAgain: true, status: 'granted' };
export const DENIED: PermissionSnapshot = { granted: false, canAskAgain: true, status: 'denied' };
export const BLOCKED: PermissionSnapshot = { granted: false, canAskAgain: false, status: 'denied' };
export const UNDETERMINED: PermissionSnapshot = { granted: false, canAskAgain: true, status: 'undetermined' };

/** Shaped like a real FCM registration token (`<id>:APA91b<...>`). */
export const VALID_TOKEN = 'cX1fT0kEnAAAAAAAAA:APA91bTestTokenForUnitTests-0001_abcdefghij';
export const ROTATED_TOKEN = 'dY2gU1lFoBBBBBBBBB:APA91bRotatedTokenForUnitTests-0002_abcdefghij';

export function createEnv(overrides: Partial<NotificationEnvironment> = {}): NotificationEnvironment & {
  timeZone: string;
} {
  const env: NotificationEnvironment & { timeZone: string } = {
    platform: 'android',
    isExpoGo: false,
    projectId: 'test-project-id',
    appVersion: '1.0.0',
    timeZone: 'Asia/Kolkata',
    getTimeZone: () => env.timeZone,
    ...overrides,
  };
  return env;
}

export interface FakeNative extends NotificationsNative {
  /** Every method invocation, in order. */
  calls: string[];
  count: (method: string) => number;
  permission: PermissionSnapshot;
  /** What the OS answers when the app shows the permission prompt. */
  promptAnswer: PermissionSnapshot;
  channels: Map<string, AndroidChannelConfig>;
  failChannels: Set<string>;
  scheduled: Map<string, ScheduleRequestLike>;
  scheduleCalls: ScheduleRequestLike[];
  cancelled: string[];
  tokenImpl: () => Promise<DevicePushTokenLike>;
  lastResponse: NotificationResponseLike | null;
  handler: NotificationHandlerLike | null;
  listeners: {
    response: Set<(response: NotificationResponseLike) => void>;
    received: Set<(notification: NotificationLike) => void>;
    token: Set<(token: PushTokenChange) => void>;
  };
  removedSubscriptions: number;
  emitResponse: (response: NotificationResponseLike) => void;
  emitReceived: (notification: NotificationLike) => void;
  emitToken: (token: PushTokenChange) => void;
}

export function createFakeNative(initial: { permission?: PermissionSnapshot } = {}): FakeNative {
  const fake: FakeNative = {
    calls: [],
    count: (method) => fake.calls.filter((name) => name === method).length,
    permission: initial.permission ?? GRANTED,
    promptAnswer: GRANTED,
    channels: new Map(),
    failChannels: new Set(),
    scheduled: new Map(),
    scheduleCalls: [],
    cancelled: [],
    tokenImpl: async () => ({ type: 'android', data: VALID_TOKEN }),
    lastResponse: null,
    handler: null,
    listeners: { response: new Set(), received: new Set(), token: new Set() },
    removedSubscriptions: 0,
    emitResponse: (response) => fake.listeners.response.forEach((listener) => listener(response)),
    emitReceived: (notification) => fake.listeners.received.forEach((listener) => listener(notification)),
    emitToken: (token) => fake.listeners.token.forEach((listener) => listener(token)),

    getPermissionsAsync: async () => {
      fake.calls.push('getPermissionsAsync');
      return fake.permission;
    },
    requestPermissionsAsync: async () => {
      fake.calls.push('requestPermissionsAsync');
      fake.permission = fake.promptAnswer;
      return fake.permission;
    },
    setNotificationChannelAsync: async (channelId, channel) => {
      fake.calls.push('setNotificationChannelAsync');
      if (fake.failChannels.has(channelId)) throw new Error(`channel ${channelId} failed`);
      fake.channels.set(channelId, channel);
      return channel;
    },
    getDevicePushTokenAsync: async () => {
      fake.calls.push('getDevicePushTokenAsync');
      return fake.tokenImpl();
    },
    unregisterForNotificationsAsync: async () => {
      fake.calls.push('unregisterForNotificationsAsync');
    },
    addPushTokenListener: (listener) => {
      fake.calls.push('addPushTokenListener');
      fake.listeners.token.add(listener);
      return {
        remove: () => {
          fake.removedSubscriptions += 1;
          fake.listeners.token.delete(listener);
        },
      };
    },
    addNotificationReceivedListener: (listener) => {
      fake.calls.push('addNotificationReceivedListener');
      fake.listeners.received.add(listener);
      return {
        remove: () => {
          fake.removedSubscriptions += 1;
          fake.listeners.received.delete(listener);
        },
      };
    },
    addNotificationResponseReceivedListener: (listener) => {
      fake.calls.push('addNotificationResponseReceivedListener');
      fake.listeners.response.add(listener);
      return {
        remove: () => {
          fake.removedSubscriptions += 1;
          fake.listeners.response.delete(listener);
        },
      };
    },
    getLastNotificationResponseAsync: async () => {
      fake.calls.push('getLastNotificationResponseAsync');
      return fake.lastResponse;
    },
    clearLastNotificationResponseAsync: async () => {
      fake.calls.push('clearLastNotificationResponseAsync');
      fake.lastResponse = null;
    },
    scheduleNotificationAsync: async (request) => {
      fake.calls.push('scheduleNotificationAsync');
      fake.scheduleCalls.push(request);
      const identifier = request.identifier ?? `generated-${fake.scheduleCalls.length}`;
      // Same semantics as expo-notifications: scheduling an existing identifier replaces it.
      fake.scheduled.set(identifier, { ...request, identifier });
      return identifier;
    },
    cancelScheduledNotificationAsync: async (identifier) => {
      fake.calls.push('cancelScheduledNotificationAsync');
      fake.cancelled.push(identifier);
      fake.scheduled.delete(identifier);
    },
    cancelAllScheduledNotificationsAsync: async () => {
      fake.calls.push('cancelAllScheduledNotificationsAsync');
      fake.scheduled.clear();
    },
    getAllScheduledNotificationsAsync: async () => {
      fake.calls.push('getAllScheduledNotificationsAsync');
      return [...fake.scheduled.entries()].map(([identifier, request]) => ({
        identifier,
        content: { data: request.content.data },
        trigger: request.trigger,
      }));
    },
    setNotificationHandler: (handler) => {
      fake.calls.push('setNotificationHandler');
      fake.handler = handler;
    },
  };
  return fake;
}

export function createMemoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
}

export interface HttpCall {
  method: 'PUT' | 'DELETE';
  url: string;
  body?: unknown;
}

/** Scripted HTTP: each entry answers the next request (default 200). */
export function createFakeHttp(script: { status?: number; error?: unknown }[] = []) {
  const calls: HttpCall[] = [];
  const next = () => script.shift() ?? { status: 200 };
  return {
    calls,
    script,
    put: async (url: string, body: unknown) => {
      calls.push({ method: 'PUT', url, body });
      const step = next();
      if (step.error) throw step.error;
      return { status: step.status ?? 200, data: {} };
    },
    delete: async (url: string) => {
      calls.push({ method: 'DELETE', url });
      const step = next();
      if (step.error) throw step.error;
      return { status: step.status ?? 204, data: {} };
    },
  };
}

/** Axios-shaped HTTP error. */
export const httpError = (status: number) => ({ message: `Request failed with status ${status}`, response: { status } });
export const networkError = () => ({ message: 'Network Error', code: 'ERR_NETWORK' });

export function tapResponse(
  data: unknown,
  extra: { date?: number | undefined; identifier?: string; actionIdentifier?: string } = {},
): NotificationResponseLike {
  const notification: NotificationLike = {
    request: { identifier: extra.identifier ?? 'req-1', content: { title: 't', body: 'b', data } },
  };
  if (extra.date !== undefined) notification.date = extra.date;
  return {
    actionIdentifier: extra.actionIdentifier ?? 'expo.modules.notifications.actions.DEFAULT',
    notification,
  };
}
