/**
 * Types for the OnusFit notification foundation (permissions, channels, push
 * tokens, listeners, local reminders).
 *
 * Pure types only. Nothing in this file may import a native module, so every
 * service that depends on these types stays loadable by the node test runner.
 */

export interface NotificationSubscription {
  remove: () => void;
}

/** Android notification channel definition (expo-notifications SDK 58 numbering). */
export interface AndroidChannelConfig {
  name: string;
  /** Expo's `AndroidImportance` value (NONE=2 … MAX=7). NOT Android's native 0–5 scale. */
  importance: number;
  description?: string | undefined;
  vibrationPattern?: number[] | undefined;
  lightColor?: string | undefined;
  sound?: string | null | undefined;
}

export interface PermissionSnapshot {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}

export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export interface NotificationPermissionState {
  status: NotificationPermissionStatus;
  granted: boolean;
  canAskAgain: boolean;
  /** True when the OS will no longer show the prompt: the user must use system settings. */
  requiresSystemSettings: boolean;
}

export interface NotificationContentLike {
  title?: string | null;
  body?: string | null;
  data?: unknown;
}

export interface NotificationRequestLike {
  identifier: string;
  content: NotificationContentLike;
  trigger?: unknown;
}

export interface NotificationLike {
  date?: number;
  request: NotificationRequestLike;
}

export interface NotificationResponseLike {
  actionIdentifier: string;
  notification: NotificationLike;
}

export interface PushTokenChange {
  type: string;
  data: unknown;
}

/** Native device token (an FCM registration token on Android). The backend sends to it through FCM directly. */
export interface DevicePushTokenLike {
  type?: string;
  data: unknown;
}

export interface DailyTriggerInput {
  type: 'daily';
  hour: number;
  minute: number;
  channelId?: string;
}

export interface WeeklyTriggerInput {
  type: 'weekly';
  /** 1–7, Sunday = 1 (expo-notifications convention). */
  weekday: number;
  hour: number;
  minute: number;
  channelId?: string;
}

export type ReminderTriggerInput = DailyTriggerInput | WeeklyTriggerInput;

export interface ScheduleRequestLike {
  identifier?: string;
  content: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    sound?: boolean | string;
  };
  trigger: ReminderTriggerInput;
}

export interface ScheduledNotificationLike {
  identifier: string;
  content?: { data?: unknown };
  trigger?: unknown;
}

export interface NotificationBehaviorLike {
  shouldShowBanner?: boolean;
  shouldShowList?: boolean;
  /** Deprecated by expo-notifications; the legacy engine adapter normalizes it. */
  shouldShowAlert?: boolean;
  shouldPlaySound?: boolean;
  shouldSetBadge?: boolean;
}

export interface NotificationHandlerLike {
  handleNotification: (notification: NotificationLike) => Promise<NotificationBehaviorLike>;
}

/**
 * The subset of `expo-notifications` this feature uses. The real implementation
 * lives in `services/native.ts`; tests inject a fake.
 */
export interface NotificationsNative {
  getPermissionsAsync: () => Promise<PermissionSnapshot>;
  requestPermissionsAsync: () => Promise<PermissionSnapshot>;
  setNotificationChannelAsync: (channelId: string, channel: AndroidChannelConfig) => Promise<unknown>;
  getDevicePushTokenAsync: () => Promise<DevicePushTokenLike>;
  unregisterForNotificationsAsync: () => Promise<void>;
  addPushTokenListener: (listener: (token: PushTokenChange) => void) => NotificationSubscription;
  addNotificationReceivedListener: (
    listener: (notification: NotificationLike) => void,
  ) => NotificationSubscription;
  addNotificationResponseReceivedListener: (
    listener: (response: NotificationResponseLike) => void,
  ) => NotificationSubscription;
  getLastNotificationResponseAsync: () => Promise<NotificationResponseLike | null>;
  clearLastNotificationResponseAsync: () => Promise<void>;
  scheduleNotificationAsync: (request: ScheduleRequestLike) => Promise<string>;
  cancelScheduledNotificationAsync: (identifier: string) => Promise<void>;
  cancelAllScheduledNotificationsAsync: () => Promise<void>;
  getAllScheduledNotificationsAsync: () => Promise<ScheduledNotificationLike[]>;
  setNotificationHandler: (handler: NotificationHandlerLike | null) => void;
}

export interface NotificationEnvironment {
  /** `Platform.OS`: 'android' | 'ios' | 'web' | … */
  platform: string;
  isExpoGo: boolean;
  /** EAS project id from app config, or null when missing. */
  projectId: string | null;
  appVersion: string | null;
  /** IANA timezone of the device right now (can change while the app is alive). */
  getTimeZone: () => string;
}

export interface KeyValueStore {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}
