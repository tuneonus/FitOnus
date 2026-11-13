import {
  DEFAULT_NOTIFICATION_SCHEDULE,
  isTimeInQuietHours,
  timeStringToMinutes,
  timeTo24h,
  type NotificationSchedule,
  type QuietHoursSettings,
  type WaterReminderSettings,
  type WorkoutReminderSettings,
} from '../features/notifications/types/notification';
import { useSettingsStore } from '../shared/stores/settingsStore';
import { logger } from '../utils/logger';

export const NOTIFICATION_CHANNELS = {
  WORKOUT: 'workout-reminders',
  WATER: 'water-reminders',
  SYSTEM: 'system-reminders',
} as const;

export const NOTIFICATION_IDS = {
  WORKOUT: 'fitonus-reminder-workout',
  WATER_PREFIX: 'fitonus-reminder-water-',
} as const;

export interface NotificationEngine {
  setNotificationHandler: (handler: any) => void;
  setNotificationChannelAsync: (channelId: string, channel: any) => Promise<any>;
  getPermissionsAsync: () => Promise<{ status: string; granted: boolean; canAskAgain: boolean }>;
  requestPermissionsAsync: () => Promise<{ status: string; granted: boolean; canAskAgain: boolean }>;
  scheduleNotificationAsync: (request: {
    identifier?: string;
    content: {
      title: string;
      body: string;
      data?: Record<string, unknown>;
      sound?: boolean | string;
    };
    trigger: any;
  }) => Promise<string>;
  cancelScheduledNotificationAsync: (identifier: string) => Promise<void>;
  cancelAllScheduledNotificationsAsync: () => Promise<void>;
  getAllScheduledNotificationsAsync: () => Promise<Array<{ identifier: string; content?: any; trigger?: any }>>;
}

let overrideEngine: NotificationEngine | null = null;
let isInitialized = false;

export function setNotificationEngine(engine: NotificationEngine | null): void {
  overrideEngine = engine;
}

export function getNotificationEngine(): NotificationEngine | null {
  if (overrideEngine) {
    return overrideEngine;
  }
  try {
    const req = eval('require');
    const Notifications = req('expo-notifications');
    return Notifications as NotificationEngine;
  } catch {
    return null;
  }
}

/**
 * Reusable notification service orchestrating local reminders, permissions, and channel setup.
 */
