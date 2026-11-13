/**
 * The ONLY module in this feature that imports native packages
 * (`expo-notifications`, `expo-constants`, `expo`, `react-native`).
 *
 * Everything else depends on the `NotificationsNative` / `NotificationEnvironment`
 * interfaces, so it can be unit-tested in node with fakes. Do not import this file
 * from the node test suite, and do not re-export it from `../index.ts`.
 */
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type {
  NotificationEnvironment,
  NotificationsNative,
  PermissionSnapshot,
  ReminderTriggerInput,
} from '../types/push';

function toSnapshot(permissions: Notifications.NotificationPermissionsStatus): PermissionSnapshot {
  return {
    granted: permissions.granted,
    canAskAgain: permissions.canAskAgain,
    status: permissions.status,
  };
}

function toExpoTrigger(trigger: ReminderTriggerInput): Notifications.NotificationTriggerInput {
  const channel = trigger.channelId ? { channelId: trigger.channelId } : {};
  if (trigger.type === 'weekly') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: trigger.weekday,
      hour: trigger.hour,
      minute: trigger.minute,
      ...channel,
    };
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour: trigger.hour,
    minute: trigger.minute,
    ...channel,
  };
}

export function createNativeNotifications(): NotificationsNative {
  return {
    getPermissionsAsync: async () => toSnapshot(await Notifications.getPermissionsAsync()),
    requestPermissionsAsync: async () => toSnapshot(await Notifications.requestPermissionsAsync()),
    setNotificationChannelAsync: (channelId, channel) =>
      Notifications.setNotificationChannelAsync(channelId, channel as Notifications.NotificationChannelInput),
    getDevicePushTokenAsync: () => Notifications.getDevicePushTokenAsync(),
    unregisterForNotificationsAsync: () => Notifications.unregisterForNotificationsAsync(),
    addPushTokenListener: (listener) => Notifications.addPushTokenListener(listener),
    addNotificationReceivedListener: (listener) => Notifications.addNotificationReceivedListener(listener),
    addNotificationResponseReceivedListener: (listener) =>
      Notifications.addNotificationResponseReceivedListener(listener),
    getLastNotificationResponseAsync: () => Notifications.getLastNotificationResponseAsync(),
    clearLastNotificationResponseAsync: () => Notifications.clearLastNotificationResponseAsync(),
    scheduleNotificationAsync: (request) =>
      Notifications.scheduleNotificationAsync({
        ...(request.identifier ? { identifier: request.identifier } : {}),
        content: request.content,
        trigger: toExpoTrigger(request.trigger),
      }),
    cancelScheduledNotificationAsync: (identifier) => Notifications.cancelScheduledNotificationAsync(identifier),
    cancelAllScheduledNotificationsAsync: () => Notifications.cancelAllScheduledNotificationsAsync(),
    getAllScheduledNotificationsAsync: () => Notifications.getAllScheduledNotificationsAsync(),
    setNotificationHandler: (handler) => {
      if (!handler) {
        Notifications.setNotificationHandler(null);
        return;
      }
      Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
          const behavior = await handler.handleNotification(notification);
          return {
            shouldShowBanner: behavior.shouldShowBanner ?? true,
            shouldShowList: behavior.shouldShowList ?? true,
            shouldPlaySound: behavior.shouldPlaySound ?? false,
            shouldSetBadge: behavior.shouldSetBadge ?? false,
          };
        },
      });
    },
  };
}

function readTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function createNotificationEnvironment(): NotificationEnvironment {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const projectId = Constants.easConfig?.projectId ?? extra?.eas?.projectId;

  return {
    platform: Platform.OS,
    isExpoGo: isRunningInExpoGo(),
    projectId: typeof projectId === 'string' && projectId.length > 0 ? projectId : null,
    appVersion: Constants.expoConfig?.version ?? null,
    getTimeZone: readTimeZone,
  };
}
