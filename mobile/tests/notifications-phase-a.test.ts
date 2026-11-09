import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  notificationService,
  setNotificationEngine,
  type NotificationEngine,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_IDS,
} from '../src/services/notificationService';
import {
  isTimeInQuietHours,
  timeStringToMinutes,
  timeTo12h,
  timeTo24h,
  DEFAULT_NOTIFICATION_SCHEDULE,
  type QuietHoursSettings,
  type WaterReminderSettings,
  type WorkoutReminderSettings,
} from '../src/features/notifications/types/notification';
import {
  useSettingsStore,
  setSettingsStorageEngine,
  bindAuthToSettings,
} from '../src/shared/stores/settingsStore';

describe('Phase A Notification System & Local Reminders', () => {
  // In-Memory Test Notification Engine
  let scheduledList: Array<{
    identifier: string;
    content: any;
    trigger: any;
  }> = [];

  let channelsCreated: Record<string, any> = {};
  let foregroundHandler: any = null;
  let mockPermissionStatus = { granted: true, canAskAgain: true, status: 'granted' };

  const testEngine: NotificationEngine = {
    setNotificationHandler: (handler) => {
      foregroundHandler = handler;
    },
    setNotificationChannelAsync: (channelId, channel) => {
      channelsCreated[channelId] = channel;
      return Promise.resolve(channel);
    },
    getPermissionsAsync: () => Promise.resolve(mockPermissionStatus),
    requestPermissionsAsync: () => Promise.resolve(mockPermissionStatus),
    scheduleNotificationAsync: (request) => {
      const identifier = request.identifier || `test-id-${Math.random()}`;
      scheduledList = scheduledList.filter((item) => item.identifier !== identifier);
      scheduledList.push({
        identifier,
        content: request.content,
        trigger: request.trigger,
      });
      return Promise.resolve(identifier);
    },
    cancelScheduledNotificationAsync: (identifier) => {
      scheduledList = scheduledList.filter((item) => item.identifier !== identifier);
      return Promise.resolve();
    },
    cancelAllScheduledNotificationsAsync: () => {
      scheduledList = [];
      return Promise.resolve();
    },
    getAllScheduledNotificationsAsync: () => Promise.resolve([...scheduledList]),
  };

  const memoryStore = new Map<string, string>();

  beforeEach(() => {
    scheduledList = [];
    channelsCreated = {};
    foregroundHandler = null;
    mockPermissionStatus = { granted: true, canAskAgain: true, status: 'granted' };
    setNotificationEngine(testEngine);

    memoryStore.clear();
    setSettingsStorageEngine({
      getItem: (key) => Promise.resolve(memoryStore.get(key) ?? null),
      setItem: (key, val) => {
        memoryStore.set(key, val);
        return Promise.resolve();
      },
      removeItem: (key) => {
        memoryStore.delete(key);
        return Promise.resolve();
      },
    });

    useSettingsStore.getState().resetSettings();
  });

  describe('1. Time Conversion & Quiet Hours Verification', () => {
    it('converts 12-hour strings to 24-hour format reliably', () => {
      assert.equal(timeTo24h('7:00 AM'), '07:00');
      assert.equal(timeTo24h('12:00 PM'), '12:00');
      assert.equal(timeTo24h('12:00 AM'), '00:00');
      assert.equal(timeTo24h('8:30 PM'), '20:30');
      assert.equal(timeTo24h('07:00'), '07:00');
    });

    it('converts 24-hour strings to 12-hour format reliably', () => {
      assert.equal(timeTo12h('07:00'), '7:00 AM');
      assert.equal(timeTo12h('12:00'), '12:00 PM');
      assert.equal(timeTo12h('00:00'), '12:00 AM');
      assert.equal(timeTo12h('20:30'), '8:30 PM');
    });

    it('correctly calculates minutes from midnight', () => {
      assert.equal(timeStringToMinutes('00:00'), 0);
      assert.equal(timeStringToMinutes('01:30'), 90);
      assert.equal(timeStringToMinutes('08:00'), 480);
      assert.equal(timeStringToMinutes('20:00'), 1200);
      assert.equal(timeStringToMinutes('23:59'), 1439);
    });

    it('accurately evaluates daytime quiet hours ranges', () => {
      const daytimeQuiet: QuietHoursSettings = {
        enabled: true,
        startTime: '13:00',
        endTime: '15:00',
      };

      assert.equal(isTimeInQuietHours('12:59', daytimeQuiet), false);
      assert.equal(isTimeInQuietHours('13:00', daytimeQuiet), true);
      assert.equal(isTimeInQuietHours('14:30', daytimeQuiet), true);
      assert.equal(isTimeInQuietHours('15:00', daytimeQuiet), false);
      assert.equal(isTimeInQuietHours('18:00', daytimeQuiet), false);
    });

    it('accurately evaluates overnight quiet hours ranges (e.g. 23:00 to 06:00)', () => {
      const overnightQuiet: QuietHoursSettings = {
        enabled: true,
        startTime: '23:00',
        endTime: '06:00',
      };

      assert.equal(isTimeInQuietHours('22:59', overnightQuiet), false);
      assert.equal(isTimeInQuietHours('23:00', overnightQuiet), true);
      assert.equal(isTimeInQuietHours('23:45', overnightQuiet), true);
      assert.equal(isTimeInQuietHours('01:30', overnightQuiet), true);
      assert.equal(isTimeInQuietHours('05:59', overnightQuiet), true);
      assert.equal(isTimeInQuietHours('06:00', overnightQuiet), false);
      assert.equal(isTimeInQuietHours('07:00', overnightQuiet), false);
    });

    it('allows all times when quiet hours is disabled', () => {
      const disabledQuiet: QuietHoursSettings = {
        enabled: false,
        startTime: '23:00',
        endTime: '06:00',
      };

      assert.equal(isTimeInQuietHours('02:00', disabledQuiet), false);
      assert.equal(isTimeInQuietHours('23:30', disabledQuiet), false);
    });
  });

  describe('2. Native Channels & Foreground Presentation Setup', () => {
    it('registers Android channels with appropriate importance and sound', async () => {
      await notificationService.initializeNotifications();

      assert.ok(channelsCreated[NOTIFICATION_CHANNELS.WORKOUT], 'Workout channel should be registered');
      assert.equal(channelsCreated[NOTIFICATION_CHANNELS.WORKOUT].importance, 4); // High

      assert.ok(channelsCreated[NOTIFICATION_CHANNELS.WATER], 'Water channel should be registered');
      assert.equal(channelsCreated[NOTIFICATION_CHANNELS.WATER].importance, 3); // Default

      assert.ok(channelsCreated[NOTIFICATION_CHANNELS.SYSTEM], 'System channel should be registered');
      assert.equal(channelsCreated[NOTIFICATION_CHANNELS.SYSTEM].importance, 2); // Low
    });

    it('configures foreground notification presentation to show alerts and play sound', async () => {
      await notificationService.initializeNotifications();

      assert.ok(foregroundHandler, 'Foreground notification handler must be registered');
      const response = await foregroundHandler.handleNotification();
      assert.equal(response.shouldShowAlert, true);
      assert.equal(response.shouldPlaySound, true);
    });
  });

  describe('3. Permission Inspection & Handling', () => {
    it('returns granted status when permission is approved', async () => {
      mockPermissionStatus = { granted: true, canAskAgain: true, status: 'granted' };
      const status = await notificationService.checkNotificationPermission();
      assert.equal(status.granted, true);
      assert.equal(status.status, 'granted');
    });

    it('handles permission denial gracefully without exceptions', async () => {
      mockPermissionStatus = { granted: false, canAskAgain: false, status: 'denied' };
      const status = await notificationService.requestNotificationPermission();
      assert.equal(status.granted, false);
      assert.equal(status.status, 'denied');
    });

    it('handles null or missing native notification engine safely', async () => {
      setNotificationEngine(null);
      const checkRes = await notificationService.checkNotificationPermission();
      assert.equal(checkRes.granted, false);

      const reqRes = await notificationService.requestNotificationPermission();
      assert.equal(reqRes.granted, false);
    });
  });

  describe('4. Workout Reminder Scheduling', () => {
    it('schedules a daily workout reminder at the configured time', async () => {
      const workoutConfig: WorkoutReminderSettings = {
        enabled: true,
        time: '07:30',
      };

      const scheduledId = await notificationService.scheduleWorkoutReminder(workoutConfig);
      assert.equal(scheduledId, NOTIFICATION_IDS.WORKOUT);

      const workoutNotification = scheduledList.find((n) => n.identifier === NOTIFICATION_IDS.WORKOUT);
      assert.ok(workoutNotification, 'Workout reminder must be in scheduled list');
      assert.equal(workoutNotification.trigger.hour, 7);
      assert.equal(workoutNotification.trigger.minute, 30);
      assert.equal(workoutNotification.trigger.channelId, NOTIFICATION_CHANNELS.WORKOUT);
    });

    it('prevents duplicate workout reminders by replacing existing ones', async () => {
      await notificationService.scheduleWorkoutReminder({ enabled: true, time: '07:00' });
      await notificationService.scheduleWorkoutReminder({ enabled: true, time: '08:00' });

      const workoutItems = scheduledList.filter((n) => n.identifier === NOTIFICATION_IDS.WORKOUT);
      assert.equal(workoutItems.length, 1, 'Only one workout reminder should exist');
      assert.equal(workoutItems[0].trigger.hour, 8);
    });

    it('skips workout reminder if time falls within quiet hours', async () => {
      const workoutConfig: WorkoutReminderSettings = {
        enabled: true,
        time: '05:30',
      };
      const quietConfig: QuietHoursSettings = {
        enabled: true,
        startTime: '23:00',
        endTime: '06:00',
      };

      const id = await notificationService.scheduleWorkoutReminder(workoutConfig, quietConfig);
      assert.equal(id, null);
      assert.equal(scheduledList.length, 0);
    });

    it('cancels scheduled workout reminder when disabled', async () => {
      await notificationService.scheduleWorkoutReminder({ enabled: true, time: '07:00' });
      assert.equal(scheduledList.length, 1);

      await notificationService.scheduleWorkoutReminder({ enabled: false, time: '07:00' });
      assert.equal(scheduledList.length, 0);
    });
  });

  describe('5. Water Reminder Scheduling & Bounded Execution', () => {
    it('schedules bounded daily water reminders within start and end window', async () => {
      const waterConfig: WaterReminderSettings = {
        enabled: true,
        intervalHours: 2,
        startTime: '08:00',
        endTime: '14:00',
      };

      const ids = await notificationService.scheduleWaterReminders(waterConfig);
      // Slots: 08:00, 10:00, 12:00, 14:00 -> 4 slots
      assert.equal(ids.length, 4);
      assert.equal(scheduledList.length, 4);

      assert.equal(scheduledList[0].trigger.hour, 8);
      assert.equal(scheduledList[1].trigger.hour, 10);
      assert.equal(scheduledList[2].trigger.hour, 12);
      assert.equal(scheduledList[3].trigger.hour, 14);
    });

    it('skips water reminder slots that intersect with quiet hours', async () => {
      const waterConfig: WaterReminderSettings = {
        enabled: true,
        intervalHours: 2,
        startTime: '06:00',
        endTime: '12:00',
      };
      // Quiet hours 23:00 to 07:00 -> 06:00 is quiet, 08:00, 10:00, 12:00 are active
      const quietConfig: QuietHoursSettings = {
        enabled: true,
        startTime: '23:00',
        endTime: '07:00',
      };

      const ids = await notificationService.scheduleWaterReminders(waterConfig, quietConfig);
      assert.equal(ids.length, 3);
      assert.equal(scheduledList[0].trigger.hour, 8);
      assert.equal(scheduledList[1].trigger.hour, 10);
      assert.equal(scheduledList[2].trigger.hour, 12);
    });

    it('enforces safe upper bound (max 12 reminders) for narrow intervals', async () => {
      const waterConfig: WaterReminderSettings = {
        enabled: true,
        intervalHours: 1,
        startTime: '06:00',
        endTime: '22:00',
      };

      const ids = await notificationService.scheduleWaterReminders(waterConfig);
      assert.ok(ids.length <= 12, `Scheduled reminders count ${ids.length} must not exceed bounded 12 limit`);
    });

    it('cancels previous water reminders before scheduling new interval', async () => {
      await notificationService.scheduleWaterReminders({
        enabled: true,
        intervalHours: 2,
        startTime: '08:00',
        endTime: '14:00',
      });
      assert.equal(scheduledList.length, 4);

      await notificationService.scheduleWaterReminders({
        enabled: true,
        intervalHours: 3,
        startTime: '09:00',
        endTime: '15:00',
      });
      // 09:00, 12:00, 15:00 -> 3 slots
      assert.equal(scheduledList.length, 3);
      assert.equal(scheduledList[0].trigger.hour, 9);
      assert.equal(scheduledList[1].trigger.hour, 12);
      assert.equal(scheduledList[2].trigger.hour, 15);
    });

    it('cancels all water reminders when disabled', async () => {
      await notificationService.scheduleWaterReminders({
        enabled: true,
        intervalHours: 2,
        startTime: '08:00',
        endTime: '14:00',
      });
      assert.equal(scheduledList.length, 4);

      await notificationService.scheduleWaterReminders({
        enabled: false,
        intervalHours: 2,
        startTime: '08:00',
        endTime: '14:00',
      });
      assert.equal(scheduledList.length, 0);
    });
  });

  describe('6. Master Switch & Full Reconciliation Lifecycle', () => {
    it('cancels all notifications when master switch is disabled', async () => {
      await notificationService.scheduleWorkoutReminder({ enabled: true, time: '07:00' });
      await notificationService.scheduleWaterReminders({
        enabled: true,
        intervalHours: 2,
        startTime: '08:00',
        endTime: '12:00',
      });
      assert.ok(scheduledList.length > 0);

      // Disable master notifications in settings store
      useSettingsStore.getState().setNotificationsEnabled(false);
      // Wait for async reconciliation
      await new Promise((r) => setTimeout(r, 10));

      assert.equal(scheduledList.length, 0, 'All scheduled reminders must be cancelled when master is disabled');
    });

    it('reconciles both workout and water schedules when master switch is re-enabled', async () => {
      useSettingsStore.getState().setNotificationSchedule({
        workout: { enabled: true, time: '06:30' },
        water: { enabled: true, intervalHours: 3, startTime: '09:00', endTime: '15:00' },
        quietHours: { enabled: true, startTime: '23:00', endTime: '06:00' },
      });
      useSettingsStore.getState().setNotificationsEnabled(true);

      await notificationService.reconcileNotificationSchedules();

      const workoutItem = scheduledList.find((n) => n.identifier === NOTIFICATION_IDS.WORKOUT);
      assert.ok(workoutItem, 'Workout must be scheduled');
      assert.equal(workoutItem.trigger.hour, 6);
      assert.equal(workoutItem.trigger.minute, 30);

      const waterItems = scheduledList.filter((n) => n.identifier.startsWith(NOTIFICATION_IDS.WATER_PREFIX));
      assert.equal(waterItems.length, 3); // 09:00, 12:00, 15:00
    });

    it('cancels all scheduled reminders on user logout / store reset', async () => {
      await notificationService.scheduleWorkoutReminder({ enabled: true, time: '07:00' });
      assert.equal(scheduledList.length, 1);

      useSettingsStore.getState().resetStore();
      await new Promise((r) => setTimeout(r, 10));

      assert.equal(scheduledList.length, 0, 'Logout / resetStore must wipe all scheduled reminders');
    });
  });

  describe('7. Auth Lifecycle & Multi-User Isolation', () => {
    it('bindAuthToSettings hydrates settings when user signs in and clears on sign-out', async () => {
      let stateListener: ((state: any, prev: any) => void) | null = null;
      const mockAuthStore = {
        getState: () => ({ user: null as { id: string } | null }),
        subscribe: (listener: (state: any, prev: any) => void) => {
          stateListener = listener;
          return () => {
            stateListener = null;
          };
        },
      };

      const unbind = bindAuthToSettings(mockAuthStore);
      assert.ok(stateListener, 'Listener must be attached');

      // Pre-seed storage for user-101
      memoryStore.set(
        'fitonus.settings.user-101',
        JSON.stringify({
          notificationsEnabled: true,
          notificationSchedule: {
            workout: { enabled: true, time: '07:15' },
          },
        })
      );

      // Simulate sign-in of user-101
      stateListener!({ user: { id: 'user-101' } }, { user: null });
      await new Promise((r) => setTimeout(r, 20));

      const activeSettings = useSettingsStore.getState();
      assert.equal(activeSettings.userId, 'user-101');
      assert.equal(activeSettings.notificationsEnabled, true);

      // Verify scheduled workout was reconciled for user-101
      const workoutItem = scheduledList.find((n) => n.identifier === NOTIFICATION_IDS.WORKOUT);
      assert.ok(workoutItem, 'Workout must be scheduled for user-101');
      assert.equal(workoutItem.trigger.hour, 7);
      assert.equal(workoutItem.trigger.minute, 15);

      // Simulate sign-out
      stateListener!({ user: null }, { user: { id: 'user-101' } });
      await new Promise((r) => setTimeout(r, 20));

      assert.equal(useSettingsStore.getState().userId, null);
      assert.equal(scheduledList.length, 0, 'Sign-out must cancel all notifications');

      unbind();
    });
  });

  describe('8. Android Native Trigger Contract & Failure Resilience', () => {
    it('ensures all reminders use daily recurring triggers with channel association', async () => {
      await notificationService.scheduleWorkoutReminder({ enabled: true, time: '08:15' });
      await notificationService.scheduleWaterReminders({
        enabled: true,
        intervalHours: 2,
        startTime: '08:00',
        endTime: '12:00',
      });

      assert.ok(scheduledList.length > 0);
      for (const item of scheduledList) {
        assert.equal(item.trigger.type, 'daily', `Trigger for ${item.identifier} must be daily recurring`);
        assert.ok(typeof item.trigger.hour === 'number');
        assert.ok(typeof item.trigger.minute === 'number');
        assert.ok(item.trigger.channelId, 'ChannelId must be explicitly attached');
      }
    });

    it('cancelWaterReminders falls back to direct slot cancellation if query throws', async () => {
      // Populate scheduled water reminders
      await notificationService.scheduleWaterReminders({
        enabled: true,
        intervalHours: 2,
        startTime: '08:00',
        endTime: '12:00',
      });
      assert.equal(scheduledList.length, 3);

      // Override engine query to throw error
      const brokenEngine: NotificationEngine = {
        ...testEngine,
        getAllScheduledNotificationsAsync: () => Promise.reject(new Error('Native query failed')),
      };
      setNotificationEngine(brokenEngine);

      // Should not throw, should fall back to cancelling slots 0..11
      await notificationService.cancelWaterReminders();
      assert.equal(scheduledList.length, 0);

      // Restore working testEngine
      setNotificationEngine(testEngine);
    });

    it('safely handles malformed and edge-case time inputs', () => {
      // Empty or non-string inputs
      assert.equal(timeTo24h(''), '07:00');
      assert.equal(timeTo24h(undefined as any), '07:00');
      assert.equal(timeTo24h('not-a-time'), '07:00');
      assert.equal(timeTo24h('25:99'), '07:00');

      // Equal quiet hour boundaries
      assert.equal(
        isTimeInQuietHours('10:00', { enabled: true, startTime: '12:00', endTime: '12:00' }),
        false
      );

      // Exact boundaries
      const quiet = { enabled: true, startTime: '22:00', endTime: '06:00' };
      assert.equal(isTimeInQuietHours('22:00', quiet), true, 'Exact start time is in quiet hours');
      assert.equal(isTimeInQuietHours('06:00', quiet), false, 'Exact end time is not in quiet hours');
      assert.equal(isTimeInQuietHours('21:59', quiet), false, '1 min before start is not in quiet hours');
      assert.equal(isTimeInQuietHours('05:59', quiet), true, '1 min before end is in quiet hours');
    });

    it('suppresses scheduling when workout reminder falls into overnight quiet hours', async () => {
      const scheduledId = await notificationService.scheduleWorkoutReminder(
        { enabled: true, time: '05:45' },
        { enabled: true, startTime: '23:00', endTime: '06:00' }
      );
      assert.equal(scheduledId, null);
      assert.equal(scheduledList.length, 0);
    });
  });
});
