import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DENIED,
  GRANTED,
  UNDETERMINED,
  createEnv,
  createFakeNative,
} from './helpers/fake-notifications-native';
import {
  DEFAULT_GOAL_REMINDER_TIME,
  GOAL_REMINDER_ID,
  cancelGoalReminder,
  normalizeReminderTime,
  readGoalReminderPreference,
  reconcileGoalReminder,
} from '../src/features/notifications/services/notification-scheduler';
import {
  EXPO_ANDROID_IMPORTANCE,
  PUSH_CHANNELS,
} from '../src/features/notifications/services/notification-channels';
import {
  createLegacyEngineAdapter,
  createPermissionGate,
} from '../src/features/notifications/services/notification-engine-adapter';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_IDS,
  notificationService,
  setNotificationEngine,
} from '../src/services/notificationService';

const goalSchedule = (goal: Record<string, unknown>) => ({ goal });

function setup(permission = GRANTED, envOverrides: Parameters<typeof createEnv>[0] = {}) {
  const native = createFakeNative({ permission });
  const env = createEnv(envOverrides);
  return { native, env, deps: { native, env } };
}

describe('Goal reminders: consent', () => {
  it('schedules nothing by default (no goal preference exists in current settings)', async () => {
    const { native, deps } = setup();
    const result = await reconcileGoalReminder(deps, { masterEnabled: true, schedule: {} });
    assert.deepEqual(result, { action: 'cancelled', reason: 'preference-disabled' });
    assert.equal(native.count('scheduleNotificationAsync'), 0);
    assert.equal(native.scheduled.size, 0);
  });

  it('requires the preference to be strictly boolean true', async () => {
    const { native, deps } = setup();
    for (const enabled of ['true', 1, 'yes', {}, [], null, undefined]) {
      await reconcileGoalReminder(deps, { masterEnabled: true, schedule: goalSchedule({ enabled }) });
    }
    assert.equal(native.count('scheduleNotificationAsync'), 0);
  });

  it('does not schedule, and removes an existing reminder, when the master switch is off', async () => {
    const { native, deps } = setup();
    await reconcileGoalReminder(deps, { masterEnabled: true, schedule: goalSchedule({ enabled: true }) });
    assert.equal(native.scheduled.size, 1);

    const result = await reconcileGoalReminder(deps, {
      masterEnabled: false,
      schedule: goalSchedule({ enabled: true }),
    });
    assert.deepEqual(result, { action: 'cancelled', reason: 'master-disabled' });
    assert.equal(native.scheduled.size, 0);
  });

  it('does not schedule when the user switched the goal reminder off', async () => {
    const { native, deps } = setup();
    await reconcileGoalReminder(deps, { masterEnabled: true, schedule: goalSchedule({ enabled: true }) });
    const result = await reconcileGoalReminder(deps, {
      masterEnabled: true,
      schedule: goalSchedule({ enabled: false }),
    });
    assert.deepEqual(result, { action: 'cancelled', reason: 'preference-disabled' });
    assert.equal(native.scheduled.size, 0);
  });

  it('does not schedule while notification permission is denied or undetermined', async () => {
    for (const permission of [DENIED, UNDETERMINED]) {
      const { native, deps } = setup(permission);
      const result = await reconcileGoalReminder(deps, {
        masterEnabled: true,
        schedule: goalSchedule({ enabled: true }),
      });
      assert.deepEqual(result, { action: 'skipped', reason: 'permission-not-granted' });
      assert.equal(native.count('scheduleNotificationAsync'), 0);
      assert.equal(native.count('requestPermissionsAsync'), 0, 'scheduling must never prompt');
    }
  });

  it('removes a scheduled reminder if permission is later revoked', async () => {
    const { native, deps } = setup();
    await reconcileGoalReminder(deps, { masterEnabled: true, schedule: goalSchedule({ enabled: true }) });
    native.permission = DENIED;
    await reconcileGoalReminder(deps, { masterEnabled: true, schedule: goalSchedule({ enabled: true }) });
    assert.equal(native.scheduled.size, 0);
  });

  it('skips unsupported platforms without touching the scheduler', async () => {
    const { native, deps } = setup(GRANTED, { platform: 'web' });
    const result = await reconcileGoalReminder(deps, {
      masterEnabled: true,
      schedule: goalSchedule({ enabled: true }),
    });
    assert.deepEqual(result, { action: 'skipped', reason: 'unsupported-platform' });
    assert.equal(native.count('scheduleNotificationAsync'), 0);
  });
});

