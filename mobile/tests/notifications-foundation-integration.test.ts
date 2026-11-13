import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BLOCKED,
  DENIED,
  GRANTED,
  UNDETERMINED,
  VALID_TOKEN,
  createEnv,
  createFakeHttp,
  createFakeNative,
  createMemoryStore,
} from './helpers/fake-notifications-native';
import { createReconcileScheduler } from '../src/features/notifications/services/notification-reconcile';
import { getPermissionCardModel } from '../src/features/notifications/services/notification-permission-card';
import { createNotificationCoordinator } from '../src/features/notifications/services/notification-coordinator';
import { createPushRegistrationApi } from '../src/features/notifications/services/notification-api';
import { PUSH_CHANNELS } from '../src/features/notifications/services/notification-channels';
import { NOTIFICATION_CHANNELS } from '../src/services/notificationService';
import type { NotificationPermissionState } from '../src/features/notifications/types/push';

const repoFile = (relative: string) => new URL(`../${relative}`, import.meta.url);
const read = (relative: string) => fs.readFileSync(fileURLToPath(repoFile(relative)), 'utf8');

function fakeTimers() {
  let next = 1;
  const pending = new Map<number, { callback: () => void; ms: number }>();
  return {
    setTimer: (callback: () => void, ms: number) => {
      const id = next++;
      pending.set(id, { callback, ms });
      return id;
    },
    clearTimer: (handle: unknown) => {
      pending.delete(handle as number);
    },
    /** Fire every pending timer, like the debounce window elapsing. */
    fire: () => {
      const due = [...pending.values()];
      pending.clear();
      due.forEach((timer) => timer.callback());
    },
    count: () => pending.size,
    lastDelay: () => [...pending.values()].at(-1)?.ms,
  };
}

describe('Reminder reconcile scheduler', () => {
  it('collapses a burst of requests into a single debounced run', async () => {
    const timers = fakeTimers();
    let runs = 0;
    const scheduler = createReconcileScheduler({
      reconcile: async () => {
        runs += 1;
      },
      debounceMs: 250,
      ...timers,
    });

    for (let i = 0; i < 6; i++) scheduler.request();
    assert.equal(timers.count(), 1, 'only one debounce timer may be pending');
    assert.equal(timers.lastDelay(), 250);
    assert.equal(runs, 0, 'nothing runs before the debounce window elapses');

    timers.fire();
    await scheduler.idle();
    assert.equal(runs, 1);
  });

  it('never runs two reconciles at once and coalesces mid-run requests into ONE trailing run', async () => {
    const timers = fakeTimers();
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    let release: () => void = () => {};
    const scheduler = createReconcileScheduler({
      reconcile: async () => {
        runs += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (runs === 1) await new Promise<void>((resolve) => (release = resolve));
        active -= 1;
      },
      ...timers,
    });

    scheduler.request();
    timers.fire(); // run #1 starts and blocks
    scheduler.request();
    timers.fire(); // arrives mid-run
    scheduler.request();
    timers.fire(); // another mid-run request
    release();
    await scheduler.idle();

    assert.equal(maxActive, 1, 'reconciles must never overlap');
    assert.equal(runs, 2, 'two mid-run requests produce exactly one trailing run with fresh state');
  });

  it('cancel() drops a pending run and a queued trailing run (logout)', async () => {
    const timers = fakeTimers();
    let runs = 0;
    let release: () => void = () => {};
    const scheduler = createReconcileScheduler({
      reconcile: async () => {
        runs += 1;
        if (runs === 1) await new Promise<void>((resolve) => (release = resolve));
      },
      ...timers,
    });

    scheduler.request();
    scheduler.cancel();
    assert.equal(timers.count(), 0);
    timers.fire();
    await scheduler.idle();
    assert.equal(runs, 0, 'a cancelled request must never run');

    scheduler.request();
    timers.fire(); // run #1 in flight
    scheduler.request();
    timers.fire(); // queues a trailing run
    scheduler.cancel(); // user logs out
    release();
    await scheduler.idle();
    assert.equal(runs, 1, 'the trailing run must be dropped');
  });

  it('swallows reconcile failures and keeps serving later requests', async () => {
    const timers = fakeTimers();
    let runs = 0;
    const scheduler = createReconcileScheduler({
      reconcile: async () => {
        runs += 1;
        if (runs === 1) throw new Error('native scheduler unavailable');
      },
      ...timers,
    });

    scheduler.request();
    timers.fire();
    await assert.doesNotReject(() => scheduler.idle());
    scheduler.request();
    timers.fire();
    await scheduler.idle();
    assert.equal(runs, 2);
  });

  it('works with real timers', async () => {
    let runs = 0;
    const scheduler = createReconcileScheduler({
      reconcile: async () => {
        runs += 1;
      },
      debounceMs: 15,
    });
    scheduler.request();
    scheduler.request();
    await new Promise((resolve) => setTimeout(resolve, 60));
    await scheduler.idle();
    assert.equal(runs, 1);
  });
});