export const notificationService = {
  /**
   * Initialize notification channels and foreground presentation handlers.
   * Safe to call multiple times (idempotent).
   */
  async initializeNotifications(): Promise<void> {
    const engine = getNotificationEngine();
    if (!engine) {
      logger.info('Notification engine unavailable (e.g. headless/test environment)');
      return;
    }

    try {
      // Configure foreground presentation behavior
      if (typeof engine.setNotificationHandler === 'function') {
        engine.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
      }

      // Configure Android Notification Channels (API 26+)
      if (typeof engine.setNotificationChannelAsync === 'function') {
        await engine.setNotificationChannelAsync(NOTIFICATION_CHANNELS.WORKOUT, {
          name: 'Workout Reminders',
          importance: 4, // AndroidImportance.HIGH
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#208AEF',
        });

        await engine.setNotificationChannelAsync(NOTIFICATION_CHANNELS.WATER, {
          name: 'Water & Hydration Reminders',
          importance: 3, // AndroidImportance.DEFAULT
          vibrationPattern: [0, 200],
          lightColor: '#208AEF',
        });

        await engine.setNotificationChannelAsync(NOTIFICATION_CHANNELS.SYSTEM, {
          name: 'System Notifications',
          importance: 2, // AndroidImportance.LOW
          sound: null,
        });
      }

      isInitialized = true;

      // Reconcile saved schedules upon app launch
      await this.reconcileNotificationSchedules();
    } catch (err: any) {
      logger.error('Failed to initialize notification system', { message: err?.message });
    }
  },

  /**
   * Check current OS notification permission status without prompting user.
   */
  async checkNotificationPermission(): Promise<{ granted: boolean; canAskAgain: boolean; status: string }> {
    const engine = getNotificationEngine();
    if (!engine || typeof engine.getPermissionsAsync !== 'function') {
      return { granted: false, canAskAgain: true, status: 'undetermined' };
    }
    try {
      const res = await engine.getPermissionsAsync();
      return {
        granted: res.granted,
        canAskAgain: res.canAskAgain,
        status: res.status,
      };
    } catch (err: any) {
      logger.error('Error checking notification permission', { message: err?.message });
      return { granted: false, canAskAgain: true, status: 'error' };
    }
  },

  /**
   * Prompt user for OS notification permission.
   * Safe on Android 13+ (handles refusal gracefully without crashes).
   */
  async requestNotificationPermission(): Promise<{ granted: boolean; canAskAgain: boolean; status: string }> {
    const engine = getNotificationEngine();
    if (!engine || typeof engine.requestPermissionsAsync !== 'function') {
      return { granted: false, canAskAgain: true, status: 'unavailable' };
    }
    try {
      const res = await engine.requestPermissionsAsync();
      return {
        granted: res.granted,
        canAskAgain: res.canAskAgain,
        status: res.status,
      };
    } catch (err: any) {
      logger.error('Error requesting notification permission', { message: err?.message });
      return { granted: false, canAskAgain: false, status: 'error' };
    }
  },

  /**
   * Schedule daily workout reminder according to user preference.
   */
  async scheduleWorkoutReminder(
    settings: WorkoutReminderSettings,
    quietHours?: QuietHoursSettings,
    masterEnabled = true
  ): Promise<string | null> {
    const engine = getNotificationEngine();
    if (!engine) return null;

    // Always remove previous scheduled workout reminder first
    await this.cancelReminder(NOTIFICATION_IDS.WORKOUT);

    if (!masterEnabled || !settings || typeof settings !== 'object' || !settings.enabled) {
      return null;
    }

    const time24 = timeTo24h(settings.time || '07:00');
    const parts = time24.split(':');
    const rawH = parts[0] ? parseInt(parts[0], 10) : 7;
    const rawM = parts[1] ? parseInt(parts[1], 10) : 0;
    const h = isNaN(rawH) ? 7 : Math.max(0, Math.min(23, rawH));
    const m = isNaN(rawM) ? 0 : Math.max(0, Math.min(59, rawM));

    // Quiet hours check
    if (quietHours && quietHours.enabled) {
      if (isTimeInQuietHours(time24, quietHours)) {
        logger.info(`Workout reminder at ${time24} falls within quiet hours; skipping schedule`);
        return null;
      }
    }

    try {
      const id = await engine.scheduleNotificationAsync({
        identifier: NOTIFICATION_IDS.WORKOUT,
        content: {
          title: 'Workout Ready',
          body: 'Ready for today’s session? Tap to check your customized workout plan.',
          data: { route: 'workoutPlan', kind: 'workout' },
        },
        trigger: {
          type: 'daily',
          hour: h,
          minute: m,
          channelId: NOTIFICATION_CHANNELS.WORKOUT,
        },
      });
      return id;
    } catch (err: any) {
      logger.error('Failed to schedule workout reminder', { message: err?.message });
      return null;
    }
  },

  /**
   * Schedule bounded daily water reminders within configured window, respecting quiet hours.
   */
  async scheduleWaterReminders(
    settings: WaterReminderSettings,
    quietHours?: QuietHoursSettings,
    masterEnabled = true
  ): Promise<string[]> {
    const engine = getNotificationEngine();
    if (!engine) return [];

    // Clear existing water reminders
    await this.cancelWaterReminders();

    if (!masterEnabled || !settings || typeof settings !== 'object' || !settings.enabled) {
      return [];
    }

    const intervalHours = Math.max(1, Math.min(6, settings.intervalHours || 2));
    const startMin = timeStringToMinutes(settings.startTime || '08:00');
    const endMin = timeStringToMinutes(settings.endTime || '20:00');

    if (startMin >= endMin) {
      logger.warn('Water reminder start time must be before end time; skipping');
      return [];
    }

    const stepMin = intervalHours * 60;
    const scheduledIds: string[] = [];
    let count = 0;

    for (let currentMin = startMin; currentMin <= endMin; currentMin += stepMin) {
      if (count >= 12) break; // Maximum 12 daily bounded reminders

      const hour = Math.floor(currentMin / 60);
      const minute = currentMin % 60;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

      // Respect quiet hours
      if (quietHours && quietHours.enabled && isTimeInQuietHours(timeStr, quietHours)) {
        continue;
      }

      const identifier = `${NOTIFICATION_IDS.WATER_PREFIX}${count}`;
      try {
        const id = await engine.scheduleNotificationAsync({
          identifier,
          content: {
            title: 'Time for Water',
            body: 'Stay hydrated to fuel your recovery and performance. Drink a fresh glass now.',
            data: { route: 'home', kind: 'water' },
          },
          trigger: {
            type: 'daily',
            hour,
            minute,
            channelId: NOTIFICATION_CHANNELS.WATER,
          },
        });
        scheduledIds.push(id || identifier);
        count++;
      } catch (err: any) {
        logger.error(`Failed to schedule water reminder ${identifier}`, { message: err?.message });
      }
    }

    return scheduledIds;
  },

  /**
   * Cancel specific reminder by identifier.
   */
  async cancelReminder(identifier: string): Promise<void> {
    const engine = getNotificationEngine();
    if (!engine || typeof engine.cancelScheduledNotificationAsync !== 'function') return;
    try {
      await engine.cancelScheduledNotificationAsync(identifier);
    } catch (err: any) {
      logger.error(`Error cancelling reminder ${identifier}`, { message: err?.message });
    }
  },

  /**
   * Cancel all water reminder notifications.
   * Employs multi-layer cancellation: queries active notifications and cancels by prefix,
   * plus guarantees cancellation across bounded indices 0..11 defensively.
   */
  async cancelWaterReminders(): Promise<void> {
    const engine = getNotificationEngine();
    if (!engine) return;

    try {
      if (typeof engine.getAllScheduledNotificationsAsync === 'function') {
        const all = await engine.getAllScheduledNotificationsAsync();
        for (const item of all) {
          if (item.identifier && item.identifier.startsWith(NOTIFICATION_IDS.WATER_PREFIX)) {
            await engine.cancelScheduledNotificationAsync(item.identifier);
          }
        }
      }
    } catch (err: any) {
      logger.warn('Failed querying scheduled notifications for water cleanup; proceeding to direct slot cleanup', {
        message: err?.message,
      });
    }

    // Defensive guarantee: Always explicitly cancel slots 0..11
    for (let i = 0; i < 12; i++) {
      try {
        await engine.cancelScheduledNotificationAsync(`${NOTIFICATION_IDS.WATER_PREFIX}${i}`);
      } catch {
        // Silently ignore if not found
      }
    }
  },

  /**
   * Cancel all FitOnus scheduled reminders.
   */
  async cancelAllFitOnusReminders(): Promise<void> {
    const engine = getNotificationEngine();
    if (!engine) return;

    try {
      if (typeof engine.cancelAllScheduledNotificationsAsync === 'function') {
        await engine.cancelAllScheduledNotificationsAsync();
      } else {
        await this.cancelReminder(NOTIFICATION_IDS.WORKOUT);
        await this.cancelWaterReminders();
      }
      logger.info('Cancelled all scheduled FitOnus local notifications');
    } catch (err: any) {
      logger.warn('Error during bulk notification cancellation; attempting targeted fallback', {
        message: err?.message,
      });
      await this.cancelReminder(NOTIFICATION_IDS.WORKOUT);
      await this.cancelWaterReminders();
    }
  },

  /**
   * Reconcile all local scheduled notifications with current settings in settingsStore.
   */
  async reconcileNotificationSchedules(options?: {
    notificationsEnabled?: boolean;
    schedule?: Partial<NotificationSchedule>;
  }): Promise<void> {
    const state = useSettingsStore.getState();
    const masterEnabled = options?.notificationsEnabled ?? state.notificationsEnabled;
    const rawSchedule = (options?.schedule ?? state.notificationSchedule ?? {}) as Partial<NotificationSchedule>;

    if (!masterEnabled) {
      await this.cancelAllFitOnusReminders();
      return;
    }

    const waterSettings: WaterReminderSettings = {
      ...DEFAULT_NOTIFICATION_SCHEDULE.water,
      ...(rawSchedule.water || {}),
    };

    const workoutSettings: WorkoutReminderSettings = {
      ...DEFAULT_NOTIFICATION_SCHEDULE.workout,
      ...(rawSchedule.workout || {}),
    };

    const quietHours: QuietHoursSettings = {
      ...DEFAULT_NOTIFICATION_SCHEDULE.quietHours,
      ...(rawSchedule.quietHours || {}),
    };

    // Schedule Workout
    await this.scheduleWorkoutReminder(workoutSettings, quietHours, masterEnabled);

    // Schedule Water
    await this.scheduleWaterReminders(waterSettings, quietHours, masterEnabled);
  },

  isInitialized(): boolean {
    return isInitialized;
  },
};