describe('Goal reminders: scheduling', () => {
  it('schedules a daily reminder on the goal channel with a fixed identifier', async () => {
    const { native, deps } = setup();
    const result = await reconcileGoalReminder(deps, {
      masterEnabled: true,
      schedule: goalSchedule({ enabled: true, time: '07:30' }),
    });

    assert.deepEqual(result, { action: 'scheduled' });
    const request = native.scheduled.get(GOAL_REMINDER_ID);
    assert.ok(request);
    assert.deepEqual(request.trigger, { type: 'daily', hour: 7, minute: 30, channelId: PUSH_CHANNELS.GOAL });
    assert.equal(request.content.data?.kind, 'goal');
    assert.equal(request.content.data?.scheduledTz, 'Asia/Kolkata');
  });

  it('uses the default evening time when none is stored', async () => {
    const { native, deps } = setup();
    await reconcileGoalReminder(deps, { masterEnabled: true, schedule: goalSchedule({ enabled: true }) });
    assert.deepEqual(native.scheduled.get(GOAL_REMINDER_ID)?.trigger, {
      type: 'daily',
      hour: 18,
      minute: 0,
      channelId: PUSH_CHANNELS.GOAL,
    });
    assert.equal(DEFAULT_GOAL_REMINDER_TIME, '18:00');
  });

  it('supports weekly reminders (Sunday = 1)', async () => {
    const { native, deps } = setup();
    await reconcileGoalReminder(deps, {
      masterEnabled: true,
      schedule: goalSchedule({ enabled: true, time: '9:15 AM', frequency: 'weekly', weekday: 7 }),
    });
    assert.deepEqual(native.scheduled.get(GOAL_REMINDER_ID)?.trigger, {
      type: 'weekly',
      weekday: 7,
      hour: 9,
      minute: 15,
      channelId: PUSH_CHANNELS.GOAL,
    });
  });

  it('does not put personal data in the notification content', async () => {
    const { native, deps } = setup();
    await reconcileGoalReminder(deps, { masterEnabled: true, schedule: goalSchedule({ enabled: true }) });
    const request = native.scheduled.get(GOAL_REMINDER_ID);
    assert.ok(request);
    const serialized = JSON.stringify(request.content);
    assert.doesNotMatch(serialized, /@|userId|email|weight|kg/i);
  });

  it('prevents duplicates: repeated reconciles leave exactly one reminder and do not reschedule it', async () => {
    const { native, deps } = setup();
    const input = { masterEnabled: true, schedule: goalSchedule({ enabled: true, time: '18:00' }) };

    assert.deepEqual(await reconcileGoalReminder(deps, input), { action: 'scheduled' });
    assert.deepEqual(await reconcileGoalReminder(deps, input), { action: 'unchanged' });
    assert.deepEqual(await reconcileGoalReminder(deps, input), { action: 'unchanged' });

    assert.equal(native.scheduled.size, 1);
    assert.equal(native.count('scheduleNotificationAsync'), 1, 'an up-to-date reminder must not be rewritten');
  });

  it('prevents duplicates under concurrent reconciles (foreground + settings change)', async () => {
    const { native, deps } = setup();
    const input = { masterEnabled: true, schedule: goalSchedule({ enabled: true }) };

    const results = await Promise.all(Array.from({ length: 6 }, () => reconcileGoalReminder(deps, input)));

    assert.equal(native.scheduled.size, 1);
    assert.equal(native.count('scheduleNotificationAsync'), 1);
    assert.equal(results.filter((r) => r.action === 'scheduled').length, 1);
    assert.equal(results.filter((r) => r.action === 'unchanged').length, 5);
  });

  it('replaces (never adds) when the time changes', async () => {
    const { native, deps } = setup();
    await reconcileGoalReminder(deps, { masterEnabled: true, schedule: goalSchedule({ enabled: true, time: '18:00' }) });
    const result = await reconcileGoalReminder(deps, {
      masterEnabled: true,
      schedule: goalSchedule({ enabled: true, time: '20:45' }),
    });

    assert.deepEqual(result, { action: 'rescheduled' });
    assert.equal(native.scheduled.size, 1);
    assert.deepEqual(native.scheduled.get(GOAL_REMINDER_ID)?.trigger, {
      type: 'daily',
      hour: 20,
      minute: 45,
      channelId: PUSH_CHANNELS.GOAL,
    });
  });

  it('replaces when switching between daily and weekly', async () => {
    const { native, deps } = setup();
    await reconcileGoalReminder(deps, { masterEnabled: true, schedule: goalSchedule({ enabled: true }) });
    const result = await reconcileGoalReminder(deps, {
      masterEnabled: true,
      schedule: goalSchedule({ enabled: true, frequency: 'weekly', weekday: 3 }),
    });
    assert.equal(result.action, 'rescheduled');
    assert.equal(native.scheduled.size, 1);
    assert.equal(native.scheduled.get(GOAL_REMINDER_ID)?.trigger.type, 'weekly');
  });

  it('re-arms the reminder when the device timezone changes', async () => {
    const { native, env, deps } = setup();
    const input = { masterEnabled: true, schedule: goalSchedule({ enabled: true, time: '18:00' }) };
    await reconcileGoalReminder(deps, input);

    env.timeZone = 'America/New_York'; // user travels / changes timezone
    const result = await reconcileGoalReminder(deps, input);

    assert.deepEqual(result, { action: 'rescheduled' });
    assert.equal(native.scheduled.size, 1);
    assert.equal(native.scheduled.get(GOAL_REMINDER_ID)?.content.data?.scheduledTz, 'America/New_York');
    // Wall-clock time is preserved: 18:00 local, wherever the user is.
    assert.equal((native.scheduled.get(GOAL_REMINDER_ID)?.trigger as { hour: number }).hour, 18);
  });

  it('skips (and removes) a reminder that would fire during quiet hours', async () => {
    const { native, deps } = setup();
    const quietHours = { enabled: true, startTime: '23:00', endTime: '06:00' };

    const late = await reconcileGoalReminder(deps, {
      masterEnabled: true,
      schedule: goalSchedule({ enabled: true, time: '23:30' }),
      quietHours,
    });
    assert.deepEqual(late, { action: 'skipped', reason: 'in-quiet-hours' });
    assert.equal(native.scheduled.size, 0);

    const evening = await reconcileGoalReminder(deps, {
      masterEnabled: true,
      schedule: goalSchedule({ enabled: true, time: '18:00' }),
      quietHours,
    });
    assert.deepEqual(evening, { action: 'scheduled' });

    const movedIntoQuiet = await reconcileGoalReminder(deps, {
      masterEnabled: true,
      schedule: goalSchedule({ enabled: true, time: '05:00' }),
      quietHours,
    });
    assert.equal(movedIntoQuiet.action, 'skipped');
    assert.equal(native.scheduled.size, 0, 'a stale reminder must not survive a move into quiet hours');
  });

  it('refuses an invalid stored time instead of silently falling back to 07:00', async () => {
    const { native, deps } = setup();
    for (const time of ['banana', '25:00', '7:5', '', 123, null]) {
      const result = await reconcileGoalReminder(deps, {
        masterEnabled: true,
        schedule: goalSchedule({ enabled: true, time }),
      });
      assert.deepEqual(result, { action: 'skipped', reason: 'invalid-time' }, JSON.stringify(time));
    }
    assert.equal(native.count('scheduleNotificationAsync'), 0);
  });

  it('contains scheduler failures instead of throwing into the app', async () => {
    const { native, deps } = setup();
    native.getAllScheduledNotificationsAsync = async () => {
      throw new Error('scheduler unavailable');
    };
    const result = await reconcileGoalReminder(deps, {
      masterEnabled: true,
      schedule: goalSchedule({ enabled: true }),
    });
    assert.deepEqual(result, { action: 'skipped', reason: 'error' });
  });

  it('keeps working after a failed reconcile (the queue is not poisoned)', async () => {
    const { native, deps } = setup();
    const original = native.getAllScheduledNotificationsAsync;
    native.getAllScheduledNotificationsAsync = async () => {
      throw new Error('transient');
    };
    await reconcileGoalReminder(deps, { masterEnabled: true, schedule: goalSchedule({ enabled: true }) });
    native.getAllScheduledNotificationsAsync = original;
    const result = await reconcileGoalReminder(deps, { masterEnabled: true, schedule: goalSchedule({ enabled: true }) });
    assert.deepEqual(result, { action: 'scheduled' });
  });
});