describe('Settings → Notifications permission card model', () => {
  const state = (overrides: Partial<NotificationPermissionState>): NotificationPermissionState => ({
    status: 'undetermined',
    granted: false,
    canAskAgain: true,
    requiresSystemSettings: false,
    ...overrides,
  });

  it('shows nothing while unknown, granted or unsupported', () => {
    assert.equal(getPermissionCardModel(null), null);
    assert.equal(getPermissionCardModel(state({ status: 'granted', granted: true })), null);
    assert.equal(getPermissionCardModel(state({ status: 'unsupported', canAskAgain: false })), null);
  });

  it('offers an explicit "Enable notifications" action before the user was ever asked', () => {
    assert.deepEqual(getPermissionCardModel(state({ status: 'undetermined' })), {
      title: 'Notifications are off',
      body: 'Allow notifications to get your workout and hydration reminders on this device.',
      actionLabel: 'Enable notifications',
      action: 'enable',
    });
  });

  it('still offers the prompt after a first denial that the OS lets us repeat', () => {
    const model = getPermissionCardModel(state({ status: 'denied', canAskAgain: true }));
    assert.equal(model?.action, 'enable');
  });

  it('sends the user to system settings once the OS will no longer show the prompt', () => {
    const model = getPermissionCardModel(
      state({ status: 'denied', canAskAgain: false, requiresSystemSettings: true }),
    );
    assert.equal(model?.action, 'open-settings');
    assert.equal(model?.actionLabel, 'Open settings');
  });

  it('only ever talks about reminders, never about push delivery', () => {
    for (const model of [
      getPermissionCardModel(state({ status: 'undetermined' })),
      getPermissionCardModel(state({ status: 'denied', canAskAgain: false, requiresSystemSettings: true })),
    ]) {
      assert.doesNotMatch(`${model?.title} ${model?.body} ${model?.actionLabel}`, /push|remote|server/i);
    }
  });
});

describe('Granting permission schedules reminders before push work', () => {
  const build = (options: {
    permission: typeof GRANTED;
    promptAnswer?: typeof GRANTED;
    onPermissionGranted?: () => Promise<void> | void;
  }) => {
    const native = createFakeNative({ permission: options.permission });
    if (options.promptAnswer) native.promptAnswer = options.promptAnswer;
    const events: string[] = [];
    native.tokenImpl = async () => {
      events.push('token');
      return { type: 'android', data: VALID_TOKEN };
    };
    const coordinator = createNotificationCoordinator({
      native,
      env: createEnv(),
      api: createPushRegistrationApi({ http: createFakeHttp() }),
      store: createMemoryStore(),
      cancelLocalReminders: async () => {},
      newInstallationId: () => 'install-1',
      ...(options.onPermissionGranted
        ? {
            onPermissionGranted: async () => {
              events.push('reminders');
              await options.onPermissionGranted?.();
            },
          }
        : {}),
    });
    return { native, events, coordinator };
  };

  it('runs the reminder hook after the prompt is granted and BEFORE the push token is requested', async () => {
    const t = build({ permission: UNDETERMINED, promptAnswer: GRANTED, onPermissionGranted: () => {} });
    const result = await t.coordinator.enablePushFromUserAction('user-1');

    assert.equal(result.permission.granted, true);
    assert.deepEqual(t.events, ['reminders', 'token']);
    assert.equal(result.state.status, 'token-acquired');
  });

  it('does not run when the user declines', async () => {
    const t = build({ permission: UNDETERMINED, promptAnswer: BLOCKED, onPermissionGranted: () => {} });
    await t.coordinator.enablePushFromUserAction('user-1');
    assert.deepEqual(t.events, []);
    assert.equal(t.native.count('getDevicePushTokenAsync'), 0);
  });

  it('does not run when the prompt could not be shown and the answer stays denied', async () => {
    const t = build({ permission: DENIED, promptAnswer: DENIED, onPermissionGranted: () => {} });
    await t.coordinator.enablePushFromUserAction('user-1');
    assert.deepEqual(t.events, []);
  });

  it('a failing reminder hook never blocks push registration', async () => {
    const t = build({
      permission: UNDETERMINED,
      promptAnswer: GRANTED,
      onPermissionGranted: () => {
        throw new Error('scheduler unavailable');
      },
    });
    const result = await t.coordinator.enablePushFromUserAction('user-1');
    assert.deepEqual(t.events, ['reminders', 'token']);
    assert.equal(result.state.status, 'token-acquired');
  });

  it('is never triggered by the automatic sign-in sync (that path must not act as consent)', async () => {
    const t = build({ permission: GRANTED, onPermissionGranted: () => {} });
    await t.coordinator.syncOnAuthReady('user-1');
    assert.equal(t.events.includes('reminders'), false);
    assert.equal(t.native.count('requestPermissionsAsync'), 0);
  });
});