describe('Goal reminders: cancellation', () => {
  it('cancels a scheduled reminder', async () => {
    const { native, deps } = setup();
    await reconcileGoalReminder(deps, { masterEnabled: true, schedule: goalSchedule({ enabled: true }) });
    await cancelGoalReminder(deps);
    assert.equal(native.scheduled.size, 0);
    assert.deepEqual(native.cancelled, [GOAL_REMINDER_ID]);
  });

  it('is safe when nothing is scheduled or the native call throws', async () => {
    const { native, deps } = setup();
    native.cancelScheduledNotificationAsync = async () => {
      throw new Error('not found');
    };
    await assert.doesNotReject(() => cancelGoalReminder(deps));
  });
});

describe('Reminder helpers', () => {
  it('normalizes valid times and rejects invalid ones', () => {
    assert.equal(normalizeReminderTime('07:00'), '07:00');
    assert.equal(normalizeReminderTime('7:00'), '07:00');
    assert.equal(normalizeReminderTime('23:59'), '23:59');
    assert.equal(normalizeReminderTime('12:00 AM'), '00:00');
    assert.equal(normalizeReminderTime('12:30 PM'), '12:30');
    assert.equal(normalizeReminderTime('7:05 pm'), '19:05');
    for (const bad of ['24:00', '13:00 PM', '0:30 AM', '7:60', 'noon', '7', '', null, undefined, 700]) {
      assert.equal(normalizeReminderTime(bad), null, `${String(bad)}`);
    }
  });

  it('reads the goal preference defensively', () => {
    assert.deepEqual(readGoalReminderPreference(undefined), {
      enabled: false,
      time: '18:00',
      frequency: 'daily',
      weekday: 2,
    });
    assert.deepEqual(readGoalReminderPreference({ goal: 'nope' }).enabled, false);
    assert.deepEqual(readGoalReminderPreference({ goal: { enabled: true, frequency: 'hourly', weekday: 9 } }), {
      enabled: true,
      time: '18:00',
      frequency: 'daily',
      weekday: 2,
    });
    assert.equal(readGoalReminderPreference({ goal: { enabled: true, time: 'x' } }).time, null);
  });
});