describe('Integration is wired as approved (static guards on the real files)', () => {
  it('only an explicit user action can request permission: no auto-request in the bridge or the hook', () => {
    const bridge = read('src/features/notifications/components/NotificationBridge.tsx');
    assert.doesNotMatch(
      bridge,
      /enablePushFromUserAction|requestNotificationPermission|requestPermissionsAsync|\.enable\(/,
      'the bridge must never prompt',
    );

    const hook = read('src/features/notifications/hooks/useNotifications.ts');
    const uses = hook.match(/enablePushFromUserAction/g) ?? [];
    assert.equal(uses.length, 1, 'the hook has exactly one prompt path');
    const enableBlock = hook.slice(hook.indexOf('const enable = useCallback'));
    assert.match(enableBlock.slice(0, enableBlock.indexOf('const openSystemSettings')), /enablePushFromUserAction/);
  });

  it('the Settings → Notifications screen requests permission only from a button press', () => {
    const screen = read('src/features/notifications/screens/NotificationPreferencesScreen.tsx');

    assert.match(screen, /useNotifications/);
    assert.match(screen, /getPermissionCardModel/);
    assert.doesNotMatch(screen, /useEffect/, 'the screen must not run effects that could prompt');
    assert.equal((screen.match(/\benable\(\)/g) ?? []).length, 1, 'exactly one call to enable()');

    const handlerStart = screen.indexOf('const handlePermissionAction');
    assert.ok(handlerStart > 0, 'press handler exists');
    const handlerEnd = screen.indexOf('\n  };', handlerStart);
    assert.ok(screen.slice(handlerStart, handlerEnd).includes('await enable()'), 'enable() lives in the press handler');
    assert.match(screen, /onPress=\{handlePermissionAction\}/);
  });

  it('keeps the existing preference controls and handlers in the screen', () => {
    const screen = read('src/features/notifications/screens/NotificationPreferencesScreen.tsx');
    for (const existing of [
      'handleMasterToggle',
      'handleCategoryToggle',
      'handleWorkoutTimeSelect',
      'handleWaterIntervalSelect',
      'handleQuietHoursToggle',
      'handleQuietWindowSelect',
      'notificationService.requestNotificationPermission',
      'updateSettingsMutation.mutate',
    ]) {
      assert.ok(screen.includes(existing), `existing logic "${existing}" must still be present`);
    }
  });

  it('AppShell mounts the headless bridge once and still renders the unmodified tab bar', () => {
    const shell = read('src/app/AppShell.tsx');
    assert.match(shell, /from '@\/features\/notifications\/components\/NotificationBridge'/);
    assert.equal((shell.match(/<NotificationBridge \/>/g) ?? []).length, 1);
    assert.equal((shell.match(/<BottomNav \/>/g) ?? []).length, 1);
    assert.match(shell, /notificationService\.initializeNotifications\(\)/, 'existing launch init is untouched');
  });

  it('logout cleanup runs before the session is torn down; account deletion cleans up after success', () => {
    const auth = read('src/features/auth/services/auth-service.ts');
    assert.match(auth, /import \{ runSessionEndCleanups \} from '\.\.\/\.\.\/notifications\/services\/notification-logout-hook'/);

    const logout = auth.slice(auth.indexOf('logout: async'), auth.indexOf('changePassword: async'));
    const cleanupAt = logout.indexOf('await runSessionEndCleanups()');
    assert.ok(cleanupAt > 0, 'logout calls the cleanup');
    assert.ok(cleanupAt < logout.indexOf('AuthRepository.logout()'), 'cleanup must run while the access token is still valid');
    assert.ok(cleanupAt < logout.indexOf('removeItem(ACCESS_TOKEN_KEY)'), 'cleanup precedes token removal');

    const del = auth.slice(auth.indexOf('deleteAccount: async'), auth.indexOf('getToken: async'));
    assert.ok(
      del.indexOf('await runSessionEndCleanups()') > del.indexOf('AuthRepository.deleteAccount(password)'),
      'a failed deletion (wrong password) must not tear down notifications',
    );
  });

  it('native config: google-services file and a default channel that does not collide with existing channel ids', () => {
    const app = JSON.parse(read('app.json')) as {
      expo: {
        android: { googleServicesFile?: string; package: string; permissions: string[] };
        plugins: (string | [string, Record<string, unknown>])[];
      };
    };
    assert.equal(app.expo.android.googleServicesFile, './google-services.json');
    assert.ok(app.expo.android.permissions.includes('android.permission.POST_NOTIFICATIONS'));

    const plugin = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications') as
      | [string, Record<string, unknown>]
      | undefined;
    assert.ok(plugin, 'expo-notifications plugin is still configured');
    assert.equal(plugin[1].defaultChannel, PUSH_CHANNELS.REMOTE);
    for (const legacy of Object.values(NOTIFICATION_CHANNELS)) {
      assert.notEqual(plugin[1].defaultChannel, legacy);
    }
  });

  it('existing channel ids are unchanged', () => {
    assert.deepEqual(NOTIFICATION_CHANNELS, {
      WORKOUT: 'workout-reminders',
      WATER: 'water-reminders',
      SYSTEM: 'system-reminders',
    });
    assert.equal(PUSH_CHANNELS.REMOTE, 'remote-updates');
  });

  const googleServicesPath = fileURLToPath(repoFile('google-services.json'));
  it(
    'the google-services.json registers the same Android package as app.json',
    { skip: !fs.existsSync(googleServicesPath) && 'google-services.json is not present (untracked local file)' },
    () => {
      const app = JSON.parse(read('app.json')) as { expo: { android: { package: string } } };
      const google = JSON.parse(read('google-services.json')) as {
        client: { client_info: { android_client_info: { package_name: string } } }[];
      };
      const packages = google.client.map((c) => c.client_info.android_client_info.package_name);
      assert.ok(packages.includes(app.expo.android.package), `${packages.join(', ')} vs ${app.expo.android.package}`);
    },
  );
});

describe('Notification small icon', () => {
  it('uses a dedicated RGBA PNG and leaves every app icon untouched', () => {
    const config = (
      JSON.parse(read('app.json')) as {
        expo: {
          icon: string;
          android: { icon: string; adaptiveIcon: Record<string, string> };
          plugins: (string | [string, Record<string, unknown>])[];
        };
      }
    ).expo;
    const plugin = config.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications') as [
      string,
      Record<string, unknown>,
    ];
    assert.equal(plugin[1].icon, './assets/images/notification-icon.png');
    assert.equal(plugin[1].color, '#208AEF');

    // Launcher, adaptive and splash icons are not part of this change.
    assert.equal(config.icon, './assets/images/icon.png');
    assert.equal(config.android.icon, './assets/images/icon.png');
    assert.equal(config.android.adaptiveIcon.foregroundImage, './assets/images/android-icon-foreground.png');
    assert.equal(config.android.adaptiveIcon.monochromeImage, './assets/images/android-icon-monochrome.png');

    // IHDR: 8-bit, colour type 6 (RGBA, so it has an alpha channel), square, at least the documented 96px.
    const png = fs.readFileSync(fileURLToPath(repoFile('assets/images/notification-icon.png')));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png[24], 8);
    assert.equal(png[25], 6);
    assert.equal(png.readUInt32BE(16), png.readUInt32BE(20));
    assert.ok(png.readUInt32BE(16) >= 96);
  });
});