describe('Existing workout/hydration reminders running through the engine adapter', () => {
  afterEach(() => setNotificationEngine(null));

  const install = (permission = GRANTED) => {
    const native = createFakeNative({ permission });
    const env = createEnv();
    setNotificationEngine(createLegacyEngineAdapter({ native, gate: createPermissionGate(native, env, { ttlMs: 0 }) }));
    return { native, env };
  };

  it('initializes channels with canonical importance and a normalized foreground handler, without prompting', async () => {
    const { native } = install(UNDETERMINED);
    await notificationService.initializeNotifications();

    assert.equal(native.channels.get(NOTIFICATION_CHANNELS.WORKOUT)?.importance, EXPO_ANDROID_IMPORTANCE.HIGH);
    assert.equal(native.channels.get(NOTIFICATION_CHANNELS.WATER)?.importance, EXPO_ANDROID_IMPORTANCE.DEFAULT);
    assert.equal(native.channels.get(NOTIFICATION_CHANNELS.SYSTEM)?.importance, EXPO_ANDROID_IMPORTANCE.LOW);
    assert.equal(native.count('requestPermissionsAsync'), 0, 'app start must never show the permission prompt');

    const behavior = await native.handler?.handleNotification({ request: { identifier: 'x', content: {} } });
    assert.equal(behavior?.shouldShowBanner, true);
    assert.equal(behavior?.shouldShowList, true);
  });

  it('schedules nothing until the user has granted permission (no reminders without consent)', async () => {
    for (const permission of [UNDETERMINED, DENIED]) {
      const { native } = install(permission);
      await notificationService.reconcileNotificationSchedules({ notificationsEnabled: true, schedule: {} });
      assert.equal(native.scheduled.size, 0);
    }
  });

  it('schedules workout and hydration reminders once permission is granted', async () => {
    const { native } = install(GRANTED);
    await notificationService.reconcileNotificationSchedules({ notificationsEnabled: true, schedule: {} });

    assert.ok(native.scheduled.has(NOTIFICATION_IDS.WORKOUT));
    // Default hydration window: every 2 hours from 08:00 to 20:00 inclusive.
    const water = [...native.scheduled.keys()].filter((id) => id.startsWith(NOTIFICATION_IDS.WATER_PREFIX));
    assert.equal(water.length, 7);
    assert.deepEqual(native.scheduled.get(NOTIFICATION_IDS.WORKOUT)?.trigger, {
      type: 'daily',
      hour: 7,
      minute: 0,
      channelId: NOTIFICATION_CHANNELS.WORKOUT,
    });
  });

  it('prevents duplicate reminders across repeated reconciles', async () => {
    const { native } = install(GRANTED);
    for (let i = 0; i < 4; i++) {
      await notificationService.reconcileNotificationSchedules({ notificationsEnabled: true, schedule: {} });
    }
    assert.equal(native.scheduled.size, 8, '1 workout + 7 hydration, never more');
  });

  it('respects disabled preferences', async () => {
    const { native } = install(GRANTED);
    await notificationService.reconcileNotificationSchedules({
      notificationsEnabled: true,
      schedule: {
        workout: { enabled: false, time: '07:00' },
        water: { enabled: false, intervalHours: 2, startTime: '08:00', endTime: '20:00' },
      },
    });
    assert.equal(native.scheduled.size, 0);
  });

  it('cancels every reminder (including goal reminders) when the master switch is turned off', async () => {
    const { native, env } = install(GRANTED);
    await notificationService.reconcileNotificationSchedules({ notificationsEnabled: true, schedule: {} });
    await reconcileGoalReminder(
      { native, env },
      { masterEnabled: true, schedule: goalSchedule({ enabled: true }) },
    );
    assert.equal(native.scheduled.size, 9);

    await notificationService.reconcileNotificationSchedules({ notificationsEnabled: false, schedule: {} });
    assert.equal(native.scheduled.size, 0);
  });

  it("keeps the service's own scheduling semantics for custom preferences (times, interval, quiet hours)", async () => {
    const { native } = install(GRANTED);
    await notificationService.reconcileNotificationSchedules({
      notificationsEnabled: true,
      schedule: {
        workout: { enabled: true, time: '06:30' },
        water: { enabled: true, intervalHours: 4, startTime: '09:00', endTime: '17:00' },
        quietHours: { enabled: true, startTime: '12:00', endTime: '14:00' },
      },
    });

    const triggers = (prefix: string) =>
      [...native.scheduled.entries()]
        .filter(([id]) => id.startsWith(prefix))
        .map(([, request]) => request.trigger as { hour: number; minute: number })
        .map((t) => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`)
        .sort();

    assert.deepEqual(triggers(NOTIFICATION_IDS.WORKOUT), ['06:30']);
    // 09:00, 13:00 (inside quiet hours 12:00-14:00 -> skipped), 17:00
    assert.deepEqual(triggers(NOTIFICATION_IDS.WATER_PREFIX), ['09:00', '17:00']);
    for (const request of native.scheduled.values()) {
      assert.equal(request.trigger.type, 'daily');
    }
  });

  it('does not re-create reminders for a signed-out device when the app returns to the foreground', async () => {
    const native = createFakeNative({ permission: GRANTED });
    const env = createEnv();
    let signedIn = true;
    setNotificationEngine(
      createLegacyEngineAdapter({
        native,
        gate: createPermissionGate(native, env, { ttlMs: 0, isSignedIn: () => signedIn }),
      }),
    );
    const reconcile = () =>
      notificationService.reconcileNotificationSchedules({ notificationsEnabled: true, schedule: {} });

    await reconcile();
    assert.equal(native.scheduled.size, 8);

    // Logout cleanup runs, then the user is signed out.
    signedIn = false;
    await notificationService.cancelAllFitOnusReminders();
    assert.equal(native.scheduled.size, 0);

    // AppShell's existing AppState handler reconciles on the next foreground.
    await reconcile();
    assert.equal(native.scheduled.size, 0, 'logout cleanup must not be undone by the next foreground reconcile');

    signedIn = true;
    await reconcile();
    assert.equal(native.scheduled.size, 8, 'signing in again restores the reminders');
  });

  it('cancelAllFitOnusReminders (used on logout) removes every scheduled reminder', async () => {
    const { native, env } = install(GRANTED);
    await notificationService.reconcileNotificationSchedules({ notificationsEnabled: true, schedule: {} });
    await reconcileGoalReminder(
      { native, env },
      { masterEnabled: true, schedule: goalSchedule({ enabled: true }) },
    );

    await notificationService.cancelAllFitOnusReminders();
    assert.equal(native.scheduled.size, 0);
  });
});
